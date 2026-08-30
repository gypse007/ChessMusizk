import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jobsRouter } from './routes/jobs';
import { takesRouter } from './routes/takes';
import { shareRouter } from './routes/share';
import { internalRouter } from './routes/internal';

export interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  JOBS: Queue<QueueMessage>;
  CONFIG: KVNamespace;
  TURNSTILE_SECRET: string;
  WORKER_SHARED_TOKEN: string;
  EXPORT_VIDEO: string;
}

export interface QueueMessage {
  jobId: string;
  targetSec: number;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.route('/jobs', jobsRouter);
app.route('/takes', takesRouter);
app.route('/share', shareRouter);
app.route('/internal', internalRouter);

app.get('/health', (c) => {
  return c.json({ ok: true, ts: Date.now() });
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('unhandled error:', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const { handleQueue } = await import('./queue/consumer');
    await handleQueue(batch, env);
  },
};
