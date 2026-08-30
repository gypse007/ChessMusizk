# infra/README.md — CHESS → MUSIC : Mac + Cloudflare Runbook

Day-one setup for the private Mac worker (ACE-Step + mastering) and the Cloudflare control plane.
Copy-paste in order. Record every `[MEASURE]` value at the bottom.

> Machine: Apple Silicon Mac (M4, 24GB). Everything heavy runs here and stays on `localhost`.
> Cloudflare does frontend/API/DB/queue/storage/delivery. The Mac is NEVER exposed to the internet.

---

## 0. Prerequisites (install once)

```bash
# Homebrew (if not present)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Core tools
brew install ffmpeg rubberband git jq
brew install --cask cloudflared          # Cloudflare Tunnel daemon

# uv (Python package manager used by ACE-Step)
curl -LsSf https://astral.sh/uv/install.sh | sh
exec $SHELL -l                            # reload PATH

# Node (for wrangler / Cloudflare Worker + Pages)
brew install node
npm install -g wrangler

# Verify
ffmpeg -version | head -1
rubberband --help 2>&1 | head -1
uv --version
cloudflared --version
wrangler --version
```

---

## 1. Install ACE-Step 1.5 (the music model) — MLX path

```bash
cd ~/dev
git clone https://github.com/ACE-Step/ACE-Step-1.5.git
cd ACE-Step-1.5
uv sync                                   # installs deps into a local venv

# First launch downloads ~10GB of weights (turbo DiT + 1.7B LM) automatically.
# Start the REST API server (macOS / MLX). Binds to localhost:8001 ONLY.
./start_api_server_macos.sh
# ← leave this running in one terminal for M0. Open http://localhost:8001/docs to confirm.
```

**Model config for 24GB M4 (set via env or the server's config):**
- DiT: `acestep-v15-turbo` (0.6B, 8 steps, no CFG)
- Planner LM: `acestep-5Hz-lm-1.7B`  (fallback `acestep-5Hz-lm-0.6B` if memory is tight)

> Do NOT bind ACE-Step to `0.0.0.0`. It must stay on `127.0.0.1:8001`.

---

## 2. M0 — MEASURE before building anything

With the API server running, generate one 60s instrumental and time it.

```bash
# Simple smoke test via the REST API (adjust field names to the server's /docs schema):
time curl -s -X POST http://localhost:8001/release_task \
  -H "Content-Type: application/json" \
  -d '{
        "caption": "intimate cinematic instrumental, felt piano and cello, sparse, tense",
        "bpm": 72,
        "duration": 60,
        "instrumental": true,
        "batch_size": 2,
        "inference_steps": 8,
        "seed": -1,
        "audio_format": "wav"
      }' | tee /tmp/task.json

# Poll for completion, then fetch audio (see /docs for exact query_result + /v1/audio usage).
```

While it runs, watch memory in another terminal:
```bash
sudo powermetrics --samplers gpu_power -i1000 -n1   # GPU activity
top -o mem                                          # peak RSS of the python process
```

**Record these numbers in §9 before writing any UI.**

---

## 3. Cloudflare control plane (create resources)

```bash
wrangler login                              # opens browser once

# --- R2 bucket (audio + landmark json; $0 egress) ---
wrangler r2 bucket create chess2music-audio

# --- D1 database (jobs, takes, shares) ---
wrangler d1 create chess2music
# copy the returned database_id into apps/worker/wrangler.toml

# --- Queue (job pipeline) ---
wrangler queues create chess2music-jobs

# --- KV (config/cache ONLY — 1,000 writes/day cap) ---
wrangler kv namespace create CONFIG
```

**`apps/worker/wrangler.toml` bindings (fill the ids):**
```toml
name = "chess2music-api"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[[d1_databases]]
binding = "DB"
database_name = "chess2music"
database_id = "PASTE_D1_ID"

[[r2_buckets]]
binding = "AUDIO"
bucket_name = "chess2music-audio"

[[queues.producers]]
binding = "JOBS"
queue = "chess2music-jobs"

[[queues.consumers]]
queue = "chess2music-jobs"

[[kv_namespaces]]
binding = "CONFIG"
id = "PASTE_KV_ID"

[vars]
EXPORT_VIDEO = "false"      # video export DESIGNED but DISABLED

# secrets (set via CLI, not in file):
#   wrangler secret put TURNSTILE_SECRET
#   wrangler secret put WORKER_SHARED_TOKEN   # auth between Mac poller and Worker
```

**Apply D1 schema:**
```bash
wrangler d1 execute chess2music --file=apps/worker/migrations/0001_init.sql
```

**Deploy Worker + Pages (from the Mac — deploys are independent of the Mac staying online):**
```bash
cd apps/worker && wrangler deploy
cd ../web && npm run build && wrangler pages deploy ./out --project-name chess2music-web
```

**R2 S3 credentials for the Mac uploader** (`r2.py` uses the S3 API):
```bash
# Cloudflare dash → R2 → Manage R2 API Tokens → create token (Object Read & Write, this bucket)
# then on the Mac:
cat >> ~/.chess2music.env <<'EOF'
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx
R2_BUCKET=chess2music-audio
R2_ENDPOINT=https://xxxxxxxxxxxxxxxx.r2.cloudflarestorage.com
WORKER_BASE_URL=https://chess2music-api.<your-subdomain>.workers.dev
WORKER_SHARED_TOKEN=paste-the-same-token-you-set-as-secret
EOF
chmod 600 ~/.chess2music.env
```

---

## 4. Mac worker connectivity — PULL MODEL (preferred, zero inbound)

The Mac calls OUT to the Worker to claim jobs and pushes results to R2. No inbound ports, no exposure.

```bash
# worker-mac/poller.py loop (pseudocode of what it does):
#   1. GET  {WORKER_BASE_URL}/internal/claim   (Bearer WORKER_SHARED_TOKEN)  -> job or 204
#   2. POST status transitions: analyzing -> arc -> composing -> mastering
#   3. call ACE-Step localhost:8001, master (ffmpeg), analyze (librosa)
#   4. upload audio + landmarks.json to R2 (S3 API)
#   5. POST {WORKER_BASE_URL}/internal/complete  with take rows
```

Run it:
```bash
cd ~/dev/chess-to-music/worker-mac
uv run python poller.py            # or: python poller.py inside its venv
```

> Alternative (service-token tunnel) is documented in `infra/tunnel/`. Prefer pull for a solo setup.

---

## 5. Keep-alive: launchd + no-sleep (production)

Prevent sleep and auto-restart the three processes on crash/boot.

```bash
# Prevent idle sleep while on power
sudo pmset -c sleep 0 disksleep 0
# (optional belt-and-braces) run a caffeinate guard:
#   caffeinate -s   # keep awake while plugged in
```

**launchd plists** (put in `~/Library/LaunchAgents/`, then `launchctl load -w <plist>`):

`com.chess2music.acestep.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.chess2music.acestep</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd ~/dev/ACE-Step-1.5 && ./start_api_server_macos.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/c2m-acestep.log</string>
  <key>StandardErrorPath</key><string>/tmp/c2m-acestep.err</string>
</dict></plist>
```

`com.chess2music.poller.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.chess2music.poller</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd ~/dev/chess-to-music/worker-mac && source ~/.chess2music.env && uv run python poller.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/c2m-poller.log</string>
  <key>StandardErrorPath</key><string>/tmp/c2m-poller.err</string>
</dict></plist>
```

`com.chess2music.cloudflared.plist` (only if using the service-token tunnel for admin)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.chess2music.cloudflared</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/cloudflared</string>
    <string>tunnel</string><string>run</string><string>chess2music</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/c2m-cf.log</string>
  <key>StandardErrorPath</key><string>/tmp/c2m-cf.err</string>
</dict></plist>
```

Load them:
```bash
launchctl load -w ~/Library/LaunchAgents/com.chess2music.acestep.plist
launchctl load -w ~/Library/LaunchAgents/com.chess2music.poller.plist
# launchctl load -w ~/Library/LaunchAgents/com.chess2music.cloudflared.plist   # if used
```

**Health gating:** the Worker exposes `/health` which reflects last poller heartbeat. If the Mac is down,
the app shows "you're #N in queue" instead of an error, and jobs drain when the Mac wakes.

---

## 6. Mastering commands (reference — used by master.py)

```bash
# Pass 1 measure
ffmpeg -i take.wav -af loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json -f null -
# Pass 2 apply (linear), 48k
ffmpeg -i take.wav -af "loudnorm=I=-14:TP=-1.0:LRA=11:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true" -ar 48000 mastered.wav
# Exact-length lock with graceful fade (never hard-cut a decaying chord)
ffmpeg -i mastered.wav -af "afade=t=out:st=59.6:d=0.4" -t 60.0 final.wav
#   if short: rubberband -D 60.0 (pitch-preserving, <=3–5%) OR pad reverb tail + fade
# Watermark sting mixed at tail (see watermark.py)
# Verify exact length
ffprobe -v error -show_entries format=duration -of csv=p=0 final.wav   # assert 60.000 ± 1 frame
# Encode delivery copy (Opus streams small; keep a wav master)
ffmpeg -i final.wav -c:a libopus -b:a 128k final.opus
```

---

## 7. Video export (DISABLED — enable later)

Flag: `EXPORT_VIDEO=false` in `wrangler.toml`. Video is CPU-only (no GPU), so it can run on Cloudflare
Containers OR the Mac. When enabling:

**Option A — Cloudflare Containers (recommended when scaling):**
```bash
# scaffold a container app (requires Workers Paid $5/mo)
npm create cloudflare@latest -- --template=cloudflare/templates/containers-template
# Dockerfile installs ffmpeg + a headless canvas renderer (node-canvas/skia)
# Worker binding spins one container per export job; writes MP4 → R2 ($0 egress)
```
- CPU billed on active use only; scales to zero; ~1–3 vCPU-min per 60–75s render [ASSUMPTION — measure].
- Largest instance `standard-4` = 4 vCPU / 12 GiB — plenty for a vertical board render.

**Option B — Mac renderer (simplest first step):**
```bash
# worker-mac/export_video/ : draw board frames on the landmark timeline, then:
ffmpeg -framerate 30 -i frame_%05d.png -i final.opus \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart \
  -vf "scale=1080:1920" reel.mp4
# burn visual watermark (gold crown + wordmark + share URL) into frames or via overlay filter
```

Keep both behind one `VideoExporter` interface (mirror the `MusicGenerator` pattern). Default to Containers,
Mac as fallback. Do NOT enable at launch.

---

## 8. Daily ops cheatsheet

```bash
# tail worker logs
tail -f /tmp/c2m-acestep.err /tmp/c2m-poller.log
# restart a service
launchctl kickstart -k gui/$(id -u)/com.chess2music.poller
# check queue depth (D1)
wrangler d1 execute chess2music --command "SELECT status, COUNT(*) FROM jobs GROUP BY status;"
# confirm ACE-Step is localhost-only
lsof -iTCP -sTCP:LISTEN -n -P | grep 8001    # should show 127.0.0.1:8001, NOT *:8001
```

---

## 9. [MEASURE] — fill these in on day one

| Metric | Value | Notes |
|---|---|---|
| ACE-Step first-run weight download | ~10GB / ~15 min | one-time, turbo DiT + 1.7B LM |
| 60s instrumental gen (turbo + 1.7B LM, batch 1) | 54.1s wall-clock | PyTorch VAE, CPU, chunk=16 |
| Peak memory during generation | 14.17 GB | fits in 24GB unified memory |
| DiT init time | 10.5s | before first generation |
| Master (2-pass loudnorm + length lock) | ~2-3s | ffmpeg CPU |
| librosa landmark analysis | ~1-2s | per take |
| Full job (claim → 2 takes → mastered → uploaded) | ~130s | 2 × (54s gen + 3s master + 2s analysis) |
| Client Stockfish full-game sweep (mid phone) | ~30-60s | ~96 plies, depth ~18–22 |
| Sustained throughput | ~28 soundtracks/hour | = 3600 / 130s |

**Current status (2026-08-29, M4 24GB, macOS 26.2):**
- ACE-Step cloned, uv sync complete
- API server starts on localhost:8001
- 60s instrumental generation WORKS with fix: disable MLX-VAE, use PyTorch VAE with CPU + small chunks
- Fix: `ACESTEP_VAE_ON_CPU=1`, `ACESTEP_VAE_DECODE_CHUNK_SIZE=16`, monkey-patch MLX-VAE disabled
- Wrapper script: `worker-mac/start_api_server_macos_fixed.sh`
- launchd plist updated to use fixed wrapper

**Decision rule:** add the Modal `CloudACEGenerator` burst worker when median queue wait exceeds ~3–5 min.

---

## 10. ACE-Step VAE Fix (WORKING)

**Root cause:** MLX-VAE path crashes on macOS for latent tensors > 250 frames (~10s audio). The MLX-VAE `_mlx_vae_decode` function segfaults on larger tensors. PyTorch VAE works fine for all durations.

**Working config (60s proven):**
```bash
# Environment variables
export ACESTEP_VAE_ON_CPU=1
export ACESTEP_VAE_DECODE_CHUNK_SIZE=16
```

```python
# Monkey-patch to disable MLX-VAE (in sitecustomize.py or before import)
import acestep.core.generation.handler.mlx_vae_decode_native as mlx_mod
mlx_mod.MlxVaeDecodeNativeMixin._mlx_vae_decode = \
    lambda self, latents: (_ for _ in ()).throw(RuntimeError('MLX VAE disabled'))
```

**Verified results on M4 24GB, macOS 26.2:**
- 10s: ✅ ~10s wall-clock
- 15s: ✅ ~16s wall-clock
- 16s: ✅ ~18s wall-clock
- 30s: ✅ ~29s wall-clock
- 60s: ✅ ~54s wall-clock, 14.17GB peak RSS

**Wrapper script:** `worker-mac/start_api_server_macos_fixed.sh` applies the fix automatically.

**To file with ACE-Step:** Include the 15s/16s/30s/60s boundary, the MLX-VAE crash pattern, and the working PyTorch fallback config.
