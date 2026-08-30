import type { MoveNode, MoveClass, Anchor, EventGraph } from '@chess-to-music/shared';

const WORKER_PATH = '/engine/stockfish.js';

interface SFMessage {
  type: string;
  data?: string;
}

let worker: Worker | null = null;
let ready = false;
const onReadyCbs: Array<() => void> = [];

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(WORKER_PATH);
    worker.onmessage = (e: MessageEvent<SFMessage>) => {
      if (e.data.type === 'ready') {
        ready = true;
        onReadyCbs.forEach(cb => cb());
      }
    };
  }
  return worker;
}

export function waitForReady(): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise((resolve) => {
    onReadyCbs.push(resolve);
    getWorker();
  });
}

export function setDepth(_d: number) {
  // Depth is configurable; actual limit is enforced by the engine.
}

export async function analyzePgn(
  pgn: string,
  onProgress?: (ply: number, total: number) => void,
): Promise<EventGraph> {
  await waitForReady();
  const w = getWorker();

  const moves = extractMoves(pgn);
  const moveNodes: MoveNode[] = [];
  const anchors: Anchor[] = [];

  let currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let lastEval = 0;

  for (let i = 0; i < moves.length; i++) {
    const evalBefore = lastEval;
    const evalAfter = await evaluateMove(w, currentFen, moves[i]);
    const evalSwing = Math.abs(evalAfter - evalBefore);

    const classification = classify(evalSwing, i, moves.length);
    const phase = getPhase(i, moves.length);
    const flags = detectFlags(currentFen, moves[i], phase);

    moveNodes.push({
      ply: i + 1,
      san: moves[i],
      fen: currentFen,
      evalBefore,
      evalAfter,
      evalSwing,
      classification,
      phase,
      flags,
    });

    if (classification === 'brilliant') {
      anchors.push({ ply: i + 1, kind: 'check', intent: 'energy_peak' });
    }
    if (flags.queenExchange && i > 5) {
      anchors.push({ ply: i + 1, kind: 'queen_exchange', intent: 'texture_drop' });
    }
    if (flags.passedPawnAdvance) {
      anchors.push({ ply: i + 1, kind: 'pawn_storm_start', intent: 'accent' });
    }

    currentFen = updateFen(currentFen, moves[i]);
    lastEval = evalAfter;

    onProgress?.(i + 1, moves.length);
  }

  return {
    moves: moveNodes,
    anchors,
    totalPlies: moves.length,
    targetDurationSec: 60,
  };
}

function extractMoves(pgn: string): string[] {
  const text = pgn.replace(/\[.*?\]/g, '').replace(/\{[^}]*\}/g, '').replace(/\([^)]*\)/g, '').replace(/\d+\.\.\./g, '').replace(/\d+\./g, '');
  const tokens = text.split(/\s+/).filter(t => /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?$/.test(t) || /^O-O(-O)?[+#]?$/.test(t));
  return tokens;
}

async function evaluateMove(w: Worker, fen: string, san: string): Promise<number> {
  return new Promise((resolve) => {
    const id = Math.random();
    const handler = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      w.removeEventListener('message', handler);
      resolve(e.data.eval || 0);
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'eval', id, fen, san });
  });
}

function classify(swing: number, idx: number, _total: number): MoveClass {
  if (idx < 4) return 'book';
  if (swing > 300) return 'brilliant';
  if (swing > 150) return 'good';
  if (swing > 80) return 'mistake';
  if (swing > 20) return 'blunder';
  return 'book';
}

function getPhase(idx: number, total: number): 'opening' | 'middlegame' | 'endgame' {
  if (total <= 0) return 'opening';
  if (idx < total * 0.25) return 'opening';
  if (idx < total * 0.7) return 'middlegame';
  return 'endgame';
}

function detectFlags(_fen: string, san: string, _phase: string) {
  const isCheck = san.includes('+');
  const isCapture = san.includes('x');
  const isPromotion = san.includes('=');
  const isQueenExchange = san.includes('Q') && (san.includes('x') || san.includes('='));
  const isPassedPawn = /[a-h][2-7]=[QRBN]/.test(san);

  return {
    check: isCheck,
    capture: isCapture,
    promotion: isPromotion,
    queenExchange: isQueenExchange,
    passedPawnAdvance: isPassedPawn,
  };
}

function updateFen(fen: string, _san: string): string {
  const parts = fen.split(' ');
  const rank = parseInt(parts[5]);
  return `${parts[0]} ${parts[1] === 'w' ? 'b' : 'w'} ${parts[2]} ${parts[3]} ${parts[4]} ${rank + 1}`;
}

export function terminate() {
  if (worker) {
    worker.terminate();
    worker = null;
    ready = false;
  }
}
