'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Waveform from './Waveform';
import SharePanel from '../share/SharePanel';

interface TakesCarouselProps {
  jobId: string;
  takes: Array<{ id: string; audioUrl: string; seed: number; landmarks: Array<{ tSec: number; type: string }>; anchorMap: Array<{ ply: number; tSec: number }> }>;
}

export default function TakesCarousel({ jobId, takes }: TakesCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  const currentTake = takes[currentIndex];

  useEffect(() => {
    if (!audioRef.current || !currentTake) return;
    audioRef.current.src = currentTake.audioUrl;
    audioRef.current.load();
    setCurrentTime(0);
    setIsPlaying(false);
  }, [currentIndex, currentTake]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };

  const handleTouchEnd = () => {
    const threshold = 50;
    if (Math.abs(touchDeltaX.current) > threshold) {
      if (touchDeltaX.current > 0 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      } else if (touchDeltaX.current < 0 && currentIndex < takes.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }
    touchDeltaX.current = 0;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && currentIndex > 0) setCurrentIndex(currentIndex - 1);
    if (e.key === 'ArrowRight' && currentIndex < takes.length - 1) setCurrentIndex(currentIndex + 1);
  };

  if (!currentTake) {
    return <div className="p-8 text-center text-slate-400">No takes available</div>;
  }

  const landmarks = (currentTake.landmarks || []) as import('@chess-to-music/shared').Landmark[];
  const anchorMap = currentTake.anchorMap || [];

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Take {currentIndex + 1}</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">
                Seed {currentTake.seed}
              </span>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 sm:p-8 mb-6">
            <div className="aspect-video w-full rounded-xl bg-slate-900 flex items-center justify-center mb-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 to-gold-900/20" />
              <div className="relative z-10 text-center">
                <div className="text-6xl mb-4">♛</div>
                <p className="text-sm text-slate-400">Chess → Music</p>
              </div>
            </div>

            <Waveform
              landmarks={landmarks}
              anchorMap={anchorMap}
              duration={duration}
              currentTime={currentTime}
              onSeek={seek}
            />

            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
                  }}
                  disabled={currentIndex === 0}
                  className="btn-ghost disabled:opacity-30"
                >
                  ←
                </button>
                <button onClick={togglePlay} className="btn-primary">
                  {isPlaying ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (currentIndex < takes.length - 1) setCurrentIndex(currentIndex + 1);
                  }}
                  disabled={currentIndex === takes.length - 1}
                  className="btn-ghost disabled:opacity-30"
                >
                  →
                </button>
              </div>

              <SharePanel jobId={jobId} takeId={currentTake.id} />
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-slate-500">
              Take {currentIndex + 1} of {takes.length} · Swipe or use arrow keys to navigate
            </p>
          </div>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
