from __future__ import annotations

import io
import re
import statistics
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple

import chess.pgn

try:
    from worker_mac.timecontrol import parse_timecontrol, classify_speed, TimeControl
    from worker_mac.c2m_types import TerminationKind
except ImportError:
    from timecontrol import parse_timecontrol, classify_speed, TimeControl
    from c2m_types import TerminationKind


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
    premove_bursts: int = 0  # negative clock deltas
    clock_swing_s: float = 0.0  # max |white - black| clock gap mid-game
    zeitnot_plies: List[int] = field(default_factory=list)
    premove_burst_plies: List[int] = field(default_factory=list)
    think_swell_plies: List[int] = field(default_factory=list)
    clock_swing_ply: Optional[int] = None
    termination_kind: TerminationKind = "unknown"


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


def parse_termination_kind(result: str, termination: str) -> TerminationKind:
    res = (result or "").strip()
    term = (termination or "").lower().strip()

    if "time" in term or "forfeit" in term:
        return "timeout"
    if "resign" in term or "abandon" in term:
        return "resignation"
    if "stalemate" in term:
        return "stalemate"
    if "draw" in term or res == "1/2-1/2":
        return "draw"
    if "checkmate" in term or "normal" in term or res in ("1-0", "0-1"):
        return "checkmate"

    return "unknown"


def extract_time_profile(
    pgn_str: str,
    force_speed: Optional[str] = None,
    thresholds: Optional[Dict[str, float]] = None,
) -> TimeProfile:
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if not game:
        raise ValueError("empty game")

    tc_raw = game.headers.get("TimeControl")
    termination_str = game.headers.get("Termination") or ""
    result_str = game.headers.get("Result") or ""

    term_kind = parse_termination_kind(result_str, termination_str)

    tc = parse_timecontrol(tc_raw)
    speed = classify_speed(tc, thresholds=thresholds, force_speed=force_speed)

    white_clocks: List[Tuple[int, float]] = []  # (ply, clock_s)
    black_clocks: List[Tuple[int, float]] = []
    think_times: List[Tuple[int, float]] = []

    node = game
    ply = 0
    last_w_clock: Optional[float] = None
    last_b_clock: Optional[float] = None

    min_clock: Optional[float] = None
    zeitnot_plies: List[int] = []
    premove_burst_plies: List[int] = []
    think_swell_plies: List[int] = []
    clock_swings: List[Tuple[int, float]] = []  # (ply, gap)

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
                zeitnot_plies.append(ply)

            prev_clock = last_w_clock if is_white else last_b_clock
            if prev_clock is not None:
                raw_delta = prev_clock - clk
                if raw_delta < 0:
                    premove_burst_plies.append(ply)
                spent = prev_clock + tc.increment - clk
                actual_spent = max(0.0, spent if spent >= 0 else 0.0)
                think_times.append((ply, actual_spent))
                if actual_spent >= 30.0:
                    think_swell_plies.append(ply)

            if is_white:
                last_w_clock = clk
                white_clocks.append((ply, clk))
            else:
                last_b_clock = clk
                black_clocks.append((ply, clk))

            if last_w_clock is not None and last_b_clock is not None:
                clock_swings.append((ply, abs(last_w_clock - last_b_clock)))
        elif emt is not None:
            think_times.append((ply, emt))
            if emt >= 30.0:
                think_swell_plies.append(ply)

        node = next_node

    if ply == 0:
        raise ValueError("empty game")

    spent_vals = [t[1] for t in think_times]
    pace_median = statistics.median(spent_vals) if spent_vals else None
    max_think = max(spent_vals) if spent_vals else None

    max_swing = 0.0
    swing_ply: Optional[int] = None
    if clock_swings:
        max_swing_tuple = max(clock_swings, key=lambda x: x[1])
        swing_ply = max_swing_tuple[0]
        max_swing = max_swing_tuple[1]

    flagged = (term_kind == "timeout") or (min_clock is not None and min_clock <= 1.0)

    if speed == "unknown" and pace_median is not None:
        speed = infer_speed_from_pace(pace_median)

    return TimeProfile(
        speed=speed,
        pace_median_s=pace_median,
        min_clock_s=min_clock,
        zeitnot_count=len(zeitnot_plies),
        max_single_think_s=max_think,
        flagged=flagged,
        premove_bursts=len(premove_burst_plies),
        clock_swing_s=max_swing,
        zeitnot_plies=zeitnot_plies,
        premove_burst_plies=premove_burst_plies,
        think_swell_plies=think_swell_plies,
        clock_swing_ply=swing_ply,
        termination_kind=term_kind,
    )
