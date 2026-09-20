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

export interface TimeProfile {
  speed: Speed;
  paceMedianMs: number | null;
  minClockMs: number | null;
  zeitnotCount: number;
  maxThinkMs: number | null;
  flagged: boolean;
  premoveBursts: number;
  clockSwingMs: number;
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

export function extractTimeProfile(
  pgn: string,
  forceSpeed?: Speed,
  thresholds?: Partial<typeof DEFAULT_THRESHOLDS>,
): TimeProfile {
  const tcRaw = getHeaderValue(pgn, 'TimeControl');
  const termination = (getHeaderValue(pgn, 'Termination') || '').toLowerCase();

  const tc = parseTimeControl(tcRaw);
  let speed = classifySpeed(tc, thresholds, forceSpeed);

  // Extract comments containing %clk or %emt
  const commentMatches = pgn.match(/\{[^}]*\}/g) || [];
  const thinkTimesSec: number[] = [];
  let minClockSec: number | null = null;
  let zeitnotCount = 0;
  let premoveBursts = 0;

  let lastWClockSec: number | null = null;
  let lastBClockSec: number | null = null;
  const clockSwingsSec: number[] = [];

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
        zeitnotCount++;
      }

      const prevClock = isWhite ? lastWClockSec : lastBClockSec;
      if (prevClock !== null) {
        const rawDelta = prevClock - clk;
        if (rawDelta < 0) {
          premoveBursts++;
        }
        const spent = prevClock + tc.incrementSeconds - clk;
        thinkTimesSec.push(Math.max(0, spent >= 0 ? spent : 0));
      }

      if (isWhite) {
        lastWClockSec = clk;
      } else {
        lastBClockSec = clk;
      }

      if (lastWClockSec !== null && lastBClockSec !== null) {
        clockSwingsSec.push(Math.abs(lastWClockSec - lastBClockSec));
      }
    } else if (emt !== null) {
      thinkTimesSec.push(emt);
    }
  }

  let paceMedianSec: number | null = null;
  if (thinkTimesSec.length > 0) {
    const sorted = [...thinkTimesSec].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    paceMedianSec = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const maxThinkSec = thinkTimesSec.length > 0 ? Math.max(...thinkTimesSec) : null;
  const maxClockSwingSec = clockSwingsSec.length > 0 ? Math.max(...clockSwingsSec) : 0;

  const flagged = termination.includes('time') && minClockSec !== null && minClockSec <= 1.0;

  if (speed === 'unknown' && paceMedianSec !== null) {
    speed = inferSpeedFromPaceSec(paceMedianSec);
  }

  return {
    speed,
    paceMedianMs: paceMedianSec !== null ? Math.round(paceMedianSec * 1000) : null,
    minClockMs: minClockSec !== null ? Math.round(minClockSec * 1000) : null,
    zeitnotCount,
    maxThinkMs: maxThinkSec !== null ? Math.round(maxThinkSec * 1000) : null,
    flagged,
    premoveBursts,
    clockSwingMs: Math.round(maxClockSwingSec * 1000),
  };
}
