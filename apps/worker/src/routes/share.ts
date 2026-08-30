import { Hono } from 'hono';

interface ShareRequest {
  takeId: string;
  kind: 'web' | 'gif';
}

interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  JOBS: Queue;
  CONFIG: KVNamespace;
  TURNSTILE_SECRET: string;
  WORKER_SHARED_TOKEN: string;
  EXPORT_VIDEO: string;
}

const shareRouter = new Hono<{ Bindings: Env }>();

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SLUG_LENGTH = 8;

function generateSlug(): string {
  const bytes = new Uint8Array(SLUG_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

shareRouter.post('/', async (c) => {
  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) {
    return c.json({ error: 'content_type_must_be_json' }, 415);
  }

  let body: Partial<ShareRequest>;
  try {
    body = (await c.req.json()) as Partial<ShareRequest>;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (typeof body.takeId !== 'string' || body.takeId.length === 0) {
    return c.json({ error: 'invalid_takeId' }, 400);
  }
  if (body.kind !== 'web' && body.kind !== 'gif') {
    return c.json({ error: 'invalid_kind' }, 400);
  }

  if (body.kind === 'gif' && c.env.EXPORT_VIDEO !== 'true') {
    return c.json({ error: 'gif_export_disabled' }, 403);
  }

  const take = await c.env.DB.prepare(`SELECT id FROM takes WHERE id = ?`).bind(body.takeId).first<{ id: string }>();
  if (!take) {
    return c.json({ error: 'take_not_found' }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    const existing = await c.env.DB.prepare(`SELECT slug FROM shares WHERE slug = ?`).bind(slug).first();
    if (existing) continue;
    await c.env.DB.prepare(
      `INSERT INTO shares (slug, take_id, kind, created_at) VALUES (?, ?, ?, ?)`)
      .bind(slug, body.takeId, body.kind, now)
      .run();
    return c.json({ slug, url: `/s/${slug}` }, 201);
  }

  return c.json({ error: 'slug_collision' }, 500);
});

shareRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  const share = await c.env.DB.prepare(
    `SELECT slug, take_id, kind, created_at FROM shares WHERE slug = ?`)
    .bind(slug)
    .first<{ slug: string; take_id: string; kind: string; created_at: number }>();

  if (!share) {
    return c.json({ error: 'not_found' }, 404);
  }

  const take = await c.env.DB.prepare(
    `SELECT id, job_id, idx, audio_key, seed, landmarks_json, anchor_map_json, created_at
     FROM takes WHERE id = ?`)
    .bind(share.take_id)
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
    return c.json({ error: 'take_not_found' }, 404);
  }

  const job = await c.env.DB.prepare(
    `SELECT id, user_id, pgn, status, target_sec, stage_updated_at, error, created_at
     FROM jobs WHERE id = ?`)
    .bind(take.job_id)
    .first<{
      id: string;
      user_id: string | null;
      pgn: string;
      status: string;
      target_sec: number;
      stage_updated_at: number;
      error: string | null;
      created_at: number;
    }>();

  if (!job) {
    return c.json({ error: 'job_not_found' }, 404);
  }

  const playerHtml = renderPlayerPage({
    slug: share.slug,
    take: {
      id: take.id,
      idx: take.idx,
      audioKey: take.audio_key,
      seed: take.seed,
      landmarksJson: take.landmarks_json,
      anchorMapJson: take.anchor_map_json,
    },
    job: {
      id: job.id,
      pgn: job.pgn,
      targetSec: job.target_sec,
    },
  });

  return new Response(playerHtml, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
});

interface PlayerPageData {
  slug: string;
  take: {
    id: string;
    idx: number;
    audioKey: string;
    seed: number;
    landmarksJson: string;
    anchorMapJson: string;
  };
  job: {
    id: string;
    pgn: string;
    targetSec: number;
  };
}

function renderPlayerPage(data: PlayerPageData): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta property="og:title" content="CHESS &rarr; MUSIC" />
<meta property="og:description" content="A chess game turned into a soundtrack." />
<meta property="og:type" content="website" />
<title>CHESS &rarr; MUSIC</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0a0a0f; color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 480px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; font-weight: 600; letter-spacing: 0.02em; margin: 0 0 4px; }
  p.sub { color: #9ca3af; font-size: 13px; margin: 0 0 24px; }
  button.play { width: 100%; padding: 14px; border: none; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; font-size: 16px; font-weight: 600; cursor: pointer; }
  button.play:active { transform: scale(0.98); }
  .status { margin-top: 16px; font-size: 13px; color: #9ca3af; text-align: center; }
  footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
  footer a { color: #a855f7; text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>CHESS &rarr; MUSIC</h1>
  <p class="sub">Your game. Your soundtrack.</p>
  <button class="play" id="playBtn">Tap to play</button>
  <div class="status" id="status">Loading audio&hellip;</div>
  <footer>Generated by <a href="/">chess-to-music</a></footer>
</main>
<script>
var DATA = ${json};
var audio = new Audio('/takes/' + DATA.take.id);
audio.preload = 'auto';
var statusEl = document.getElementById('status');
var playBtn = document.getElementById('playBtn');
playBtn.addEventListener('click', function() {
  audio.play().then(function() {
    statusEl.textContent = 'Now playing';
    playBtn.textContent = 'Pause';
  }).catch(function(e) {
    statusEl.textContent = 'Playback failed: ' + e.message;
  });
});
audio.addEventListener('playing', function() { statusEl.textContent = 'Now playing'; });
audio.addEventListener('pause', function() { playBtn.textContent = 'Tap to play'; });
audio.addEventListener('ended', function() { playBtn.textContent = 'Play again'; statusEl.textContent = 'Finished'; });
audio.addEventListener('error', function() { statusEl.textContent = 'Failed to load audio'; });
</script>
</body>
</html>`;
}

export { shareRouter };
