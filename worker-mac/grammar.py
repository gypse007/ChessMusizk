from __future__ import annotations

import hashlib
from collections import Counter
from dataclasses import dataclass
from typing import Literal, Optional, Dict, Tuple, List

try:
    from worker_mac.c2m_types import Anchor, AnchorIntent, AnchorKind, EventGraph, SoundtrackSpec, MoveNode, TerminationKind
    from worker_mac.timeprofile import TimeProfile, extract_time_profile
except ImportError:
    from c2m_types import Anchor, AnchorIntent, AnchorKind, EventGraph, SoundtrackSpec, MoveNode, TerminationKind
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


ANCHOR_PRIORITY: Dict[AnchorIntent, int] = {
    "final_cadence": 0,
    "energy_peak": 1,
    "texture_drop": 2,
    "accent": 3,
    "interrupt": 4,
}
MAX_ANCHORS_PER_MIN = 10


def cap_anchors(anchors: List[Anchor], duration_sec: int) -> List[Anchor]:
    limit = max(3, (duration_sec // 60) * MAX_ANCHORS_PER_MIN)
    if len(anchors) <= limit:
        return anchors

    sorted_by_priority = sorted(anchors, key=lambda a: ANCHOR_PRIORITY.get(a.intent, 9))
    kept = sorted_by_priority[:limit]
    return sorted(kept, key=lambda a: a.ply)


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


def derive_seed_from_pgn(pgn_str: Optional[str]) -> int:
    if not pgn_str or not pgn_str.strip():
        return -1
    h = hashlib.sha256(pgn_str.encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big") & 0x7FFFFFFF


def event_graph_to_spec(
    graph: EventGraph,
    pgn_str: Optional[str] = None,
    time_profile: Optional[TimeProfile] = None,
) -> SoundtrackSpec:
    if graph.totalPlies == 0 and not graph.moves:
        raise ValueError("empty game")

    if time_profile is None and pgn_str:
        try:
            time_profile = extract_time_profile(pgn_str)
        except ValueError:
            pass

    speed_key = time_profile.speed if time_profile else "unknown"
    profile = STYLE_PROFILES.get(speed_key, STYLE_PROFILES["unknown"])

    pace_s = time_profile.pace_median_s if time_profile else None
    bpm = pick_bpm(profile, pace_s)
    negative_prompt = get_negative_prompt_for_style(speed_key)
    seed = derive_seed_from_pgn(pgn_str)

    moves = graph.moves
    total_plies = graph.totalPlies if graph.totalPlies > 0 else len(moves)
    target_sec = graph.targetDurationSec
    caption_parts: list[str] = []
    anchors: list[Anchor] = []

    for idx, node in enumerate(moves):
        if node.flags.get("queenExchange"):
            anchors.append(Anchor(ply=node.ply, kind="queen_exchange", intent="texture_drop"))
            caption_parts.append("sudden texture reduction")
        elif node.flags.get("promotion"):
            anchors.append(Anchor(ply=node.ply, kind="promotion", intent="energy_peak"))
            caption_parts.append("climax promotion")
        elif node.flags.get("passedPawnAdvance"):
            anchors.append(Anchor(ply=node.ply, kind="pawn_storm_start", intent="accent"))
            caption_parts.append("passed pawn motif rises")
        elif node.classification == "blunder" or node.evalSwing > 250:
            anchors.append(Anchor(ply=node.ply, kind="reversal", intent="interrupt"))
            caption_parts.append("dissonant stinger")
        elif node.classification == "brilliant":
            anchors.append(Anchor(ply=node.ply, kind="check", intent="energy_peak"))
            caption_parts.append("accented brilliant move")
        elif node.flags.get("check"):
            anchors.append(Anchor(ply=node.ply, kind="check", intent="accent"))
            caption_parts.append("rhythmic accent check")

    if time_profile:
        for ply in time_profile.zeitnot_plies:
            anchors.append(Anchor(ply=ply, kind="zeitnot_tick", intent="accent"))
        if time_profile.zeitnot_count > 0:
            caption_parts.append("zeitnot ticking pressure")

        for ply in time_profile.premove_burst_plies:
            anchors.append(Anchor(ply=ply, kind="premove_burst", intent="accent"))
        if time_profile.premove_bursts > 0:
            caption_parts.append("rapid premove bursts")

        for ply in time_profile.think_swell_plies:
            anchors.append(Anchor(ply=ply, kind="think_swell", intent="interrupt"))
            caption_parts.append("long think tension swell")

        if time_profile.clock_swing_ply:
            anchors.append(Anchor(ply=time_profile.clock_swing_ply, kind="clock_swing", intent="energy_peak"))
            caption_parts.append("clock advantage swing")

    # Handle termination-aware ending anchors
    term_kind = graph.termination if graph.termination != "unknown" else (
        time_profile.termination_kind if time_profile else "checkmate"
    )

    if term_kind == "resignation":
        anchors.append(Anchor(ply=total_plies, kind="resignation", intent="interrupt"))
        caption_parts.append("resignation abrupt cut")
    elif term_kind == "timeout" or (time_profile and time_profile.flagged):
        anchors.append(Anchor(ply=total_plies, kind="flag_fall", intent="final_cadence"))
        caption_parts.append("flag fall tape-stop power-down")
    elif term_kind in ("draw", "stalemate"):
        anchors.append(Anchor(ply=total_plies, kind="draw_fade", intent="final_cadence"))
        caption_parts.append("draw unresolved suspended chord fade")
    else:
        anchors.append(Anchor(ply=total_plies, kind="checkmate", intent="final_cadence"))
        caption_parts.append("checkmate resolved cadence")

    # Caption aggregation/deduplication
    if caption_parts:
        counts = Counter(caption_parts)
        details = ", ".join(f"{phrase} (x{n})" if n > 1 else phrase for phrase, n in counts.items())
    else:
        details = "balanced tactical progression"

    caption = f"{profile.style}, {profile.arc}, {details}"
    final_anchors = cap_anchors(anchors, target_sec)

    return SoundtrackSpec(
        caption=caption,
        bpm=bpm,
        durationSec=target_sec,
        seed=seed,
        instrumental=True,
        batchSize=2,
        negativePrompt=negative_prompt,
        anchors=final_anchors,
    )
