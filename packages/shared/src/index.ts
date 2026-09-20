export type MoveClass = 'brilliant' | 'good' | 'mistake' | 'blunder' | 'book' | 'forced';

export interface MoveFlags {
  check?: boolean;
  capture?: boolean;
  promotion?: boolean;
  queenExchange?: boolean;
  passedPawnAdvance?: boolean;
}

export interface MoveNode {
  ply: number;
  san: string;
  fen: string;
  evalBefore: number;
  evalAfter: number;
  evalSwing: number;
  classification: MoveClass;
  phase: 'opening' | 'middlegame' | 'endgame';
  flags: MoveFlags;
}

export type AnchorKind =
  | 'pawn_storm_start'
  | 'queen_exchange'
  | 'promotion'
  | 'false_climax'
  | 'check'
  | 'checkmate'
  | 'reversal'
  | 'zeitnot_tick'
  | 'premove_burst'
  | 'flag_fall'
  | 'hard_cut'
  | 'unresolved_fade';

export type AnchorIntent = 'energy_peak' | 'texture_drop' | 'accent' | 'final_cadence' | 'interrupt';

export type SpeedTier = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'unknown';

export type TerminationKind = 'checkmate' | 'resignation' | 'timeout' | 'stalemate' | 'draw' | 'unknown';

export interface Anchor {
  ply: number;
  kind: AnchorKind;
  intent: AnchorIntent;
}

export interface EventGraph {
  moves: MoveNode[];
  anchors: Anchor[];
  totalPlies: number;
  targetDurationSec: number;
  termination?: TerminationKind;
  speedTier?: SpeedTier;
}

export interface SoundtrackSpec {
  caption: string;
  bpm: number;
  durationSec: number;
  seed: number;
  instrumental: boolean;
  batchSize: number;
  negativePrompt: string;
  anchors: Anchor[];
}

export type LandmarkType = 'beat' | 'onset' | 'energy_peak' | 'texture_drop';

export interface Landmark {
  tSec: number;
  type: LandmarkType;
}

export interface AnchorMapEntry {
  ply: number;
  tSec: number;
  kind?: string;
}

export interface Take {
  id: string;
  audioUrl: string;
  seed: number;
  landmarks: Landmark[];
  anchorMap: AnchorMapEntry[];
  watermarked: boolean;
}

export type JobStatus = 'queued' | 'analyzing' | 'arc' | 'composing' | 'mastering' | 'done' | 'failed';

export interface Job {
  id: string;
  userId?: string;
  pgn: string;
  eventGraph?: EventGraph;
  status: JobStatus;
  targetSec: number;
  stageUpdatedAt: number;
  error?: string;
  createdAt: number;
}

export interface CreateJobRequest {
  pgn: string;
  eventGraph: EventGraph;
  userId?: string;
}

export interface ShareRequest {
  takeId: string;
  kind: 'web' | 'gif';
}
