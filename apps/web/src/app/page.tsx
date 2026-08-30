'use client';

import { useState, useCallback } from 'react';
import PgnInput from '@/features/pgn/PgnInput';
import ChessBoard from '@/features/board/ChessBoard';
import GenerateButton from '@/features/generate/GenerateButton';
import type { EventGraph, JobStatus } from '@chess-to-music/shared';

const SAMPLE_PGN = `[Event "World Championship"]
[Site "London"]
[Date "2023.11.23"]
[Round "1"]
[White "Carlsen, Magnus"]
[Black "Nepomniachtchi, Ian"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Bb7 10. d4 Re8 11. Nbd2 Bf8 12. a4 h6 13. Bc2 exd4 14. cxd4 Nb4 15. Bb1 c5 16. d5 Nd7 17. Ra3 c4 18. Nd4 Nc5 19. Rc3 Ne6 20. Nxe6 Bxe6 21. Bxe6 fxe6 22. Rc6 Qd7 23. Rxe6 Rxe6 24. Bxe6+ Kh8 25. Qe2 Rf8 26. Bxc4 bxc4 27. Qxc4 Re8 28. Qc6 Qxc6 29. dxc6 Nxc6 30. b3 Ne7 31. Rc1 Nd5 32. Nxd5 Bxd5 33. Rc8+ Bxc8 34. c7 Bf5 35. c8=Q Bxc8 36. Bxc8 1-0`;

export default function HomePage() {
  const [pgn, setPgn] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('queued');
  const [eventGraph, setEventGraph] = useState<EventGraph | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async (inputPgn: string) => {
    setPgn(inputPgn);
    setJobId(null);
    setJobStatus('queued');
    setEventGraph(null);
    setAnalysisError(null);

    try {
      const { analyzePgn } = await import('@/features/analysis/StockfishWorker');
      const graph = await analyzePgn(inputPgn);
      setEventGraph(graph);
    } catch (e) {
      console.error(e);
      setAnalysisError('Analysis failed. Stockfish may not be loaded.');
    }
  }, []);

  const handleLoadSample = useCallback(() => {
    handleAnalyze(SAMPLE_PGN);
  }, [handleAnalyze]);

  const handleJobCreated = useCallback((id: string) => {
    setJobId(id);
    setJobStatus('queued');
  }, []);

  const handleStatusChange = useCallback((status: JobStatus) => {
    setJobStatus(status);
  }, []);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-gold-400 via-gold-300 to-gold-500 bg-clip-text text-transparent">
              ♛ CHESS → MUSIC
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto text-balance">
            Your game. Your soundtrack.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <PgnInput
              onAnalyze={handleAnalyze}
              onLoadSample={handleLoadSample}
            />

            {analysisError && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                <p className="text-sm text-red-300">{analysisError}</p>
              </div>
            )}

            {eventGraph && (
              <div className="glass-gold rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-gold-300 mb-3 uppercase tracking-wider">
                  Event Graph Ready
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  {eventGraph.moves.length} moves analyzed · {eventGraph.anchors.length} anchors found
                </p>
                <GenerateButton
                  jobId={jobId}
                  pgn={pgn}
                  eventGraph={eventGraph}
                  onJobCreated={handleJobCreated}
                  onStatusChange={handleStatusChange}
                  onComplete={() => setJobStatus('done')}
                />
              </div>
            )}

            {jobId && jobStatus !== 'done' && jobStatus !== 'failed' && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-300">
                    {jobStatus === 'queued' && 'Queued...'}
                    {jobStatus === 'analyzing' && 'Analyzing game...'}
                    {jobStatus === 'arc' && 'Finding musical arc...'}
                    {jobStatus === 'composing' && 'Composing...'}
                    {jobStatus === 'mastering' && 'Mastering...'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {jobStatus.toUpperCase()}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: jobStatus === 'queued' ? '5%' :
                        jobStatus === 'analyzing' ? '25%' :
                        jobStatus === 'arc' ? '50%' :
                        jobStatus === 'composing' ? '75%' :
                        jobStatus === 'mastering' ? '90%' : '0%',
                    }}
                  />
                </div>
              </div>
            )}

            {jobStatus === 'failed' && (
              <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                <p className="text-sm text-red-300">Generation failed. Please try again.</p>
              </div>
            )}
          </div>

          <div>
            <ChessBoard pgn={pgn} />
          </div>
        </div>
      </div>
    </main>
  );
}
