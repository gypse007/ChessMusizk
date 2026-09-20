import { describe, it, expect } from 'vitest';
import {
  parseTimeControl,
  classifySpeed,
  clkSeconds,
  extractTimeProfile,
  parseTerminationKind,
  SpeedSchema,
  TimeControlSchema,
  TimeProfileSchema,
  AnchorKindSchema,
  TerminationKindSchema,
} from '../index';

const GOLDEN_FIXTURES: Array<[string | null | undefined, string]> = [
  ['30', 'ultrabullet'],
  ['20+1', 'ultrabullet'],
  ['60', 'bullet'],
  ['60+1', 'bullet'],
  ['120+1', 'bullet'],
  ['180', 'blitz'],
  ['300+3', 'blitz'],
  ['600', 'rapid'],
  ['3600', 'rapid'],
  ['1/86400', 'daily'],
  ['40/7200+30:20/900+30', 'classical'],
  ['-', 'unknown'],
  ['?', 'unknown'],
  ['', 'unknown'],
  [null, 'unknown'],
  [undefined, 'unknown'],
];

describe('TimeControl parity and speed classification', () => {
  it.each(GOLDEN_FIXTURES)('classifies %s as %s', (tcStr, expectedSpeed) => {
    const tc = parseTimeControl(tcStr);
    const speed = classifySpeed(tc);
    expect(speed).toBe(expectedSpeed);
  });

  it('supports forceSpeed override', () => {
    const tc = parseTimeControl('600');
    expect(classifySpeed(tc, undefined, 'bullet')).toBe('bullet');
  });

  it('parses %clk comments correctly', () => {
    expect(clkSeconds('[%clk 1:30:15.5]')).toBe(5415.5);
    expect(clkSeconds('{%clk 0:00:05}')).toBe(5);
    expect(clkSeconds('no clk')).toBeNull();
  });

  it('extracts TimeProfile with zeitnot and minClock and zeitnotPlies', () => {
    const pgn = `[Event "Blitz"]
[TimeControl "180+2"]
[Termination "Normal"]

1. e4 {%clk 0:02:59} 1... e5 {%clk 0:02:58}
2. Nf3 {%clk 0:00:08} 2... Nc6 {%clk 0:00:05}`;

    const profile = extractTimeProfile(pgn);
    expect(profile.speed).toBe('blitz');
    expect(profile.zeitnotCount).toBe(2);
    expect(profile.minClockMs).toBe(5000);
    expect(profile.zeitnotPlies).toEqual([3, 4]);
  });

  it('parses termination kind from headers', () => {
    expect(parseTerminationKind('1-0', 'Time forfeit')).toBe('timeout');
    expect(parseTerminationKind('0-1', 'Resignation')).toBe('resignation');
    expect(parseTerminationKind('1/2-1/2', 'Draw by agreement')).toBe('draw');
  });

  it('throws on empty game PGN', () => {
    expect(() => extractTimeProfile('')).toThrow('empty game');
  });

  it('validates Zod schemas including TerminationKindSchema', () => {
    expect(SpeedSchema.parse('bullet')).toBe('bullet');
    expect(AnchorKindSchema.parse('zeitnot_tick')).toBe('zeitnot_tick');
    expect(TerminationKindSchema.parse('resignation')).toBe('resignation');

    const tc = parseTimeControl('60+1');
    const tcData = { ...tc, speed: classifySpeed(tc) };
    expect(TimeControlSchema.safeParse(tcData).success).toBe(true);

    const profile = extractTimeProfile('[TimeControl "60+1"]\n1. e4 e5');
    expect(TimeProfileSchema.safeParse(profile).success).toBe(true);
  });
});
