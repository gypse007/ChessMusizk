from __future__ import annotations

import io
import re
import statistics
from dataclasses import dataclass
from typing import Optional, List, Dict, Tuple

import chess.pgn

try:
    from worker_mac.timecontrol import parse_timecontrol, classify_speed, TimeControl
except ImportError:
    from timecontrol import parse_timecontrol, classify_speed, TimeControl


CLK_RE = re.compile(r"\[?%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]?")
EMT_RE = re.compile(r"\[?%emt\s+(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2}(?:\.\d+)?)\]?")


def clk_seconds(comment: str) -> Optional[float]:
    if not comment:
        return None
    if m := CLK_RE.search(comment):
        hours = int(m[1])
        mins = int(m[2])
        secs = float(m[3])
        return hours * 3600.0 + mins * 60.0 + secs
    return None


def emt_seconds(comment: str) -> Optional[float]:
    if not comment:
        return None
    if m := EMT_RE.search(comment):
        h = int(m[1]) if m[1] is not None else 0
        m_val = int(m[2]) if m[2] is not None else 0
        s = float(m[3])
        return h * 3600.0 + m_val * 60.0 + s
    return None


@dataclass
class TimeProfile:
    speed: str
    pace_median_s: Optional[float] = None  # median seconds/move
    min_clock_s: Optional[float] = None
    zeitnot_count: int = 0  # moves made with <10s left
    max_single_think_s: Optional[float] = None
    flagged: bool = False  # Termination contains "time" AND last clock ≈ 0
    premove_bursts: int = 0  # negative clock deltas (increment pushed clock UP)
    clock_swing_s: float = 0.0  # max |white - black| clock gap mid-game


def infer_speed_from_pace(pace_median_s: Optional[float]) -> str:
    if pace_median_s is None:
        return "unknown"
    if pace_median_s <= 3.0:
        return "bullet"
    if pace_median_s <= 8.0:
        return "blitz"
    if pace_median_s <= 25.0:
        return "rapid"
    return "classical"


def extract_time_profile(
    pgn_str: str,
    force_speed: Optional[str] = None,
    thresholds: Optional[Dict[str, float]] = None,
) -> TimeProfile:
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    tc_raw = game.headers.get("TimeControl") if game else None
    termination = (game.headers.get("Termination") or "").lower() if game else ""

    tc = parse_timecontrol(tc_raw)
    speed = classify_speed(tc, thresholds=thresholds, force_speed=force_speed)

    if not game:
        return TimeProfile(speed=speed)

    white_clocks: List[Tuple[int, float]] = []  # (ply, clock_s)
    black_clocks: List[Tuple[int, float]] = []
    think_times: List[float] = []

    node = game
    ply = 0
    last_w_clock: Optional[float] = None
    last_b_clock: Optional[float] = None

    min_clock: Optional[float] = None
    zeitnot_count = 0
    premove_bursts = 0
    clock_swings: List[float] = []

    while node.variations:
        next_node = node.variation(0)
        ply += 1
        comment = next_node.comment or ""
        clk = clk_seconds(comment)
        emt = emt_seconds(comment)

        is_white = (ply % 2 != 0)

        if clk is not None:
            if min_clock is None or clk < min_clock:
                min_clock = clk
            if clk < 10.0:
                zeitnot_count += 1

            prev_clock = last_w_clock if is_white else last_b_clock
            if prev_clock is not None:
                # Spent time = prev_clock - cur_clock (or considering increment)
                raw_delta = prev_clock - clk
                if raw_delta < 0:
                    premove_bursts += 1
                spent = prev_clock + tc.increment - clk
                think_times.append(max(0.0, spent if spent >= 0 else 0.0))

            if is_white:
                last_w_clock = clk
                white_clocks.append((ply, clk))
            else:
                last_b_clock = clk
                black_clocks.append((ply, clk))

            if last_w_clock is not None and last_b_clock is not None:
                clock_swings.append(abs(last_w_clock - last_b_clock))
        elif emt is not None:
            think_times.append(emt)

        node = next_node

    pace_median = statistics.median(think_times) if think_times else None
    max_think = max(think_times) if think_times else None
    max_clock_swing = max(clock_swings) if clock_swings else 0.0

    # Flag check: termination mentions "time" and min_clock <= 1.0 or last mover ran out
    flagged = ("time" in termination) and (min_clock is not None and min_clock <= 1.0)

    # Pace inference fallback if speed is "unknown"
    if speed == "unknown" and pace_median is not None:
        speed = infer_speed_from_pace(pace_median)

    return TimeProfile(
        speed=speed,
        pace_median_s=pace_median,
        min_clock_s=min_clock,
        zeitnot_count=zeitnot_count,
        max_single_think_s=max_think,
        flagged=flagged,
        premove_bursts=premove_bursts,
        clock_swing_s=max_clock_swing,
    )
