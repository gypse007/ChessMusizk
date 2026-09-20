import type { MoveNode, Anchor, EventGraph, MoveClass, TimeControlCategory } from '@chess-to-music/shared';

export function parseTimeControlCategory(timeControl?: string): TimeControlCategory {
  if (!timeControl) return 'blitz';
  try {
    const tc = timeControl.trim();
    if (tc === '30' || tc.startsWith('30+') || tc.startsWith('20+1')) return 'ultrabullet';
    const basePart = tc.split('+')[0].split('/')[0].trim();
    const seconds = parseInt(basePart, 10);
    if (isNaN(seconds)) return 'blitz';
    if (seconds <= 30) return 'ultrabullet';
    if (seconds < 180) return 'bullet';
    if (seconds < 600) return 'blitz';
    if (seconds <= 3600) return 'rapid';
    return 'classical';
  } catch {
    return 'blitz';
  }
}

export function getMusicStylePreview(category: TimeControlCategory): string {
  switch (category) {
    case 'ultrabullet':
      return 'Hyperdrive Glitch & Sub-Bass Sprint';
    case 'bullet':
      return 'Live Festival EDM Anthem (David Guetta Main Stage Style)';
    case 'blitz':
      return 'Driving Hybrid Electronic-Orchestral';
    case 'rapid':
      return 'Atmospheric Cinematic Orchestral';
    case 'classical':
      return 'Deep Classical Orchestral Arc';
    case 'daily':
      return 'Ambient Cinematic Acoustic';
    default:
      return 'Neutral Cinematic Hybrid';
  }
}

export function buildEventGraph(
  moves: Array<{
    san: string;
    evalBefore: number;
    evalAfter: number;
    classification: MoveClass;
    phase: 'opening' | 'middlegame' | 'endgame';
    flags: Record<string, boolean | undefined>;
  }>,
  totalPlies: number,
  targetDurationSec: 60 | 75 = 60,
  timeControl?: string,
): EventGraph {
  const category = parseTimeControlCategory(timeControl);
  const stylePreview = getMusicStylePreview(category);
  const moveNodes: MoveNode[] = moves.map((m, idx) => ({
    ply: idx + 1,
    san: m.san,
    fen: '',
    evalBefore: m.evalBefore,
    evalAfter: m.evalAfter,
    evalSwing: Math.abs(m.evalAfter - m.evalBefore),
    classification: m.classification,
    phase: m.phase,
    flags: {
      check: m.flags.check,
      capture: m.flags.capture,
      promotion: m.flags.promotion,
      queenExchange: m.flags.queenExchange,
      passedPawnAdvance: m.flags.passedPawnAdvance,
    },
  }));

  const anchors: Anchor[] = [];
  for (let i = 0; i < moveNodes.length; i++) {
    const node = moveNodes[i];
    const swing = node.evalSwing;

    if (node.classification === 'brilliant' && swing > 200) {
      anchors.push({ ply: node.ply, kind: 'check', intent: 'energy_peak' });
    }

    if (node.flags.queenExchange && i > 5) {
      anchors.push({ ply: node.ply, kind: 'queen_exchange', intent: 'texture_drop' });
    }

    if (node.flags.passedPawnAdvance) {
      anchors.push({ ply: node.ply, kind: 'pawn_storm_start', intent: 'accent' });
    }

    if (node.flags.check && swing > 100) {
      anchors.push({ ply: node.ply, kind: 'false_climax', intent: 'interrupt' });
    }
  }

  if (moveNodes.length > 0) {
    anchors.push({ ply: moveNodes.length, kind: 'checkmate', intent: 'final_cadence' });
  }

  return {
    moves: moveNodes,
    anchors,
    totalPlies,
    targetDurationSec,
    timeControl,
    timeCategory: category,
    musicStylePreview: stylePreview,
  };
}
