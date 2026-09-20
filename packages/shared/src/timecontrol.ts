export type Speed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'unknown';

export interface ParsedTimeControl {
  raw: string;
  baseSeconds: number | null;
  incrementSeconds: number;
  delaySeconds: number;
  periods: Array<{ moves: number; seconds: number }> | null;
  perMoveDays: number | null;
  estTotalSeconds: number;
}

export const DEFAULT_THRESHOLDS = {
  ultrabulletBase: 30,
  bulletEst: 180,
  blitzEst: 600,
  rapidEst: 3600,
};

export function parseTimeControl(raw: string | null | undefined): ParsedTimeControl {
  if (!raw || ['-', '?', ''].includes(raw.trim())) {
    const cleanRaw = raw?.trim() || '-';
    return {
      raw: cleanRaw,
      baseSeconds: null,
      incrementSeconds: 0,
      delaySeconds: 0,
      periods: null,
      perMoveDays: null,
      estTotalSeconds: 0,
    };
  }

  const cleanRaw = raw.trim();

  // "1/86400" or "40/9000"
  const slashMatch = cleanRaw.match(/^(\d+)\/(\d+)$/);
  if (slashMatch) {
    const moves = parseInt(slashMatch[1], 10);
    const secs = parseInt(slashMatch[2], 10);
    if (secs >= 86400) {
      return {
        raw: cleanRaw,
        baseSeconds: null,
        incrementSeconds: 0,
        delaySeconds: 0,
        periods: null,
        perMoveDays: secs / 86400,
        estTotalSeconds: 0,
      };
    }
    return {
      raw: cleanRaw,
      baseSeconds: null,
      incrementSeconds: 0,
      delaySeconds: 0,
      periods: [{ moves, seconds: secs }],
      perMoveDays: null,
      estTotalSeconds: secs,
    };
  }

  // "40/7200+30:20/900+30" (FIDE SCD)
  if (cleanRaw.includes('/')) {
    const parts = cleanRaw.split(':');
    const periods: Array<{ moves: number; seconds: number }> = [];
    let inc = 0;
    let malformed = false;

    for (const part of parts) {
      const pm = part.match(/^(\d+)\/(\d+)(?:\+(\d+))?$/);
      if (!pm) {
        malformed = true;
        break;
      }
      periods.push({ moves: parseInt(pm[1], 10), seconds: parseFloat(pm[2]) });
      inc += parseFloat(pm[3] || '0');
    }

    if (!malformed && periods.length > 0) {
      return {
        raw: cleanRaw,
        baseSeconds: null,
        incrementSeconds: inc,
        delaySeconds: 0,
        periods,
        perMoveDays: null,
        estTotalSeconds: 40 * inc,
      };
    }

    return {
      raw: cleanRaw,
      baseSeconds: null,
      incrementSeconds: 0,
      delaySeconds: 0,
      periods: null,
      perMoveDays: null,
      estTotalSeconds: 0,
    };
  }

  // "600", "600+5", "30"
  const standardMatch = cleanRaw.match(/^(\d+)(?:\+(\d+))?$/);
  if (standardMatch) {
    const baseSec = parseFloat(standardMatch[1]);
    const incSec = parseFloat(standardMatch[2] || '0');
    return {
      raw: cleanRaw,
      baseSeconds: baseSec,
      incrementSeconds: incSec,
      delaySeconds: 0,
      periods: null,
      perMoveDays: null,
      estTotalSeconds: baseSec + 40 * incSec,
    };
  }

  return {
    raw: cleanRaw,
    baseSeconds: null,
    incrementSeconds: 0,
    delaySeconds: 0,
    periods: null,
    perMoveDays: null,
    estTotalSeconds: 0,
  };
}

export function classifySpeed(
  tc: ParsedTimeControl,
  thresholds?: Partial<typeof DEFAULT_THRESHOLDS>,
  forceSpeed?: Speed,
): Speed {
  if (forceSpeed) {
    return forceSpeed;
  }

  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (tc.perMoveDays !== null) {
    return 'daily';
  }
  if (tc.periods !== null) {
    return 'classical';
  }
  if (tc.baseSeconds === null) {
    return 'unknown';
  }
  if (tc.baseSeconds <= t.ultrabulletBase) {
    return 'ultrabullet';
  }

  const est = tc.estTotalSeconds;
  if (est < t.bulletEst) {
    return 'bullet';
  }
  if (est < t.blitzEst) {
    return 'blitz';
  }
  if (est <= t.rapidEst) {
    return 'rapid';
  }

  return 'classical';
}
