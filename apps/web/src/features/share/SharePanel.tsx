'use client';

import { useState } from 'react';

interface SharePanelProps {
  jobId: string;
  takeId: string;
}

export default function SharePanel({ jobId, takeId }: SharePanelProps) {
  const [kind, setKind] = useState<'web' | 'gif'>('web');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ takeId, kind }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShareUrl(data.url);
    } catch {
      setShareUrl(`/player/${jobId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-full border border-white/10 overflow-hidden">
        <button
          onClick={() => setKind('web')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            kind === 'web'
              ? 'bg-gold-500/20 text-gold-300'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Link
        </button>
        <button
          onClick={() => setKind('gif')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            kind === 'gif'
              ? 'bg-gold-500/20 text-gold-300'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          GIF
        </button>
      </div>

      {!shareUrl ? (
        <button onClick={handleShare} disabled={loading} className="btn-ghost text-xs">
          {loading ? 'Sharing...' : 'Share'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono max-w-[150px] truncate">
            {shareUrl}
          </span>
          <button onClick={handleCopy} className="btn-ghost text-xs">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
