'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { EventGraph, JobStatus } from '@chess-to-music/shared';
import { createJob, getJob, getTakes } from '@/lib/api';

interface GenerateButtonProps {
  jobId: string | null;
  pgn: string;
  eventGraph: EventGraph;
  onJobCreated?: (id: string) => void;
  onStatusChange?: (status: JobStatus) => void;
  onComplete?: () => void;
}

const STAGES: Array<{ status: JobStatus; label: string; icon: string }> = [
  { status: 'arc', label: 'Mapping arc', icon: '◈' },
  { status: 'composing', label: 'Composing', icon: '♪' },
  { status: 'mastering', label: 'Mastering', icon: '◉' },
  { status: 'done', label: 'Ready', icon: '✓' },
];

export default function GenerateButton({
  jobId,
  pgn,
  eventGraph,
  onJobCreated,
  onStatusChange,
  onComplete,
}: GenerateButtonProps) {
  const [status, setStatus] = useState<JobStatus>('queued');
  const [takes, setTakes] = useState<Array<{ id: string; audioUrl: string; seed: number; landmarks: Array<{ tSec: number; type: string }>; anchorMap: Array<{ ply: number; tSec: number }> }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setError(null);
    setIsGenerating(true);

    try {
      let currentJobId = jobId;
      if (!currentJobId) {
        const job = await createJob({ pgn, eventGraph });
        currentJobId = job.id;
        onJobCreated?.(currentJobId);
      }

      setStatus('queued');
      onStatusChange?.('queued');

      pollRef.current = setInterval(async () => {
        try {
          const job = await getJob(currentJobId!);
          const newStatus = job.status as JobStatus;
          setStatus(newStatus);
          onStatusChange?.(newStatus);

          if (newStatus === 'done') {
            cleanup();
            const takesData = await getTakes(currentJobId!);
            setTakes(takesData);
            setIsGenerating(false);
            onComplete?.();
          } else if (newStatus === 'failed') {
            cleanup();
            setError('Generation failed. Please try again.');
            setIsGenerating(false);
          }
        } catch {
          cleanup();
          setError('Connection lost. Please refresh.');
          setIsGenerating(false);
        }
      }, 2000);
    } catch (e) {
      console.error(e);
      setError('Failed to start generation.');
      setIsGenerating(false);
    }
  }, [jobId, pgn, eventGraph, isGenerating, onJobCreated, onStatusChange, onComplete, cleanup]);

  const currentStageIdx = STAGES.findIndex(s => s.status === status);

  return (
    <div className="space-y-4">
      {!takes.length && status !== 'done' && status !== 'failed' && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="btn-primary w-full"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3 2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3 2 3 .895 3 2zM9 10l12-3" />
          </svg>
          {isGenerating ? 'Creating Soundtrack...' : 'Create Soundtrack'}
        </button>
      )}

      {isGenerating && (
        <div className="space-y-3">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${((currentStageIdx + 1) / STAGES.length) * 100}%` }} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {STAGES.map((stage, idx) => (
              <div
                key={stage.status}
                className={`text-center p-3 rounded-xl border transition-all ${
                  idx <= currentStageIdx
                    ? 'border-gold-500/50 bg-gold-500/10'
                    : 'border-white/5 bg-white/5'
                }`}
              >
                <div className="text-lg mb-1">{stage.icon}</div>
                <div className="text-xs text-slate-400">{stage.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {takes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Soundtrack ready</p>
          <div className="grid grid-cols-2 gap-3">
            {takes.map((take) => (
              <div
                key={take.id}
                className="glass-gold rounded-xl p-4 text-center cursor-pointer hover:border-gold-500/40 transition-colors"
              >
                <div className="text-2xl mb-2">♪</div>
                <div className="text-sm font-medium text-gold-300">
                  Take {take.id.split('-').pop()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
