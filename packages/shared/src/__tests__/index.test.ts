import {
  MoveNode,
  Anchor,
  EventGraph,
  SoundtrackSpec,
  Landmark,
  Take,
  Job,
  JobStatus,
  CreateJobRequest,
  ShareRequest,
} from '../index';

describe('shared types', () => {
  it('should export MoveNode with correct shape', () => {
    const move: MoveNode = {
      ply: 1,
      san: 'e4',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      evalBefore: 0.2,
      evalAfter: 0.3,
      evalSwing: 0.1,
      classification: 'good',
      phase: 'opening',
      flags: { check: false, capture: false },
    };
    expect(move.ply).toBe(1);
    expect(move.classification).toBe('good');
    expect(move.phase).toBe('opening');
  });

  it('should export Anchor with correct shape', () => {
    const anchor: Anchor = {
      ply: 12,
      kind: 'queen_exchange',
      intent: 'energy_peak',
    };
    expect(anchor.kind).toBe('queen_exchange');
    expect(anchor.intent).toBe('energy_peak');
  });

  it('should export EventGraph with correct shape', () => {
    const graph: EventGraph = {
      moves: [],
      anchors: [],
      totalPlies: 40,
      targetDurationSec: 60,
    };
    expect(graph.totalPlies).toBe(40);
    expect(graph.targetDurationSec).toBe(60);
  });

  it('should export SoundtrackSpec with correct shape', () => {
    const spec: SoundtrackSpec = {
      caption: 'epic chess battle',
      bpm: 120,
      durationSec: 75,
      seed: 42,
      instrumental: true,
      batchSize: 2,
      negativePrompt: 'no vocals',
      anchors: [],
    };
    expect(spec.bpm).toBe(120);
    expect(spec.instrumental).toBe(true);
  });

  it('should export Landmark with correct shape', () => {
    const landmark: Landmark = {
      tSec: 12.5,
      type: 'beat',
    };
    expect(landmark.tSec).toBeCloseTo(12.5);
    expect(landmark.type).toBe('beat');
  });

  it('should export Take with correct shape', () => {
    const take: Take = {
      id: 'take-1',
      audioUrl: 'https://example.com/audio.mp3',
      seed: 42,
      landmarks: [],
      anchorMap: [],
      watermarked: true,
    };
    expect(take.id).toBe('take-1');
    expect(take.watermarked).toBe(true);
  });

  it('should export Job with correct shape', () => {
    const job: Job = {
      id: 'job-1',
      pgn: '1. e4 e5',
      status: 'queued',
      targetSec: 60,
      stageUpdatedAt: 0,
      createdAt: Date.now(),
    };
    expect(job.status).toBe('queued');
    expect(job.targetSec).toBe(60);
  });

  it('should accept optional userId and error on Job', () => {
    const job: Job = {
      id: 'job-2',
      userId: 'user-1',
      pgn: '1. d4 d5',
      status: 'failed',
      targetSec: 75,
      stageUpdatedAt: 100,
      error: 'generation failed',
      createdAt: Date.now(),
    };
    expect(job.userId).toBe('user-1');
    expect(job.error).toBe('generation failed');
  });

  it('should export CreateJobRequest with optional userId', () => {
    const req: CreateJobRequest = {
      pgn: '1. e4 e5 2. Nf3 Nc6',
    };
    expect(req.pgn).toBeDefined();
    expect(req.userId).toBeUndefined();
  });

  it('should export ShareRequest with correct shape', () => {
    const req: ShareRequest = {
      takeId: 'take-1',
      kind: 'web',
    };
    expect(req.takeId).toBe('take-1');
    expect(req.kind).toBe('web');
  });

  it('should enforce JobStatus union values', () => {
    const statuses: JobStatus[] = [
      'queued',
      'analyzing',
      'arc',
      'composing',
      'mastering',
      'done',
      'failed',
    ];
    expect(statuses).toHaveLength(7);
  });
});
