'use client';

import { useMemo } from 'react';
import type { Landmark } from '@chess-to-music/shared';

interface WaveformProps {
  landmarks: Landmark[];
  anchorMap: Array<{ ply: number; tSec: number }>;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export default function Waveform({
  landmarks,
  anchorMap,
  duration,
  currentTime,
  onSeek,
}: WaveformProps) {
  const bars = useMemo(() => {
    const count = 120;
    const arr: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i / count) * duration;
      const nearLandmark = landmarks.find(l => Math.abs(l.tSec - t) < duration * 0.05);
      if (nearLandmark) {
        arr.push(0.6 + Math.random() * 0.4);
      } else {
        arr.push(0.1 + Math.random() * 0.4);
      }
    }
    return arr;
  }, [landmarks, duration]);

  const maxBar = Math.max(...bars, 0.01);

  const handleClick = (e: React.MouseEvent<SVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    onSeek(Math.max(0, Math.min(duration, pct * duration)));
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 1200 200"
        className="w-full h-32 sm:h-40 cursor-pointer"
        onClick={handleClick}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="waveformGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(212,168,42,0.8)" />
            <stop offset="50%" stopColor="rgba(212,168,42,0.5)" />
            <stop offset="100%" stopColor="rgba(212,168,42,0.2)" />
          </linearGradient>
          <linearGradient id="progressGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(139,92,246,0.9)" />
            <stop offset="100%" stopColor="rgba(139,92,246,0.4)" />
          </linearGradient>
        </defs>

        {bars.map((h, i) => {
          const x = (i / bars.length) * 1200;
          const barWidth = 1200 / bars.length - 2;
          const barHeight = (h / maxBar) * 160;
          const y = 100 - barHeight / 2;
          const isPlayed = (i / bars.length) * 100 < progressPct;
          const isAnchor = landmarks.some(l => {
            const idx = (l.tSec / duration) * bars.length;
            return Math.abs(idx - i) < 2;
          });

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={Math.max(barWidth, 2)}
              height={barHeight}
              fill={isPlayed ? 'url(#progressGrad)' : isAnchor ? 'url(#waveformGrad)' : 'rgba(148,163,184,0.3)'}
              rx={1}
            />
          );
        })}

        {anchorMap.map((anchor, idx) => {
          const x = (anchor.tSec / duration) * 1200;
          return (
            <line
              key={`anchor-${idx}`}
              x1={x}
              y1="10"
              x2={x}
              y2="190"
              stroke="rgba(212,168,42,0.6)"
              strokeWidth="2"
              strokeDasharray="4,4"
            />
          );
        })}

        <line
          x1={(progressPct / 100) * 1200}
          y1="10"
          x2={(progressPct / 100) * 1200}
          y2="190"
          stroke="rgba(139,92,246,0.9)"
          strokeWidth="2"
        />
      </svg>

      <div className="flex justify-between text-xs text-slate-500 font-mono">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
