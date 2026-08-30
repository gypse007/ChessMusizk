from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

MoveClass = str  # 'brilliant' | 'good' | 'mistake' | 'blunder' | 'book' | 'forced'
AnchorKind = str  # 'pawn_storm_start' | 'queen_exchange' | 'promotion' | 'false_climax' | 'check' | 'checkmate' | 'reversal'
AnchorIntent = str  # 'energy_peak' | 'texture_drop' | 'accent' | 'final_cadence' | 'interrupt'
JobStatus = str  # 'queued' | 'analyzing' | 'arc' | 'composing' | 'mastering' | 'done' | 'failed'


@dataclass
class MoveNode:
    ply: int
    san: str
    fen: str
    evalBefore: float
    evalAfter: float
    evalSwing: float
    classification: MoveClass
    phase: str  # 'opening' | 'middlegame' | 'endgame'
    flags: dict = field(default_factory=dict)


@dataclass
class Anchor:
    ply: int
    kind: AnchorKind
    intent: AnchorIntent


@dataclass
class EventGraph:
    moves: List[MoveNode]
    anchors: List[Anchor]
    totalPlies: int
    targetDurationSec: int


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


@dataclass
class Landmark:
    tSec: float
    type: str  # 'beat' | 'onset' | 'energy_peak' | 'texture_drop'


@dataclass
class Take:
    id: str
    audioUrl: str
    seed: int
    landmarks: List[Landmark]
    anchorMap: List[dict]
    watermarked: bool = True
