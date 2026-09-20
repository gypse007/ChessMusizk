import { z } from 'zod';

export * from './timecontrol';
export * from './timeprofile';

export const SpeedSchema = z.enum([
  'ultrabullet',
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'daily',
  'unknown',
]);

export const TimeControlSchema = z.object({
  raw: z.string(),
  baseSeconds: z.number().nullable(),
  incrementSeconds: z.number(),
  delaySeconds: z.number(),
  periods: z.array(z.object({ moves: z.number(), seconds: z.number() })).nullable(),
  perMoveDays: z.number().nullable(),
  speed: SpeedSchema,
  estTotalSeconds: z.number(),
});

export const TimeProfileSchema = z.object({
  speed: SpeedSchema,
  paceMedianMs: z.number().nullable(),
  minClockMs: z.number().nullable(),
  zeitnotCount: z.number(),
  maxThinkMs: z.number().nullable(),
  flagged: z.boolean(),
  premoveBursts: z.number(),
  clockSwingMs: z.number(),
  zeitnotPlies: z.array(z.number()),
  premoveBurstPlies: z.array(z.number()),
  thinkSwellPlies: z.array(z.number()),
  clockSwingPly: z.number().nullable(),
});

export const AnchorKindSchema = z.enum([
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
]);

export const TerminationKindSchema = z.enum([
  'checkmate',
  'resignation',
  'timeout',
  'draw',
  'stalemate',
  'unknown',
]);

export type AnchorKind = z.infer<typeof AnchorKindSchema>;
export type TerminationKind = z.infer<typeof TerminationKindSchema>;

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
  termination: TerminationKind;
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

export interface AnchorMapEntry {
  ply: number;
  tSec: number;
  kind: AnchorKind;
}

export interface Take {
  id: string;
  audioUrl: string;
  seed: number;
  landmarks: Landmark[];
  anchorMap: AnchorMapEntry[];
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
