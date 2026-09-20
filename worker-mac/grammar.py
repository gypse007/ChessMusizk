from __future__ import annotations

from typing import Literal

try:
    from worker_mac.c2m_types import Anchor, AnchorIntent, AnchorKind, EventGraph, SoundtrackSpec, MoveNode
except ModuleNotFoundError:
    from c2m_types import Anchor, AnchorIntent, AnchorKind, EventGraph, SoundtrackSpec, MoveNode


Phase = Literal["opening", "middlegame", "endgame"]


import re
from dataclasses import dataclass

@dataclass(frozen=True)
class TimeControl:
    raw: str
    base_seconds: float | None = None
    increment: float = 0.0
    delay: float = 0.0
    periods: tuple[tuple[int, float], ...] | None = None
    per_move_days: float | None = None

    @property
    def est_total_seconds(self) -> float:
        return (self.base_seconds or 0) + 40 * self.increment


def parse_timecontrol(raw: str | None) -> TimeControl:
    if not raw or raw.strip() in ("-", "?", ""):
        return TimeControl(raw or "-")
    raw = raw.strip()

    if m := re.fullmatch(r"(\d+)/(\d+)", raw):
        moves, secs = int(m[1]), int(m[2])
        if secs >= 86400:
            return TimeControl(raw, per_move_days=secs / 86400)
        return TimeControl(raw, periods=((moves, float(secs)),))

    if "/" in raw:
        periods, inc = [], 0.0
        for part in raw.split(":"):
            pm = re.fullmatch(r"(\d+)/(\d+)(?:\+(\d+))?", part)
            if not pm: return TimeControl(raw)
            periods.append((int(pm[1]), float(pm[2])))
            inc += float(pm[3] or 0)
        return TimeControl(raw, periods=tuple(periods), increment=inc)

    if m := re.fullmatch(r"(\d+)(?:\+(\d+))?", raw):
        return TimeControl(raw, base_seconds=float(m[1]), increment=float(m[2] or 0))

    return TimeControl(raw)


def classify_speed(tc: TimeControl) -> str:
    if tc.per_move_days:        return "daily"
    if tc.periods:              return "classical"
    if tc.base_seconds is None: return "unknown"
    if tc.base_seconds <= 30:   return "ultrabullet"
    est = tc.est_total_seconds
    if est < 180:   return "bullet"
    if est < 600:   return "blitz"
    if est <= 3600: return "rapid"
    return "classical"


@dataclass(frozen=True)
class StyleProfile:
    bpm: tuple[int, int]
    style: str
    arc: str
    negative: str


STYLE_PROFILES = {
  "ultrabullet": StyleProfile((132, 142), "glitch percussion, screaming lead synth, sub-bass drops, hyperdrive tempo",
                              "flat-out sprint, constant drops, zero development", "no slow tempo, no orchestral"),
  "bullet":      StyleProfile((124, 132), "energetic synth bass, euphoric supersaw chords, four-on-the-floor, pluck leads, festival drive, live festival EDM anthem, main stage euphoria",
                              "drop arrives in the first section; build–drop–build", "no ballad, no ambient intro, no orchestra"),
  "blitz":       StyleProfile((110, 124), "hybrid electronic-orchestral: staccato strings over synth pulse, trailer brass hits",
                              "driving build, tension stacks, hybrid drop", "no lo-fi, no jazz"),
  "rapid":       StyleProfile((72, 96),   "intimate cinematic orchestral: felt piano, cello, warm strings",
                              "slow arc, rising spiccato tension, reflective resolve", "no EDM, no four-on-the-floor"),
  "classical":   StyleProfile((60, 84),   "felt piano intro, cello lead, string swells, timpani",
                              "long-form arch: quiet opening, long tension rise, late climax", "no EDM, no electronic drums"),
  "daily":       StyleProfile((60, 80),   "ambient cinematic acoustic, felt piano, subtle pads", "reflective steady arc", "no harsh drums"),
  "unknown":     StyleProfile((96, 112),  "neutral cinematic hybrid", "moderate arc", ""),
}


def _classify_phase(total_plies: int, ply: int) -> Phase:
    ratio = ply / max(total_plies, 1)
    if ratio < 0.25:
        return "opening"
    if ratio < 0.7:
        return "middlegame"
    return "endgame"


def event_graph_to_spec(graph: EventGraph) -> SoundtrackSpec:
    moves = graph.moves
    total_plies = graph.totalPlies
    target_sec = graph.targetDurationSec
    tc = parse_timecontrol(graph.timeControl)
    category = graph.timeCategory or classify_speed(tc)

    profile = STYLE_PROFILES.get(category, STYLE_PROFILES["unknown"])
    bpm = (profile.bpm[0] + profile.bpm[1]) // 2
    negative_prompt = profile.negative or "no vocals, no lyrics"

    caption_parts: list[str] = [profile.style, profile.arc]
    anchors: list[Anchor] = []

    for idx, node in enumerate(moves):
        phase = _classify_phase(total_plies, node.ply)

        if node.flags.get("queenExchange"):
            anchors.append(Anchor(ply=node.ply, kind="queen_exchange", intent="texture_drop"))
            if category in ("ultrabullet", "bullet"):
                caption_parts.append("filter sweep drop buildup")
            else:
                caption_parts.append("sudden texture reduction")
        elif node.flags.get("promotion"):
            anchors.append(Anchor(ply=node.ply, kind="promotion", intent="energy_peak"))
            if category in ("ultrabullet", "bullet"):
                caption_parts.append("euphoric main stage synth drop climax")
            else:
                caption_parts.append("climax crescendo")
        elif node.flags.get("passedPawnAdvance"):
            caption_parts.append("rising motif acceleration")
        elif node.classification == "blunder":
            caption_parts.append("dissonant glitch stinger")
        elif node.classification == "brilliant":
            caption_parts.append("explosive accent drop")
        elif node.flags.get("check"):
            anchors.append(Anchor(ply=node.ply, kind="check", intent="accent"))
            caption_parts.append("rhythmic sidechain accent check")

    if not anchors:
        anchors.append(Anchor(ply=total_plies, kind="checkmate", intent="final_cadence"))

    caption = ", ".join(caption_parts)
    if negative_prompt:
        caption = f"{caption}, {negative_prompt}"

    return SoundtrackSpec(
        caption=caption,
        bpm=bpm,
        durationSec=target_sec,
        seed=-1,
        instrumental=True,
        batchSize=2,
        negativePrompt=negative_prompt,
        anchors=anchors,
    )
