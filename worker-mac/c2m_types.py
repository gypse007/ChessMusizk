from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Literal, TypedDict

MoveClass = Literal['brilliant', 'good', 'mistake', 'blunder', 'book', 'forced']
AnchorKind = Literal[
    'pawn_storm_start',
    'queen_exchange',
    'promotion',
    'false_climax',
    'check',
    'checkmate',
    'reversal',
    'zeitnot_tick',
    'think_swell',
    'flag_fall',
    'premove_burst',
    'clock_swing',
    'resignation',
    'draw_fade',
]
AnchorIntent = Literal['energy_peak', 'texture_drop', 'accent', 'final_cadence', 'interrupt']
JobStatus = Literal['queued', 'analyzing', 'arc', 'composing', 'mastering', 'done', 'failed']
TerminationKind = Literal['checkmate', 'resignation', 'timeout', 'draw', 'stalemate', 'unknown']


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
    phase: str  # 'opening' | 'middlegame' | 'endgame'
    flags: MoveFlags = field(default_factory=dict)


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
    termination: TerminationKind = "unknown"


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
class AnchorMapEntry:
    ply: int
    tSec: float
    kind: AnchorKind


@dataclass
class Take:
    id: str
    audioUrl: str
    seed: int
    landmarks: List[Landmark]
    anchorMap: List[AnchorMapEntry]
    watermarked: bool = True
