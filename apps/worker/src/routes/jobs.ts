import { Hono } from 'hono';

export interface QueueMessage {
  jobId: string;
  targetSec: number;
}

interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  JOBS: Queue<QueueMessage>;
  CONFIG: KVNamespace;
  TURNSTILE_SECRET: string;
  WORKER_SHARED_TOKEN: string;
  EXPORT_VIDEO: string;
}

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const jobsRouter = new Hono<{ Bindings: Env }>();

const PGN_MAX_LENGTH = 12000;

async function verifyTurnstile(token: string, secret: string, remoteip?: string): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteip) body.set('remoteip', remoteip);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

function validatePgn(pgn: unknown): pgn is string {
  if (typeof pgn !== 'string') return false;
  if (pgn.length === 0) return false;
  if (pgn.length > PGN_MAX_LENGTH) return false;
  return true;
}

function targetSecFromPlyCount(pgn: string): 60 | 75 {
  const moveTokens = pgn.match(/\d+\.\s*[^\s]+/g);
  const plyEstimate = moveTokens ? moveTokens.length * 2 : 0;
  return plyEstimate > 100 ? 75 : 60;
}

jobsRouter.post('/', async (c) => {
  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) {
    return c.json({ error: 'content_type_must_be_json' }, 415);
  }

  let body: { pgn?: unknown; userId?: unknown; token?: unknown; eventGraph?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (!validatePgn(body.pgn)) {
    return c.json({ error: 'invalid_pgn' }, 400);
  }

  const userId = typeof body.userId === 'string' && body.userId.length > 0 ? body.userId : null;
  const eventGraphJson = typeof body.eventGraph === 'string' ? body.eventGraph : null;

  const turnstileToken = typeof body.token === 'string' ? body.token : '';
  const ip = c.req.header('cf-connecting-ip') || undefined;
  const turnstileOk = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET, ip);
  if (!turnstileOk) {
    return c.json({ error: 'turnstile_failed' }, 403);
  }

  const jobId = crypto.randomUUID();
  const targetSec = targetSecFromPlyCount(body.pgn);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO jobs (id, user_id, pgn, event_graph_json, status, target_sec, stage_updated_at, created_at)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`)
    .bind(jobId, userId, body.pgn, eventGraphJson, targetSec, now, now)
    .run();

  await c.env.JOBS.send({ jobId, targetSec } satisfies QueueMessage, { contentType: 'json' });

  return c.json({ id: jobId, status: 'queued', targetSec }, 202);
});

jobsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const accept = c.req.header('accept') || '';

  if (accept.includes('text/event-stream')) {
    return streamJobStatus(c, id);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, user_id, pgn, event_graph_json, status, target_sec, stage_updated_at, error, created_at
     FROM jobs WHERE id = ?`)
    .bind(id)
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

  if (!row) {
    return c.json({ error: 'not_found' }, 404);
  }

  const takes = await c.env.DB.prepare(
    `SELECT id, job_id, idx, audio_key, seed, landmarks_json, anchor_map_json, created_at
     FROM takes WHERE job_id = ? ORDER BY idx ASC`)
    .bind(id)
    .all<{
      id: string;
      job_id: string;
      idx: number;
      audio_key: string;
      seed: number;
      landmarks_json: string;
      anchor_map_json: string;
      created_at: number;
    }>();

  let eventGraph: unknown = null;
  if (row.event_graph_json) {
    try { eventGraph = JSON.parse(row.event_graph_json); } catch { /* ignore */ }
  }

  return c.json({
    id: row.id,
    userId: row.user_id,
    pgn: row.pgn,
    eventGraph,
    status: row.status,
    targetSec: row.target_sec,
    stageUpdatedAt: row.stage_updated_at,
    error: row.error,
    createdAt: row.created_at,
    takes: takes.results?.map((t) => ({
      id: t.id,
      idx: t.idx,
      audioKey: t.audio_key,
      seed: t.seed,
      landmarksJson: t.landmarks_json,
      anchorMapJson: t.anchor_map_json,
    })) ?? [],
  });
});

async function streamJobStatus(c: { req: { param: (k: string) => string }; env: Env; executionCtx: any }, jobId: string) {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const initial = await c.env.DB.prepare(
        `SELECT id, status, target_sec, stage_updated_at, error, created_at FROM jobs WHERE id = ?`)
        .bind(jobId)
        .first<{ id: string; status: string; target_sec: number; stage_updated_at: number; error: string | null; created_at: number }>();

      if (!initial) {
        send({ error: 'not_found' });
        controller.close();
        return;
      }

      send({
        id: initial.id,
        status: initial.status,
        targetSec: initial.target_sec,
        stageUpdatedAt: initial.stage_updated_at,
        error: initial.error,
        createdAt: initial.created_at,
      });

      if (initial.status === 'done' || initial.status === 'failed') {
        controller.close();
        return;
      }

      let lastSnapshot = `${initial.status}:${initial.stage_updated_at}`;

      intervalId = setInterval(async () => {
        try {
          const row = await c.env.DB.prepare(
            `SELECT status, stage_updated_at, error FROM jobs WHERE id = ?`)
            .bind(jobId)
            .first<{ status: string; stage_updated_at: number; error: string | null }>();
          if (!row) {
            send({ error: 'not_found' });
            controller.close();
            return;
          }
          const snapshot = `${row.status}:${row.stage_updated_at}`;
          if (snapshot !== lastSnapshot) {
            lastSnapshot = snapshot;
            send({ status: row.status, stageUpdatedAt: row.stage_updated_at, error: row.error });
          }
          if (row.status === 'done' || row.status === 'failed') {
            controller.close();
          }
        } catch {
          controller.close();
        }
      }, 2000);

      c.executionCtx.waitUntil(
        new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (controller.desiredSize === null) {
              clearInterval(check);
              resolve();
            }
          }, 250);
        }).then(() => {
          if (intervalId) clearInterval(intervalId);
        })
      );
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  c.executionCtx.waitUntil(
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
        resolve();
      }, 120000);
    })
  );

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

jobsRouter.get('/health', async (c) => {
  const heartbeat = await c.env.CONFIG.get('poller:heartbeat');
  const lastBeat = heartbeat ? parseInt(heartbeat, 10) : 0;
  const now = Math.floor(Date.now() / 1000);
  const stale = lastBeat > 0 && now - lastBeat > 120;

  const counts = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM jobs GROUP BY status`)
    .all<{ status: string; n: number }>();

  const byStatus: Record<string, number> = {};
  for (const row of counts.results ?? []) {
    byStatus[row.status] = row.n;
  }

  return c.json({
    ok: true,
    pollerHeartbeat: lastBeat,
    pollerStale: stale,
    counts: byStatus,
    ts: now,
  });
});

export { jobsRouter };
