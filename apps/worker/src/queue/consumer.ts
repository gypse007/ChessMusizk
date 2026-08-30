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

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [5000, 15000, 60000];

export async function handleQueue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const { jobId } = message.body;

    try {
      const job = await env.DB.prepare(
        `SELECT id, status, target_sec FROM jobs WHERE id = ?`)
        .bind(jobId)
        .first<{ id: string; status: string; target_sec: number }>();

      if (!job) {
        message.ack();
        continue;
      }

      if (job.status === 'done' || job.status === 'failed') {
        message.ack();
        continue;
      }

      if (job.status !== 'queued') {
        message.ack();
        continue;
      }

      const now = Math.floor(Date.now() / 1000);
      const updated = await env.DB.prepare(
        `UPDATE jobs SET status = 'analyzing', stage_updated_at = ? WHERE id = ? AND status = 'queued'`)
        .bind(now, jobId)
        .run();

      if (!updated.meta || updated.meta.changes === 0) {
        message.ack();
        continue;
      }

      message.ack();
    } catch (err) {
      console.error(`queue: failed to process job ${jobId}:`, err);
      const attempts = message.attempts ?? 0;
      if (attempts >= MAX_RETRIES) {
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          `UPDATE jobs SET status = 'failed', error = ?, stage_updated_at = ? WHERE id = ?`)
          .bind('queue_exhausted', now, jobId)
          .run();
        message.ack();
      } else {
        message.retry({ delaySeconds: Math.floor((RETRY_DELAYS_MS[attempts] ?? 60000) / 1000) });
      }
    }
  }
}
