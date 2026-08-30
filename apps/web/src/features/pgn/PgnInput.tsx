'use client';

import { useState, useCallback, useRef } from 'react';

interface PgnInputProps {
  onAnalyze: (pgn: string) => void;
  onLoadSample: () => void;
}

export default function PgnInput({ onAnalyze, onLoadSample }: PgnInputProps) {
  const [pgn, setPgn] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (pgn.trim()) {
      onAnalyze(pgn.trim());
    }
  }, [pgn, onAnalyze]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setPgn(content);
      onAnalyze(content);
    };
    reader.readAsText(file);
  }, [onAnalyze]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.pgn')) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="glass rounded-2xl p-6 sm:p-8">
      <h2 className="text-xl font-semibold mb-1">Import Game</h2>
      <p className="text-sm text-slate-400 mb-6">
        Paste PGN or upload a .pgn file
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="pgn-input" className="sr-only">PGN input</label>
          <textarea
            id="pgn-input"
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Paste your PGN here..."
            rows={8}
            className="input-field font-mono text-xs resize-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="submit" className="btn-primary flex-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            Analyze Game
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload .pgn
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pgn"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      </form>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`mt-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDragging
            ? 'border-gold-500/50 bg-gold-500/5'
            : 'border-white/10 hover:border-white/20'
        }`}
      >
        <p className="text-sm text-slate-400">or drag & drop a .pgn file here</p>
      </div>

      <div className="mt-6 pt-6 border-t border-white/10">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">
          Don&apos;t have a game?
        </p>
        <button
          onClick={onLoadSample}
          className="btn-ghost text-gold-400 hover:text-gold-300"
        >
          Try a sample game →
        </button>
      </div>
    </div>
  );
}
