import type { Job, CreateJobRequest, ShareRequest } from '@chess-to-music/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createJob(req: CreateJobRequest): Promise<Job> {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<Job>(res);
}

export async function getJob(id: string): Promise<Job & { takes?: Array<{ id: string; audioUrl: string }> }> {
  const res = await fetch(`${API_BASE}/jobs/${id}`, {
    cache: 'no-store',
  });
  return handleResponse(res);
}

export async function getTakes(jobId: string): Promise<Array<{ id: string; audioUrl: string; seed: number; landmarks: Array<{ tSec: number; type: string }>; anchorMap: Array<{ ply: number; tSec: number }> }>> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/takes`);
  return handleResponse(res);
}

export async function getTakeAudio(takeId: string): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/takes/${takeId}/audio`);
  return handleResponse(res);
}

export async function shareTake(req: ShareRequest): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse(res);
}

export async function getShare(shareId: string): Promise<{ takeId: string; url: string }> {
  const res = await fetch(`${API_BASE}/share/${shareId}`);
  return handleResponse(res);
}
