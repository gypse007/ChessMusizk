export type MoveClass = 'brilliant' | 'good' | 'mistake' | 'blunder' | 'book' | 'forced';

export interface MoveNode {
  ply: number;
  san: string;
  fen: string;
  evalBefore: number;
  evalAfter: number;
  evalSwing: number;
  classification: MoveClass;
  phase: 'opening' | 'middlegame' | 'endgame';
  flags: {
    check?: boolean;
    capture?: boolean;
    promotion?: boolean;
    queenExchange?: boolean;
    passedPawnAdvance?: boolean;
  };
}

export type AnchorKind = 'pawn_storm_start' | 'queen_exchange' | 'promotion' | 'false_climax' | 'check' | 'checkmate' | 'reversal';
export type AnchorIntent = 'energy_peak' | 'texture_drop' | 'accent' | 'final_cadence' | 'interrupt';

export interface Anchor {
  ply: number;
  kind: AnchorKind;
  intent: AnchorIntent;
}

export interface EventGraph {
  moves: MoveNode[];
  anchors: Anchor[];
  totalPlies: number;
  targetDurationSec: 60 | 75;
}

export interface SoundtrackSpec {
  caption: string;
  bpm: number;
  durationSec: 60 | 75;
  seed: number;
  instrumental: true;
  batchSize: 2;
  negativePrompt: string;
  anchors: Anchor[];
}

export type LandmarkType = 'beat' | 'onset' | 'energy_peak' | 'texture_drop';

export interface Landmark {
  tSec: number;
  type: LandmarkType;
}

export interface Take {
  id: string;
  audioUrl: string;
  seed: number;
  landmarks: Landmark[];
  anchorMap: { ply: number; tSec: number }[];
  watermarked: true;
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
