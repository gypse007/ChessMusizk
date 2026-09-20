from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, Any


@dataclass(frozen=True)
class TimeControl:
    raw: str
    base_seconds: Optional[float] = None  # None = unknown
    increment: float = 0.0
    delay: float = 0.0
    periods: Optional[Tuple[Tuple[int, float], ...]] = None  # classical "40/7200:20/900"
    per_move_days: Optional[float] = None  # daily "1/86400"

    @property
    def est_total_seconds(self) -> float:
        return (self.base_seconds or 0.0) + 40.0 * self.increment  # 40-move assumption


DEFAULT_THRESHOLDS = {
    "ultrabullet_base": 30.0,
    "bullet_est": 180.0,
    "blitz_est": 600.0,
    "rapid_est": 3600.0,
}


def parse_timecontrol(raw: Optional[str]) -> TimeControl:
    if not raw or raw.strip() in ("-", "?", ""):
        return TimeControl(raw or "-")
    raw = raw.strip()

    # "1/86400" or "40/9000"
    if m := re.fullmatch(r"(\d+)/(\d+)", raw):
        moves, secs = int(m[1]), int(m[2])
        if secs >= 86400:
            return TimeControl(raw, per_move_days=secs / 86400.0)
        return TimeControl(raw, periods=((moves, float(secs)),))

    # "40/7200+30:20/900+30" (FIDE SCD)
    if "/" in raw:
        periods = []
        inc = 0.0
        for part in raw.split(":"):
            pm = re.fullmatch(r"(\d+)/(\d+)(?:\+(\d+))?", part)
            if not pm:
                return TimeControl(raw)  # malformed -> unknown
            periods.append((int(pm[1]), float(pm[2])))
            inc += float(pm[3] or 0)
        return TimeControl(raw, periods=tuple(periods), increment=inc)

    # "600", "600+5", "30"
    if m := re.fullmatch(r"(\d+)(?:\+(\d+))?", raw):
        return TimeControl(raw, base_seconds=float(m[1]), increment=float(m[2] or 0))

    return TimeControl(raw)  # unknown


def classify_speed(
    tc: TimeControl,
    thresholds: Optional[Dict[str, float]] = None,
    force_speed: Optional[str] = None,
) -> str:
    if force_speed:
        return force_speed

    t = DEFAULT_THRESHOLDS.copy()
    if thresholds:
        t.update(thresholds)

    if tc.per_move_days:
        return "daily"
    if tc.periods:
        return "classical"
    if tc.base_seconds is None:
        return "unknown"
    if tc.base_seconds <= t["ultrabullet_base"]:
        return "ultrabullet"

    est = tc.est_total_seconds
    if est < t["bullet_est"]:
        return "bullet"
    if est < t["blitz_est"]:
        return "blitz"
    if est <= t["rapid_est"]:
        return "rapid"

    return "classical"
