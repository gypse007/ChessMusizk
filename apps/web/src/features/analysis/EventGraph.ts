import type { MoveNode, Anchor, EventGraph, MoveClass } from '@chess-to-music/shared';

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
): EventGraph {
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
  };
}
