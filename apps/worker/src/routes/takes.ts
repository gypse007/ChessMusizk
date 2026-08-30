import { Hono } from 'hono';

interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  JOBS: Queue;
  CONFIG: KVNamespace;
  TURNSTILE_SECRET: string;
  WORKER_SHARED_TOKEN: string;
  EXPORT_VIDEO: string;
}

const takesRouter = new Hono<{ Bindings: Env }>();

takesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const take = await c.env.DB.prepare(
    `SELECT id, job_id, idx, audio_key, seed, landmarks_json, anchor_map_json, created_at
     FROM takes WHERE id = ?`)
    .bind(id)
    .first<{
      id: string;
      job_id: string;
      idx: number;
      audio_key: string;
      seed: number;
      landmarks_json: string;
      anchor_map_json: string;
      created_at: number;
    }>();

  if (!take) {
    return c.json({ error: 'not_found' }, 404);
  }

  const rangeHeader = c.req.header('range');
  const object = await c.env.AUDIO.get(take.audio_key, { range: rangeHeader ?? undefined });

  if (!object) {
    return c.json({ error: 'audio_missing' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.etag);
  headers.set('accept-ranges', 'bytes');
  if (object.httpMetadata?.contentType) {
    headers.set('content-type', object.httpMetadata.contentType);
  } else {
    headers.set('content-type', 'audio/opus');
  }

  const status = object.body && rangeHeader ? 206 : 200;

  return new Response(object.body, {
    status,
    headers,
  });
});

export { takesRouter };
