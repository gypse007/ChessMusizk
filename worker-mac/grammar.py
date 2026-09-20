from __future__ import annotations

import hashlib
from collections import Counter
from typing import Literal, Optional, List, Dict, Any

from worker_mac.c2m_types import (
    Anchor,
    AnchorIntent,
    AnchorKind,
    EventGraph,
    SoundtrackSpec,
    SpeedTier,
    TerminationKind,
    MoveNode,
)

Phase = Literal["opening", "middlegame", "endgame"]

STYLE_PROFILES: Dict[SpeedTier, Dict[str, Any]] = {
    "ultrabullet": {
        "caption": "ultra-fast hyperpop electronic, driving synth bass, chaotic rhythmic energy, high tempo",
        "bpm": 150,
        "negative_prompt": "no vocals, no lyrics, no generic trailer braams, no acoustic guitar",
    },
    "bullet": {
        "caption": "energetic EDM synthwave, pulsing synth lead, intense driving beat, fast tension",
        "bpm": 135,
        "negative_prompt": "no vocals, no lyrics, no generic trailer braams, no acoustic guitar",
    },
    "blitz": {
        "caption": "hybrid electronic orchestral, driving ostinato, hybrid drums, rising tension",
        "bpm": 110,
        "negative_prompt": "no vocals, no lyrics, no EDM, no generic trailer braams, no supersaw, no four-on-the-floor",
    },
    "rapid": {
        "caption": "cinematic orchestral, spiccato strings, brass accents, dramatic dynamic range",
        "bpm": 90,
        "negative_prompt": "no vocals, no lyrics, no EDM, no generic trailer braams, no supersaw, no four-on-the-floor",
    },
    "classical": {
        "caption": "deep cinematic orchestral, felt piano, expressive woodwinds, slow swelling tension, noble brass",
        "bpm": 72,
        "negative_prompt": "no vocals, no lyrics, no EDM, no generic trailer braams, no supersaw, no four-on-the-floor",
    },
    "daily": {
        "caption": "atmospheric ambient classical, minimal piano, long string textures, contemplation",
        "bpm": 60,
        "negative_prompt": "no vocals, no lyrics, no EDM, no generic trailer braams, no supersaw, no four-on-the-floor",
    },
    "unknown": {
        "caption": "cinematic orchestral hybrid, felt piano and cello, controlled dissonance, dramatic arc",
        "bpm": 80,
        "negative_prompt": "no vocals, no lyrics, no EDM, no generic trailer braams, no supersaw, no four-on-the-floor",
    },
}

PRIORITY: Dict[AnchorIntent, int] = {
    "final_cadence": 0,
    "energy_peak": 1,
    "texture_drop": 2,
    "interrupt": 3,
    "accent": 4,
}

MAX_PER_MIN = 10


def get_negative_prompt_for_style(speed: SpeedTier) -> str:
    profile = STYLE_PROFILES.get(speed, STYLE_PROFILES["unknown"])
    return profile["negative_prompt"]


def cap_anchors(anchors: List[Anchor], duration_sec: int) -> List[Anchor]:
    limit = max(3, (duration_sec // 60) * MAX_PER_MIN)
    if len(anchors) <= limit:
        return anchors
    keep = sorted(anchors, key=lambda a: PRIORITY.get(a.intent, 9))[:limit]
    return sorted(keep, key=lambda a: a.ply)


def _classify_phase(total_plies: int, ply: int) -> Phase:
    ratio = ply / max(total_plies, 1)
    if ratio < 0.25:
        return "opening"
    if ratio < 0.7:
        return "middlegame"
    return "endgame"


def _music_for_phase(phase: Phase) -> tuple[str, int]:
    if phase == "opening":
        return "felt piano and cello, sparse, rubato, intimate cinematic instrumental", 72
    if phase == "middlegame":
        return "spiccato strings, controlled dissonance, rising tension, rhythmic acceleration", 110
    return "low cello and double bass, cold texture, sparse, unresolved harmony", 68


def event_graph_to_spec(graph: EventGraph, pgn_str: Optional[str] = None) -> SoundtrackSpec:
    if graph.totalPlies <= 0 or not graph.moves:
        raise ValueError("empty game")

    moves = graph.moves
    total_plies = graph.totalPlies
    target_sec = graph.targetDurationSec
    speed_tier = graph.speedTier or "unknown"
    profile = STYLE_PROFILES.get(speed_tier, STYLE_PROFILES["unknown"])

    bpm = profile["bpm"]
    negative_prompt = profile["negative_prompt"]
    caption_parts: List[str] = []
    anchors: List[Anchor] = list(graph.anchors) if graph.anchors else []

    # If anchors were not pre-calculated, extract them from moves
    if not anchors:
        for idx, node in enumerate(moves):
            flags = node.flags or {}
            if flags.get("queenExchange"):
                anchors.append(Anchor(ply=node.ply, kind="queen_exchange", intent="texture_drop"))
                caption_parts.append("sudden texture reduction")
            if flags.get("promotion"):
                anchors.append(Anchor(ply=node.ply, kind="promotion", intent="energy_peak"))
                caption_parts.append("climax promotion")
            if flags.get("passedPawnAdvance"):
                caption_parts.append("passed pawn motif rises")
            if node.classification == "blunder" or abs(node.evalSwing) >= 3.0:
                anchors.append(Anchor(ply=node.ply, kind="reversal", intent="interrupt"))
                caption_parts.append("dissonant stinger")
            elif node.classification == "brilliant":
                caption_parts.append("accented brilliant move")
            if flags.get("check"):
                anchors.append(Anchor(ply=node.ply, kind="check", intent="accent"))
                caption_parts.append("rhythmic accent check")

    # Add termination cadence anchor
    termination = graph.termination or "unknown"
    final_ply = total_plies
    if termination == "checkmate":
        anchors.append(Anchor(ply=final_ply, kind="checkmate", intent="final_cadence"))
    elif termination == "resignation":
        anchors.append(Anchor(ply=final_ply, kind="hard_cut", intent="final_cadence"))
    elif termination == "timeout":
        anchors.append(Anchor(ply=final_ply, kind="flag_fall", intent="final_cadence"))
    elif termination in ("draw", "stalemate"):
        anchors.append(Anchor(ply=final_ply, kind="unresolved_fade", intent="final_cadence"))
    else:
        anchors.append(Anchor(ply=final_ply, kind="checkmate", intent="final_cadence"))

    anchors = cap_anchors(anchors, target_sec)

    # Aggregate caption parts to avoid bloat
    if caption_parts:
        counts = Counter(caption_parts)
        summarized: List[str] = []
        for phrase, n in counts.most_common():
            if phrase == "rhythmic accent check" and n > 3:
                summarized.append("frequent check accents")
            elif n > 1:
                summarized.append(f"{phrase} (x{n})")
            else:
                summarized.append(phrase)
        body_caption = ", ".join(summarized)
        caption = f"{profile['caption']}, {body_caption}"
    else:
        caption = profile["caption"]

    caption = f"{caption}, {negative_prompt}"

    # Derive seed
    if pgn_str:
        seed = int.from_bytes(hashlib.sha256(pgn_str.encode("utf-8")).digest()[:4], "big")
    else:
        seed = -1

    return SoundtrackSpec(
        caption=caption,
        bpm=bpm,
        durationSec=target_sec,
        seed=seed,
        instrumental=True,
        batchSize=2,
        negativePrompt=negative_prompt,
        anchors=anchors,
    )
