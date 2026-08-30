import { Hono } from 'hono';

type JobStatus = 'queued' | 'analyzing' | 'arc' | 'composing' | 'mastering' | 'done' | 'failed';

interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  JOBS: Queue;
  CONFIG: KVNamespace;
  TURNSTILE_SECRET: string;
  WORKER_SHARED_TOKEN: string;
  EXPORT_VIDEO: string;
}

const internalRouter = new Hono<{ Bindings: Env }>();

const validStatuses: JobStatus[] = [
  'queued',
  'analyzing',
  'arc',
  'composing',
  'mastering',
  'done',
  'failed',
];

function isJobStatus(s: string): s is JobStatus {
  return (validStatuses as string[]).includes(s);
}

async function requireSharedToken(c: { req: { header: (k: string) => string | undefined }; env: Env }): Promise<boolean> {
  const auth = c.req.header('authorization') || '';
  const prefix = 'Bearer ';
  if (!auth.startsWith(prefix)) return false;
  const token = auth.slice(prefix.length).trim();
  return token.length > 0 && token === c.env.WORKER_SHARED_TOKEN;
}

internalRouter.post('/claim', async (c) => {
  if (!(await requireSharedToken(c))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const now = Math.floor(Date.now() / 1000);

  const queued = await c.env.DB.prepare(
    `SELECT id, user_id, pgn, event_graph_json, status, target_sec, stage_updated_at, error, created_at
     FROM jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     LIMIT 1`)
    .first<{
      id: string;
      user_id: string | null;
      pgn: string;
      event_graph_json: string | null;
      status: string;
      target_sec: number;
      stage_updated_at: number;
      error: string | null;
      created_at: number;
    }>();

  if (!queued) {
    return new Response(null, { status: 204 });
  }

  const updated = await c.env.DB.prepare(
    `UPDATE jobs SET status = 'analyzing', stage_updated_at = ? WHERE id = ? AND status = 'queued'`)
    .bind(now, queued.id)
    .run();

  if (!updated.meta || updated.meta.changes === 0) {
    return new Response(null, { status: 204 });
  }

  let eventGraph: unknown = null;
  if (queued.event_graph_json) {
    try { eventGraph = JSON.parse(queued.event_graph_json); } catch { /* ignore */ }
  }

  return c.json({
    id: queued.id,
    userId: queued.user_id,
    pgn: queued.pgn,
    eventGraph,
    targetSec: queued.target_sec,
    status: 'analyzing',
  });
});

internalRouter.post('/status', async (c) => {
  if (!(await requireSharedToken(c))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) {
    return c.json({ error: 'content_type_must_be_json' }, 415);
  }

  let body: { jobId?: unknown; status?: unknown; error?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
    return c.json({ error: 'invalid_jobId' }, 400);
  }
  if (typeof body.status !== 'string' || !isJobStatus(body.status)) {
    return c.json({ error: 'invalid_status' }, 400);
  }

  const errorMsg = typeof body.error === 'string' ? body.error : null;
  const now = Math.floor(Date.now() / 1000);

  const existing = await c.env.DB.prepare(
    `SELECT status FROM jobs WHERE id = ?`)
    .bind(body.jobId)
    .first<{ status: string }>();

  if (!existing) {
    return c.json({ error: 'not_found' }, 404);
  }

  if (existing.status === 'done' || existing.status === 'failed') {
    return c.json({ error: 'job_terminal' }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE jobs SET status = ?, error = ?, stage_updated_at = ? WHERE id = ?`)
    .bind(body.status, errorMsg, now, body.jobId)
    .run();

  return c.json({ ok: true, jobId: body.jobId, status: body.status });
});

interface CompleteTakeInput {
  idx: number;
  audioKey: string;
  seed: number;
  landmarksJson: string;
  anchorMapJson: string;
}

internalRouter.post('/complete', async (c) => {
  if (!(await requireSharedToken(c))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) {
    return c.json({ error: 'content_type_must_be_json' }, 415);
  }

  let body: { jobId?: unknown; takes?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
    return c.json({ error: 'invalid_jobId' }, 400);
  }
  if (!Array.isArray(body.takes) || body.takes.length === 0) {
    return c.json({ error: 'invalid_takes' }, 400);
  }

  const job = await c.env.DB.prepare(
    `SELECT id, status FROM jobs WHERE id = ?`)
    .bind(body.jobId)
    .first<{ id: string; status: string }>();

  if (!job) {
    return c.json({ error: 'not_found' }, 404);
  }
  if (job.status === 'done' || job.status === 'failed') {
    return c.json({ error: 'job_terminal' }, 409);
  }

  const now = Math.floor(Date.now() / 1000);
  const stmts: D1PreparedStatement[] = [];

  for (const raw of body.takes as unknown[]) {
    const t = raw as Partial<CompleteTakeInput>;
    if (typeof t.idx !== 'number') return c.json({ error: 'invalid_take_idx' }, 400);
    if (typeof t.audioKey !== 'string' || t.audioKey.length === 0) return c.json({ error: 'invalid_audio_key' }, 400);
    if (typeof t.seed !== 'number') return c.json({ error: 'invalid_seed' }, 400);
    if (typeof t.landmarksJson !== 'string') return c.json({ error: 'invalid_landmarks' }, 400);
    if (typeof t.anchorMapJson !== 'string') return c.json({ error: 'invalid_anchor_map' }, 400);

    const takeId = crypto.randomUUID();
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO takes (id, job_id, idx, audio_key, seed, landmarks_json, anchor_map_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(takeId, body.jobId, t.idx, t.audioKey, t.seed, t.landmarksJson, t.anchorMapJson, now)
    );
  }

  stmts.push(
    c.env.DB.prepare(
      `UPDATE jobs SET status = 'done', error = NULL, stage_updated_at = ? WHERE id = ?`)
      .bind(now, body.jobId)
  );

  await c.env.DB.batch(stmts);

  return c.json({ ok: true, jobId: body.jobId, status: 'done', count: body.takes.length });
});

internalRouter.post('/heartbeat', async (c) => {
  if (!(await requireSharedToken(c))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const now = Math.floor(Date.now() / 1000);
  await c.env.CONFIG.put('poller:heartbeat', now.toString());
  return c.json({ ok: true, ts: now });
});

export { internalRouter };
