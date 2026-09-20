from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

CLK_RE = re.compile(r"\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]")

def clk_seconds(comment: str) -> Optional[float]:
    if m := CLK_RE.search(comment):
        return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    return None

@dataclass
class TimeProfile:
    speed: str
    pace_median_s: Optional[float] = None
    min_clock_s: Optional[float] = None
    zeitnot_count: int = 0
    max_single_think_s: Optional[float] = None
    flagged: bool = False
    premove_bursts: int = 0
    clock_swing_s: float = 0.0

def extract_time_profile(pgn_str: str) -> TimeProfile:
    tc_match = re.search(r'\[TimeControl\s+"([^"]+)"\]', pgn_str, re.I)
    raw_tc = tc_match.group(1) if tc_match else None

    try:
        from worker_mac.grammar import parse_timecontrol, classify_speed
    except ModuleNotFoundError:
        from grammar import parse_timecontrol, classify_speed
    tc = parse_timecontrol(raw_tc)
    speed = classify_speed(tc)

    clocks = [clk_seconds(c) for c in re.findall(r"\{[^}]*\}", pgn_str)]
    clocks = [c for c in clocks if c is not None]

    zeitnot = sum(1 for c in clocks if c < 10.0)
    flagged = "time" in pgn_str.lower() and len(clocks) > 0 and clocks[-1] < 2.0

    return TimeProfile(
        speed=speed,
        min_clock_s=min(clocks) if clocks else None,
        zeitnot_count=zeitnot,
        flagged=flagged,
    )
