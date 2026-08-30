from __future__ import annotations

from typing import Literal

from worker_mac.c2m_types import Anchor, AnchorIntent, AnchorKind, EventGraph, SoundtrackSpec, MoveNode


Phase = Literal["opening", "middlegame", "endgame"]


GLOBAL_NEGATIVE_PROMPT = (
    "no vocals, no lyrics, no EDM, no generic trailer braams, "
    "no supersaw, no four-on-the-floor"
)


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


def event_graph_to_spec(graph: EventGraph) -> SoundtrackSpec:
    moves = graph.moves
    total_plies = graph.totalPlies
    target_sec = graph.targetDurationSec
    bpm = 72
    caption_parts: list[str] = []
    anchors: list[Anchor] = []

    for idx, node in enumerate(moves):
        phase = _classify_phase(total_plies, node.ply)
        base_caption, phase_bpm = _music_for_phase(phase)
        bpm = max(bpm, phase_bpm) if phase == "middlegame" else min(bpm, phase_bpm) if phase == "endgame" else bpm

        if node.flags.get("queenExchange"):
            anchors.append(Anchor(ply=node.ply, kind="queen_exchange", intent="texture_drop"))
            caption_parts.append("sudden texture reduction")
        elif node.flags.get("promotion"):
            anchors.append(Anchor(ply=node.ply, kind="promotion", intent="energy_peak"))
            caption_parts.append("climax promotion")
        elif node.flags.get("passedPawnAdvance"):
            caption_parts.append("passed pawn motif rises")
        elif node.classification == "blunder":
            caption_parts.append("dissonant stinger")
        elif node.classification == "brilliant":
            caption_parts.append("accented brilliant move")
        elif node.flags.get("check"):
            anchors.append(Anchor(ply=node.ply, kind="check", intent="accent"))
            caption_parts.append("rhythmic accent check")

    if not anchors:
        anchors.append(Anchor(ply=total_plies, kind="checkmate", intent="final_cadence"))

    caption = ", ".join(caption_parts) if caption_parts else base_caption
    caption = f"{caption}, {GLOBAL_NEGATIVE_PROMPT}"

    return SoundtrackSpec(
        caption=caption,
        bpm=bpm,
        durationSec=target_sec,
        seed=-1,
        instrumental=True,
        batchSize=2,
        negativePrompt=GLOBAL_NEGATIVE_PROMPT,
        anchors=anchors,
    )
