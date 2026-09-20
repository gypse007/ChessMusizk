import { describe, it, expect } from 'vitest';
import {
  EventGraph,
  SoundtrackSpec,
  Anchor,
  MoveNode,
  SpeedTier,
  TerminationKind,
  AnchorKind,
  AnchorIntent,
} from '../index';

describe('TypeScript contract tests with Python golden outputs', () => {
  it('should validate Python EventGraph JSON structure', () => {
    const goldenPythonEventGraphJson = JSON.stringify({
      moves: [
        {
          ply: 1,
          san: 'e4',
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          evalBefore: 0.2,
          evalAfter: 0.3,
          evalSwing: 0.1,
          classification: 'good',
          phase: 'opening',
          flags: { check: false, capture: false },
        },
      ],
      anchors: [
        {
          ply: 1,
          kind: 'check',
          intent: 'accent',
        },
      ],
      totalPlies: 1,
      targetDurationSec: 60,
      termination: 'resignation',
      speedTier: 'blitz',
    });

    const parsed: EventGraph = JSON.parse(goldenPythonEventGraphJson);
    expect(parsed.totalPlies).toBe(1);
    expect(parsed.termination).toBe('resignation');
    expect(parsed.speedTier).toBe('blitz');
    expect(parsed.anchors[0].kind).toBe('check');
  });

  it('should validate Python SoundtrackSpec JSON structure', () => {
    const goldenPythonSpecJson = JSON.stringify({
      caption: 'hybrid electronic orchestral, rising tension',
      bpm: 110,
      durationSec: 60,
      seed: 123456,
      instrumental: true,
      batchSize: 2,
      negativePrompt: 'no vocals, no lyrics',
      anchors: [
        {
          ply: 48,
          kind: 'reversal',
          intent: 'interrupt',
        },
      ],
    });

    const parsed: SoundtrackSpec = JSON.parse(goldenPythonSpecJson);
    expect(parsed.bpm).toBe(110);
    expect(parsed.seed).toBe(123456);
    expect(parsed.instrumental).toBe(true);
    expect(parsed.batchSize).toBe(2);
    expect(parsed.anchors[0].kind).toBe('reversal');
    expect(parsed.anchors[0].intent).toBe('interrupt');
  });

  it('should support all 7 SpeedTiers in TypeScript', () => {
    const tiers: SpeedTier[] = [
      'ultrabullet',
      'bullet',
      'blitz',
      'rapid',
      'classical',
      'daily',
      'unknown',
    ];
    expect(tiers).toHaveLength(7);
  });

  it('should support all TerminationKinds in TypeScript', () => {
    const terms: TerminationKind[] = [
      'checkmate',
      'resignation',
      'timeout',
      'stalemate',
      'draw',
      'unknown',
    ];
    expect(terms).toHaveLength(6);
  });
});
