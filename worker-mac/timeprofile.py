from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Literal

SpeedTier = Literal["ultrabullet", "bullet", "blitz", "rapid", "classical", "daily", "unknown"]
TerminationKind = Literal["checkmate", "resignation", "timeout", "stalemate", "draw", "unknown"]


@dataclass
class TimeProfile:
    speed_tier: SpeedTier
    zeitnot_plies: List[int] = field(default_factory=list)
    premove_burst_plies: List[int] = field(default_factory=list)
    clock_times: Dict[int, float] = field(default_factory=dict)
    est_total_sec: Optional[float] = None


def parse_time_control(tc_str: Optional[str]) -> Tuple[SpeedTier, Optional[float]]:
    if not tc_str or tc_str.strip() in ("-", "?"):
        return "unknown", None

    tc_clean = tc_str.strip()

    # Daily formats like "1/86400" or "1/172800"
    m_daily = re.match(r"^(\d+)/(\d+)$", tc_clean)
    if m_daily:
        sec_per_move = float(m_daily.group(2))
        if sec_per_move >= 86400:
            return "daily", sec_per_move * 40.0

    # Base + Inc format "180+2"
    m_inc = re.match(r"^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)$", tc_clean)
    if m_inc:
        base = float(m_inc.group(1))
        inc = float(m_inc.group(2))
        est = base + 40.0 * inc
    else:
        # Base format "300"
        m_base = re.match(r"^(\d+(?:\.\d+)?)$", tc_clean)
        if m_base:
            base = float(m_base.group(1))
            est = base
        else:
            return "unknown", None

    if est >= 86400:
        return "daily", est
    if est >= 1800:
        return "classical", est
    if est >= 600:
        return "rapid", est
    if est >= 180:
        return "blitz", est
    if est >= 30:
        return "bullet", est
    return "ultrabullet", est


def parse_clock_time(clk_str: str) -> Optional[float]:
    parts = clk_str.strip().split(":")
    try:
        if len(parts) == 3:
            h, m, s = float(parts[0]), float(parts[1]), float(parts[2])
            return h * 3600.0 + m * 60.0 + s
        elif len(parts) == 2:
            m, s = float(parts[0]), float(parts[1])
            return m * 60.0 + s
        elif len(parts) == 1:
            return float(parts[0])
    except ValueError:
        return None
    return None


def extract_pgn_headers(pgn_str: str) -> Dict[str, str]:
    headers = {}
    for line in pgn_str.splitlines():
        line = line.strip()
        if line.startswith("[") and line.endswith("]"):
            m = re.match(r"^\[(\w+)\s+\"(.*)\"\]$", line)
            if m:
                headers[m.group(1)] = m.group(2)
    return headers


def extract_termination(pgn_str: str) -> TerminationKind:
    headers = extract_pgn_headers(pgn_str)
    result = headers.get("Result", "").strip()
    term = headers.get("Termination", "").strip().lower()

    if "checkmate" in term:
        return "checkmate"
    if "time" in term or "forfeit" in term or "timeout" in term:
        return "timeout"
    if "resign" in term or "abandon" in term:
        return "resignation"
    if "stalemate" in term or "draw" in term or "repetition" in term or "insufficient" in term:
        return "draw"

    if result in ("1-0", "0-1"):
        return "resignation"
    if result in ("1/2-1/2", "0.5-0.5"):
        return "draw"

    return "unknown"


def extract_time_profile(pgn_str: str) -> TimeProfile:
    headers = extract_pgn_headers(pgn_str)
    tc_hdr = headers.get("TimeControl")
    speed_tier, est_sec = parse_time_control(tc_hdr)

    clk_pattern = re.compile(r"\[%clk\s+([\d:\.]+)\]")
    clk_matches = list(clk_pattern.finditer(pgn_str))
    clock_times: Dict[int, float] = {}
    zeitnot_plies: List[int] = []
    premove_burst_plies: List[int] = []

    last_clock = {0: None, 1: None}

    for idx, match in enumerate(clk_matches):
        ply = idx + 1
        clk_str = match.group(1)
        seconds = parse_clock_time(clk_str)
        if seconds is not None:
            clock_times[ply] = seconds
            side = (ply - 1) % 2
            prev_clk = last_clock[side]

            if seconds < 15.0:
                zeitnot_plies.append(ply)

            if prev_clk is not None:
                inc = 0.0
                if tc_hdr and "+" in tc_hdr:
                    try:
                        inc = float(tc_hdr.split("+")[1])
                    except ValueError:
                        pass
                elapsed = prev_clk - seconds + inc
                if 0.0 <= elapsed < 0.5:
                    premove_burst_plies.append(ply)

            last_clock[side] = seconds

    return TimeProfile(
        speed_tier=speed_tier,
        zeitnot_plies=zeitnot_plies,
        premove_burst_plies=premove_burst_plies,
        clock_times=clock_times,
        est_total_sec=est_sec,
    )
