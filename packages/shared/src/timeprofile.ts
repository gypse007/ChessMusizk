import { parseTimeControl, classifySpeed, DEFAULT_THRESHOLDS, type Speed } from './timecontrol';

export const CLK_RE = /\[?%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]?/;
export const EMT_RE = /\[?%emt\s+(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2}(?:\.\d+)?)\]?/;

export function clkSeconds(comment: string): number | null {
  if (!comment) return null;
  const m = CLK_RE.exec(comment);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const secs = parseFloat(m[3]);
  return hours * 3600 + mins * 60 + secs;
}

export function emtSeconds(comment: string): number | null {
  if (!comment) return null;
  const m = EMT_RE.exec(comment);
  if (!m) return null;
  const h = m[1] !== undefined ? parseInt(m[1], 10) : 0;
  const minVal = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  const s = parseFloat(m[3]);
  return h * 3600 + minVal * 60 + s;
}

export type TerminationKind = 'checkmate' | 'resignation' | 'timeout' | 'draw' | 'stalemate' | 'unknown';

export interface TimeProfile {
  speed: Speed;
  paceMedianMs: number | null;
  minClockMs: number | null;
  zeitnotCount: number;
  maxThinkMs: number | null;
  flagged: boolean;
  premoveBursts: number;
  clockSwingMs: number;
  zeitnotPlies: number[];
  premoveBurstPlies: number[];
  thinkSwellPlies: number[];
  clockSwingPly: number | null;
  terminationKind: TerminationKind;
}

function inferSpeedFromPaceSec(paceMedianSec: number | null): Speed {
  if (paceMedianSec === null) return 'unknown';
  if (paceMedianSec <= 3.0) return 'bullet';
  if (paceMedianSec <= 8.0) return 'blitz';
  if (paceMedianSec <= 25.0) return 'rapid';
  return 'classical';
}

function getHeaderValue(pgn: string, headerName: string): string | null {
  const match = pgn.match(new RegExp(`\\[${headerName}\\s+"([^"]+)"\\]`, 'i'));
  return match ? match[1] : null;
}

export function parseTerminationKind(result: string | null, termination: string | null): TerminationKind {
  const res = (result || '').trim();
  const term = (termination || '').toLowerCase().trim();

  if (term.includes('time') || term.includes('forfeit')) return 'timeout';
  if (term.includes('resign') || term.includes('abandon')) return 'resignation';
  if (term.includes('stalemate')) return 'stalemate';
  if (term.includes('draw') || res === '1/2-1/2') return 'draw';
  if (term.includes('checkmate') || term.includes('normal') || ['1-0', '0-1'].includes(res)) return 'checkmate';

  return 'unknown';
}

export function extractTimeProfile(
  pgn: string,
  forceSpeed?: Speed,
  thresholds?: Partial<typeof DEFAULT_THRESHOLDS>,
): TimeProfile {
  if (!pgn || !pgn.trim()) {
    throw new Error('empty game');
  }

  const tcRaw = getHeaderValue(pgn, 'TimeControl');
  const terminationHeader = getHeaderValue(pgn, 'Termination');
  const resultHeader = getHeaderValue(pgn, 'Result');
  const termKind = parseTerminationKind(resultHeader, terminationHeader);

  const tc = parseTimeControl(tcRaw);
  let speed = classifySpeed(tc, thresholds, forceSpeed);

  const commentMatches = pgn.match(/\{[^}]*\}/g) || [];
  const thinkTimesSec: Array<{ ply: number; spent: number }> = [];
  let minClockSec: number | null = null;
  const zeitnotPlies: number[] = [];
  const premoveBurstPlies: number[] = [];
  const thinkSwellPlies: number[] = [];

  let lastWClockSec: number | null = null;
  let lastBClockSec: number | null = null;
  const clockSwings: Array<{ ply: number; gap: number }> = [];

  let moveIdx = 0;
  for (const commentBlock of commentMatches) {
    const comment = commentBlock.slice(1, -1);
    const clk = clkSeconds(comment);
    const emt = emtSeconds(comment);

    moveIdx++;
    const isWhite = moveIdx % 2 !== 0;

    if (clk !== null) {
      if (minClockSec === null || clk < minClockSec) {
        minClockSec = clk;
      }
      if (clk < 10.0) {
        zeitnotPlies.push(moveIdx);
      }

      const prevClock = isWhite ? lastWClockSec : lastBClockSec;
      if (prevClock !== null) {
        const rawDelta = prevClock - clk;
        if (rawDelta < 0) {
          premoveBurstPlies.push(moveIdx);
        }
        const spent = prevClock + tc.incrementSeconds - clk;
        const actualSpent = Math.max(0, spent >= 0 ? spent : 0);
        thinkTimesSec.push({ ply: moveIdx, spent: actualSpent });
        if (actualSpent >= 30.0) {
          thinkSwellPlies.push(moveIdx);
        }
      }

      if (isWhite) {
        lastWClockSec = clk;
      } else {
        lastBClockSec = clk;
      }

      if (lastWClockSec !== null && lastBClockSec !== null) {
        clockSwings.push({ ply: moveIdx, gap: Math.abs(lastWClockSec - lastBClockSec) });
      }
    } else if (emt !== null) {
      thinkTimesSec.push({ ply: moveIdx, spent: emt });
      if (emt >= 30.0) {
        thinkSwellPlies.push(moveIdx);
      }
    }
  }

  const spentVals = thinkTimesSec.map(t => t.spent);
  let paceMedianSec: number | null = null;
  if (spentVals.length > 0) {
    const sorted = [...spentVals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    paceMedianSec = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const maxThinkSec = spentVals.length > 0 ? Math.max(...spentVals) : null;

  let maxClockSwingSec = 0;
  let clockSwingPly: number | null = null;
  if (clockSwings.length > 0) {
    let best = clockSwings[0];
    for (const item of clockSwings) {
      if (item.gap > best.gap) best = item;
    }
    maxClockSwingSec = best.gap;
    clockSwingPly = best.ply;
  }

  const flagged = termKind === 'timeout' || (minClockSec !== null && minClockSec <= 1.0);

  if (speed === 'unknown' && paceMedianSec !== null) {
    speed = inferSpeedFromPaceSec(paceMedianSec);
  }

  return {
    speed,
    paceMedianMs: paceMedianSec !== null ? Math.round(paceMedianSec * 1000) : null,
    minClockMs: minClockSec !== null ? Math.round(minClockSec * 1000) : null,
    zeitnotCount: zeitnotPlies.length,
    maxThinkMs: maxThinkSec !== null ? Math.round(maxThinkSec * 1000) : null,
    flagged,
    premoveBursts: premoveBurstPlies.length,
    clockSwingMs: Math.round(maxClockSwingSec * 1000),
    zeitnotPlies,
    premoveBurstPlies,
    thinkSwellPlies,
    clockSwingPly,
    terminationKind: termKind,
  };
}
