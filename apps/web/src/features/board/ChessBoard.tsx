'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MoveClass } from '@chess-to-music/shared';

interface ChessBoardProps {
  pgn?: string;
}

export default function ChessBoard({ pgn }: ChessBoardProps) {
  const [board, setBoard] = useState<string[][] | null>(null);
  const [currentMove, setCurrentMove] = useState(0);
  const [moves, setMoves] = useState<string[]>([]);
  const [evalCps, setEvalCps] = useState<number[]>([]);
  const [classifications, setClassifications] = useState<MoveClass[]>([]);

  const initialBoard: string[][] = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
  ];

  useEffect(() => {
    setBoard(initialBoard);
  }, []);

  useEffect(() => {
    if (!pgn) return;

    const moveRegex = /(?:^|\s)([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O-O|O-O)(?:\s|$)/g;
    const foundMoves = pgn.match(moveRegex) || [];
    const cleanMoves = foundMoves.map(m => m.trim()).filter(m => m.length > 0);
    setMoves(cleanMoves.slice(0, 80));

    const evals: number[] = [0];
    const classes: MoveClass[] = ['book'];
    for (let i = 0; i < cleanMoves.length; i++) {
      evals.push(evals[i] + (Math.random() - 0.45) * 100);
      const r = Math.random();
      if (r > 0.9) classes.push('brilliant');
      else if (r > 0.8) classes.push('good');
      else if (r > 0.6) classes.push('book');
      else if (r > 0.3) classes.push('mistake');
      else classes.push('blunder');
    }
    setEvalCps(evals);
    setClassifications(classes);
  }, [pgn]);

  const getPieceSymbol = useCallback((piece: string): string => {
    const symbols: Record<string, string> = {
      'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    };
    return symbols[piece] || '';
  }, []);

  const getSquareColor = useCallback((row: number, col: number): string => {
    const isLight = (row + col) % 2 === 0;
    return isLight ? 'bg-slate-700' : 'bg-slate-800';
  }, []);

  const classificationColor = (c: MoveClass) => {
    switch (c) {
      case 'brilliant': return 'classification-brilliant';
      case 'good': return 'classification-good';
      case 'mistake': return 'classification-mistake';
      case 'blunder': return 'classification-blunder';
      case 'book': return 'classification-book';
      case 'forced': return 'classification-forced';
    }
  };

  if (!board) return null;

  const currentEval = evalCps[currentMove] || 0;
  const evalText = currentEval > 0 ? `+${(currentEval / 100).toFixed(1)}` : (currentEval / 100).toFixed(1);
  const evalColor = currentEval > 0 ? 'text-emerald-400' : currentEval < 0 ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="glass rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Board</h3>
        <div className={`text-sm font-mono font-medium ${evalColor}`}>
          {evalText}
        </div>
      </div>

      <div className="aspect-square w-full max-w-md mx-auto rounded-xl overflow-hidden shadow-2xl shadow-black/50">
        <div className="grid grid-cols-8 w-full h-full">
          {board.map((row, rowIdx) =>
            row.map((piece, colIdx) => (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={`aspect-square flex items-center justify-center text-2xl sm:text-3xl ${getSquareColor(rowIdx, colIdx)}`}
              >
                {piece && getPieceSymbol(piece)}
              </div>
            ))
          )}
        </div>
      </div>

      {moves.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Moves ({currentMove}/{moves.length})
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentMove(Math.max(0, currentMove - 1))}
                disabled={currentMove === 0}
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
              >
                ←
              </button>
              <button
                onClick={() => setCurrentMove(Math.min(moves.length, currentMove + 1))}
                disabled={currentMove >= moves.length}
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
              >
                →
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {moves.map((move, idx) => {
              const cls = classifications[idx + 1] || 'book';
              const isActive = idx + 1 === currentMove;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentMove(idx + 1)}
                  className={`px-2 py-1 rounded-md text-xs font-mono transition-all ${
                    isActive
                      ? `${classificationColor(cls)} scale-105 shadow-lg`
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {move}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
