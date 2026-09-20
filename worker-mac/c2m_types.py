from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Literal, TypedDict, Any

MoveClass = Literal["brilliant", "good", "mistake", "blunder", "book", "forced"]
AnchorKind = Literal[
    "pawn_storm_start",
    "queen_exchange",
    "promotion",
    "false_climax",
    "check",
    "checkmate",
    "reversal",
    "zeitnot_tick",
    "premove_burst",
    "flag_fall",
    "hard_cut",
    "unresolved_fade",
]
AnchorIntent = Literal[
    "energy_peak",
    "texture_drop",
    "accent",
    "final_cadence",
    "interrupt",
]
SpeedTier = Literal["ultrabullet", "bullet", "blitz", "rapid", "classical", "daily", "unknown"]
TerminationKind = Literal["checkmate", "resignation", "timeout", "stalemate", "draw", "unknown"]
JobStatus = Literal["queued", "analyzing", "arc", "composing", "mastering", "done", "failed"]


class MoveFlags(TypedDict, total=False):
    check: bool
    capture: bool
    promotion: bool
    queenExchange: bool
    passedPawnAdvance: bool


@dataclass
class MoveNode:
    ply: int
    san: str
    fen: str
    evalBefore: float
    evalAfter: float
    evalSwing: float
    classification: MoveClass
    phase: Literal["opening", "middlegame", "endgame"]
    flags: MoveFlags = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Anchor:
    ply: int
    kind: AnchorKind
    intent: AnchorIntent

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class EventGraph:
    moves: List[MoveNode]
    anchors: List[Anchor]
    totalPlies: int
    targetDurationSec: int
    termination: TerminationKind = "unknown"
    speedTier: SpeedTier = "unknown"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SoundtrackSpec:
    caption: str
    bpm: int
    durationSec: int
    seed: int
    instrumental: bool = True
    batchSize: int = 2
    negativePrompt: str = ""
    anchors: List[Anchor] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Landmark:
    tSec: float
    type: Literal["beat", "onset", "energy_peak", "texture_drop"]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Take:
    id: str
    audioUrl: str
    seed: int
    landmarks: List[Landmark]
    anchorMap: List[Dict[str, Any]]
    watermarked: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
