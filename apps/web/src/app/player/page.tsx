'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import TakesCarousel from '@/features/player/TakesCarousel';

function PlayerContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('job');
  const [job, setJob] = useState<{ status: string; takes?: Array<{ id: string; audioUrl: string; seed: number; landmarks: Array<{ tSec: number; type: string }>; anchorMap: Array<{ ply: number; tSec: number }> }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      setError(true);
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/jobs/${jobId}`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        setJob(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError(true);
      });
  }, [jobId]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Loading soundtrack...</p>
        </div>
      </main>
    );
  }

  if (error || !job || job.status !== 'done' || !job.takes?.length) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Soundtrack not found or still being generated.</p>
          {job && <p className="text-sm text-slate-500">Status: {job.status}</p>}
        </div>
      </main>
    );
  }

  return <TakesCarousel jobId={jobId!} takes={job.takes} />;
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Loading...</p>
        </div>
      </main>
    }>
      <PlayerContent />
    </Suspense>
  );
}
