from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional, Dict, Tuple

try:
    from worker_mac.c2m_types import Anchor, AnchorIntent, AnchorKind, EventGraph, SoundtrackSpec, MoveNode
    from worker_mac.timecontrol import TimeControl, parse_timecontrol, classify_speed
    from worker_mac.timeprofile import TimeProfile, extract_time_profile
except ImportError:
    from c2m_types import Anchor, AnchorIntent, AnchorKind, EventGraph, SoundtrackSpec, MoveNode
    from timecontrol import TimeControl, parse_timecontrol, classify_speed
    from timeprofile import TimeProfile, extract_time_profile


Phase = Literal["opening", "middlegame", "endgame"]


@dataclass(frozen=True)
class StyleProfile:
    bpm: Tuple[int, int]
    style: str
    arc: str
    negative: str  # customized per tier -- bullet deliberately omits "no EDM"


STYLE_PROFILES: Dict[str, StyleProfile] = {
    "ultrabullet": StyleProfile(
        (132, 142),
        "glitch percussion, screaming lead synth, sub-bass drops, hyperdrive tempo",
        "flat-out sprint, constant drops, zero development",
        "no slow tempo, no orchestral",
    ),
    "bullet": StyleProfile(
        (124, 132),
        "energetic synth bass, euphoric supersaw chords, four-on-the-floor, pluck leads, festival drive",
        "drop arrives in the first section; build-drop-build",
        "no ballad, no ambient intro, no orchestra",
    ),
    "blitz": StyleProfile(
        (110, 124),
        "hybrid electronic-orchestral: staccato strings over synth pulse, trailer brass hits",
        "driving build, tension stacks, hybrid drop",
        "no lo-fi, no jazz",
    ),
    "rapid": StyleProfile(
        (72, 96),
        "intimate cinematic orchestral: felt piano, cello, warm strings",
        "slow arc, rising spiccato tension, reflective resolve",
        "no EDM, no four-on-the-floor",
    ),
    "classical": StyleProfile(
        (60, 84),
        "felt piano intro, cello lead, string swells, timpani",
        "long-form arch: quiet opening, long tension rise, late climax",
        "no EDM, no electronic drums",
    ),
    "daily": StyleProfile(
        (60, 80),
        "thoughtful felt piano, expansive ambient pads, subtle string warmth",
        "contemplative arc, gentle movement, spacious resolution",
        "no EDM, no heavy drums",
    ),
    "unknown": StyleProfile(
        (96, 112),
        "neutral cinematic hybrid",
        "moderate arc",
        "",
    ),
}


BASE_NEGATIVE_PROMPT = "no vocals, no lyrics"


def get_negative_prompt_for_style(style_key: str) -> str:
    profile = STYLE_PROFILES.get(style_key, STYLE_PROFILES["unknown"])
    if profile.negative:
        return f"{BASE_NEGATIVE_PROMPT}, {profile.negative}"
    return BASE_NEGATIVE_PROMPT


def pick_bpm(p: StyleProfile, pace_median_s: Optional[float]) -> int:
    lo, hi = p.bpm
    if pace_median_s is None:
        return (lo + hi) // 2
    t = max(0.0, min(1.0, (8.0 - pace_median_s) / 7.0))  # faster pace -> higher BPM
    return round(lo + (hi - lo) * t)


def _classify_phase(total_plies: int, ply: int) -> Phase:
    ratio = ply / max(total_plies, 1)
    if ratio < 0.25:
        return "opening"
    if ratio < 0.7:
        return "middlegame"
    return "endgame"


def event_graph_to_spec(
    graph: EventGraph,
    pgn_str: Optional[str] = None,
    time_profile: Optional[TimeProfile] = None,
) -> SoundtrackSpec:
    if time_profile is None and pgn_str:
        time_profile = extract_time_profile(pgn_str)

    if time_profile:
        speed_key = time_profile.speed
    else:
        time_cat = getattr(graph, "timeCategory", None)
        time_ctrl = getattr(graph, "timeControl", None)
        if time_cat:
            speed_key = time_cat
        elif time_ctrl:
            speed_key = classify_speed(parse_timecontrol(time_ctrl))
        else:
            speed_key = "unknown"

    profile = STYLE_PROFILES.get(speed_key, STYLE_PROFILES["unknown"])

    pace_s = time_profile.pace_median_s if time_profile else None
    bpm = pick_bpm(profile, pace_s)
    negative_prompt = get_negative_prompt_for_style(speed_key)

    moves = graph.moves
    total_plies = graph.totalPlies
    target_sec = graph.targetDurationSec
    caption_parts: list[str] = []
    anchors: list[Anchor] = []

    for idx, node in enumerate(moves):
        phase = _classify_phase(total_plies, node.ply)
        if node.flags.get("queenExchange"):
            anchors.append(Anchor(ply=node.ply, kind="queen_exchange", intent="texture_drop"))
            if speed_key in ("ultrabullet", "bullet"):
                caption_parts.append("filter sweep drop buildup")
            else:
                caption_parts.append("sudden texture reduction")
        elif node.flags.get("promotion"):
            anchors.append(Anchor(ply=node.ply, kind="promotion", intent="energy_peak"))
            if speed_key in ("ultrabullet", "bullet"):
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
            if speed_key in ("ultrabullet", "bullet"):
                caption_parts.append("rhythmic sidechain accent check")
            else:
                caption_parts.append("rhythmic accent check")

    if time_profile:
        if time_profile.premove_bursts > 0:
            caption_parts.append("rapid premove bursts")
        if time_profile.zeitnot_count > 0:
            caption_parts.append("zeitnot ticking pressure")
        if time_profile.flagged:
            anchors.append(Anchor(ply=total_plies, kind="flag_fall", intent="final_cadence"))
            caption_parts.append("flag fall tape-stop power-down")

    if not anchors:
        anchors.append(Anchor(ply=total_plies, kind="checkmate", intent="final_cadence"))

    details = ", ".join(caption_parts) if caption_parts else "balanced tactical progression"
    caption = f"{profile.style}, {profile.arc}, {details}"

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
