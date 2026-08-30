# FINAL BUILD PROMPT — "CHESS → MUSIC"
### PGN → cinematic 60–75s instrumental soundtrack, synced to an interactive chess replay. Audio-only core, Mac heavy-lift, full Cloudflare control plane. Built on a Mac (Apple Silicon M4, 24GB).

> Paste this ENTIRE file as the first message to a capable coding LLM. It is self-contained: product spec,
> verified technical facts, architecture, data contracts, exact parameters, milestones, acceptance criteria.
> Follow it literally. `[VERIFIED]` = confirmed against primary docs (Aug 2026) — do NOT overwrite from
> stale memory. `[MEASURE]` = you must empirically measure on THIS Mac and record the number.
> `[ASSUMPTION]` = engineering estimate, state it as such.

---

## 0. ROLE & NON-NEGOTIABLE RULES

You are a senior ML-infrastructure engineer + product designer + AI-music engineer. Build a mobile-first web
product that turns a chess PGN into a unique 60–75 second cinematic **instrumental** soundtrack, then plays
it back **synchronized with an interactive chess replay**. Audio is the product.

**Hard rules — never violate:**
1. **Audio-only core.** Output = an audio track + an in-app synced, interactive chess replay. No video in the core path.
2. **Video export is DESIGNED BUT DISABLED.** Build the full plan and the code seams (feature-flagged `EXPORT_VIDEO=false`), but ship it OFF. It is the future viral loop, not launch scope. See §11.
3. **Generation is explicit.** NEVER auto-generate on upload. A distinct "Create Soundtrack" action only.
4. **The Mac does ALL heavy lifting** — music generation (GPU/MLX) + librosa analysis + FFmpeg mastering.
   Cloudflare does EVERYTHING else (frontend, API, DB, queue, storage, delivery, auth, abuse control, tunnel).
5. **Never expose the Mac to the internet.** ACE-Step binds to `localhost` only. Reach it via a pull-based
   worker (preferred) or a Cloudflare Tunnel + service token. No inbound ports, ever.
6. **Music leads, replay follows.** Do not rely on the model hitting exact timestamps. Generate to an arc,
   analyze the finished audio with librosa, then time-warp the chess replay onto real musical landmarks.
7. **Every shared artifact carries a watermark** (audio sting + visual mark) so the product spreads with
   attribution — this is the content-generation / viral loop. See §12.
8. Distinguish facts from assumptions. Prefer the cheapest technically-credible path. Commit runnable code at
   each milestone (§10). Begin at M0 and MEASURE before building UI.

---

## 1. PRODUCT SPEC

**Pipeline:** `PGN → Stockfish (client WASM) → Chess Event Graph → Musical DNA → ACE-Step (Mac) → master to exact length → librosa landmark map → time-warped synced replay + interactive waveform`

**Golden test game:** 48 moves, Dutch Defense, aggressive kingside pawn attack, queen exchange, rook/knight
endgame, passed c-pawn, promotion `46...e1=Q`, immediately captured `47.Rxe1`, final reversal `48...Nxe1`.
The soundtrack must narrate: calculation → aggression → tactical instability → cold endgame → pawn race →
apparent victory → sudden reversal.

**Screens (mobile-only, dark theme, premium, minimal — no dashboards/timeline clutter):**
1. Upload/paste PGN + "Try a sample game".
2. Chessboard + concise Stockfish read-out (eval, per-move classification).
3. Explicit **"Create Soundtrack"** button.
4. Async generation with real staged progress: **Analyzing game → Finding musical arc → Composing → Mastering** (from job state, never a fake spinner).
5. Result appears as a NEW **Take** (Take 1 / Take 2 from a batch of 2). Swipe horizontally between takes; a new take never replaces the current.
6. **Interactive waveform** synced bidirectionally with the replay: drag = scrub, tap = jump, swipe = seek; board playhead ↔ audio playhead stay in sync both ways; key chess moments render as markers.
7. Share: (a) interactive web-player link, (b) silent GIF teaser. [Video export path exists but disabled.]

**Length rule:** ≤100 plies → **60.000s**; >100 plies → **75.000s**. Normalize to the exact target.

**Visual identity:** dark mobile theme; gold crown logo; header "CHESS → MUSIC / Your game. Your soundtrack.";
purple/violet + gold accents; classification colors violet=brilliant, gold=mistake, red=blunder, green=good.
NOW PLAYING card shows move detail, classification, eval change, impact, and "Why this matters."

---

## 2. VERIFIED TECHNICAL FACTS (do not rewrite)

### ACE-Step 1.5 — music model, runs on the Mac
- `[VERIFIED]` Repo `github.com/ACE-Step/ACE-Step-1.5`. Install with `uv`: `git clone … && cd ACE-Step-1.5 && uv sync`. Native **MLX** path for Apple Silicon M1–M4. Use macOS launch scripts: `start_api_server_macos.sh` (REST), `start_gradio_ui_macos.sh` (UI).
- `[VERIFIED]` REST = FastAPI, **port 8001**, async: `POST /release_task` → `POST /query_result` → `GET /v1/audio`. Optional API-key auth via `Authorization` header or `ai_token` in body.
- `[VERIFIED]` M4 24GB config: DiT `acestep-v15-turbo` (0.6B, ~4.7GB, 8 steps, no CFG) + planner LM `acestep-5Hz-lm-1.7B` (~3.4GB). Fallback LM `acestep-5Hz-lm-0.6B`. `acestep-v15-xl-turbo` (4B) = quality A/B only.
- `[VERIFIED]` Params: `GenerationParams(caption, bpm, duration)`, `GenerationConfig(batch_size, audio_format)`. Advanced: `inference_steps=8`, `seed=-1`, `guidance_scale`, `shift`. `instrumental=True` via `create_sample(..., instrumental=True)`. `batch_size=2` → Take 1 + Take 2 in one job.
- `[VERIFIED]` License: code **MIT**; model card explicitly grants **commercial use of generated music**. Archive license + model card at launch.
- `[VERIFIED]` Reference speed: <2s/song A100, <10s RTX 3090, <4GB VRAM DiT-only. `[MEASURE]` real M4 24GB wall-clock + peak memory for a 60s instrumental (turbo + 1.7B LM, batch 2). Expect ~30–90s `[ASSUMPTION]`. This drives queue math.

### Stockfish — runs CLIENT-SIDE (browser WASM)
- `[VERIFIED]` Use **lite** build (~7MB): `nmrugg/stockfish.js` (SF18) or `@lichess-org/stockfish-web` (SF17.1). Prefer lite multi-threaded if COOP/COEP headers are served; else lite single-threaded.
- `[VERIFIED]` Multithread needs headers `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (+ `require-corp` on the wasm) and `SharedArrayBuffer`. Feature-detect via `wasmThreadsSupported()`.
- `[VERIFIED]` Same engine, not weakened. **Classification stable at depth ~18–22** ("a blunder at 18 is still a blunder at 30"). Do NOT chase depth 30. Mobile ≈ ~1 MN/s.
- `[VERIFIED]` GPL-3.0: load the wasm **at runtime, never bundle into app code** — keeps your app license clean.
- `[ASSUMPTION]` Full-game sweep (~96 plies, ~200–400ms/move to stable depth): ~10–15s desktop, ~15–30s mid phone, up to ~60s old phone. Runs on the user's device, $0, overlaps the "Analyzing game" stage — start it on PGN paste, not on button tap.

### Cloudflare limits — control plane (everything except the Mac)
- `[VERIFIED]` **Pages**: unlimited bandwidth + requests, 500 builds/mo (free).
- `[VERIFIED]` **Workers**: free 100k req/day, 10ms CPU/req, 128MB. Paid $5/mo → 10M req + 30M CPU-ms, CPU to 30s. ($5 is an account-wide minimum also covering Pages Functions, KV, D1, Durable Objects allowances.)
- `[VERIFIED]` **R2**: 10GB storage, 1M Class-A, 10M Class-B ops free; **egress $0 forever**. Store + stream audio here.
- `[VERIFIED]` **D1** (SQLite): free 5GB, 5M rows read/day, 100k rows written/day. Jobs + users + takes. (Status writes go here, NOT KV.)
- `[VERIFIED]` **Queues**: free 10k ops/day (send+read+delete each count), 24h retention on free.
- `[VERIFIED]` **KV**: 100k reads/day but only **1,000 writes/day** — config/hot-cache ONLY.
- `[VERIFIED]` **Zero Trust / Tunnel**: free ≤50 users, 50 service tokens; outbound-only, origin IP hidden.
- `[VERIFIED]` **Turnstile**: free, unlimited challenges — gate the "Create Soundtrack" action.
- `[VERIFIED]` **No GPU on Cloudflare Containers** (max `standard-4` = 4 vCPU/12GiB, CPU-only) and **no music model in Workers AI**. Music generation CANNOT run on Cloudflare — it stays on the Mac.

### Premium fallback (optional, behind interface)
- `[VERIFIED]` Lyria 3 Pro ≈ $0.08/gen; Lyria 3 Clip ≈ $0.04 but locked to 30s. Watermarked (SynthID), single candidate/call. Not required for launch.

---

## 3. ARCHITECTURE (audio-only, Mac heavy-lift + full Cloudflare)

```
 Phone (mobile web, dark theme)  — Next.js on Cloudflare Pages
   │  Stockfish WASM runs HERE (client), lazy-loaded on PGN paste
   ▼
 Cloudflare Workers ──► D1 (jobs, users, takes)          [durable state]
   │ auth, dispatch       Queues (job pipeline)           [10k ops/day free]
   │ Turnstile gate       R2 (audio + landmark json, $0 egress) [store + stream]
   │ Realtime/SSE status  KV (config/cache only)
   ▼  (pull model preferred; or Cloudflare Tunnel + service token, outbound-only)
 Mac (PRIVATE worker #1 — the ONLY heavy lifter)
   ├─ poller.py            claims queued jobs, reports status
   ├─ ACE-Step FastAPI @ localhost:8001 (MLX, turbo 0.6B + 1.7B LM, batch=2, instrumental)
   ├─ analyze.py (librosa) onset/beat/RMS → landmark map + anchor→time map
   ├─ master.py (ffmpeg)   two-pass loudnorm + exact-length lock (60.000/75.000s) + watermark sting
   └─ r2.py                upload mastered audio + landmark JSON → R2
```

**Flow:** Phone → Pages → Worker enqueues job (D1/Queue) → Mac poller claims → ACE-Step 2 takes → master each
to exact length (+ watermark sting) → librosa landmark map → upload to R2 → Worker flips status → phone streams
audio from R2 and drives the time-warped synced replay from the landmark JSON.

**Why hybrid:** Cloudflare has no GPU + no music model → generation must stay on the Mac. Everything else is
cheaper/simpler on Cloudflare, and R2 egress is $0 (protects you if a soundtrack goes viral).

---

## 4. MONOREPO STRUCTURE (create exactly)

```
chess-to-music/
├─ apps/
│  ├─ web/                      # Next.js (static export) → Cloudflare Pages
│  │  ├─ public/engine/         # stockfish lite wasm (fetched at runtime, NOT imported)
│  │  ├─ src/
│  │  │  ├─ features/pgn/       # paste/upload + sample game
│  │  │  ├─ features/board/     # chessboard + Stockfish read-out
│  │  │  ├─ features/analysis/  # Stockfish Web Worker wrapper → Event Graph
│  │  │  ├─ features/generate/  # explicit "Create Soundtrack" + staged progress
│  │  │  ├─ features/player/    # takes carousel + interactive waveform + synced replay
│  │  │  ├─ features/share/     # web-player link + silent GIF teaser  (video export flag OFF)
│  │  │  └─ lib/                # api client, realtime, types
│  │  └─ _headers               # COOP/COEP for multithreaded wasm
│  └─ worker/                   # Cloudflare Worker (API + queue glue)
│     ├─ src/routes/            # /jobs, /jobs/:id, /takes, /share, /health
│     ├─ src/queue/             # enqueue + status transitions
│     ├─ wrangler.toml          # bindings: D1, Queues, R2, KV, Turnstile secret
│     └─ migrations/            # D1 schema
├─ worker-mac/                  # runs on the Mac (Python)
│  ├─ poller.py                 # pull-model job claim + status
│  ├─ generate.py               # ACE-Step client (localhost:8001, batch=2, instrumental)
│  ├─ grammar.py                # Event Graph → caption + bpm + anchors
│  ├─ analyze.py                # librosa landmark map + anchor→time map
│  ├─ master.py                 # ffmpeg two-pass loudnorm + exact-length + watermark sting
│  ├─ watermark.py              # audio sting mix + (future) visual mark params
│  ├─ providers/                # MusicGenerator: Local / Cloud(ACE) / Lyria
│  ├─ r2.py                     # upload audio + landmark json (S3 API)
│  ├─ export_video/             # FEATURE-FLAGGED, DISABLED — see §11 (plan only)
│  └─ launchd/                  # plists: acestep, cloudflared, poller (keep-alive)
├─ packages/shared/             # TS+py shared types (see §5)
└─ infra/
   ├─ tunnel/                   # cloudflared config + service-token notes
   └─ README.md                 # runbook (Mac + Cloudflare) + all [MEASURE] values
```

---

## 5. DATA CONTRACTS (packages/shared, mirror in py)

```ts
type MoveClass = 'brilliant'|'good'|'mistake'|'blunder'|'book'|'forced';

interface MoveNode {
  ply:number; san:string; fen:string;
  evalBefore:number; evalAfter:number; evalSwing:number;   // centipawns
  classification:MoveClass; phase:'opening'|'middlegame'|'endgame';
  flags:{ check?:boolean; capture?:boolean; promotion?:boolean;
          queenExchange?:boolean; passedPawnAdvance?:boolean; };
}
interface Anchor { ply:number;
  kind:'pawn_storm_start'|'queen_exchange'|'promotion'|'false_climax'|'check'|'checkmate'|'reversal';
  intent:'energy_peak'|'texture_drop'|'accent'|'final_cadence'|'interrupt'; }
interface EventGraph { moves:MoveNode[]; anchors:Anchor[]; totalPlies:number; targetDurationSec:60|75; }

interface SoundtrackSpec { caption:string; bpm:number; durationSec:60|75; seed:number;
  instrumental:true; batchSize:2; negativePrompt:string; anchors:Anchor[]; }

interface Landmark { tSec:number; type:'beat'|'onset'|'energy_peak'|'texture_drop'; }
interface Take { id:string; audioUrl:string; seed:number;
  landmarks:Landmark[]; anchorMap:{ ply:number; tSec:number }[]; watermarked:true; }

type JobStatus='queued'|'analyzing'|'arc'|'composing'|'mastering'|'done'|'failed';
```

---

## 6. CHESS → MUSIC GRAMMAR (deterministic; grammar.py)

Emit an ACE-Step caption + bpm + anchor list from the EventGraph. Intimate/cinematic; explicitly
negative-prompt slop. Global negative prompt for EVERY job:
`no vocals, no lyrics, no EDM, no generic trailer braams, no supersaw, no four-on-the-floor`.

| Chess event | Musical translation | Hook |
|---|---|---|
| opening / quiet calc | felt piano + cello, sparse, rubato | bpm 60–76, minor/dorian, low density |
| pawn storm | pizzicato strings, rhythmic acceleration | rising staccato cue |
| tactical volatility | spiccato strings, controlled dissonance | "tension, dissonant intervals" |
| sacrifice | texture/instrument reduction | drop a layer |
| queen exchange | sudden texture reduction | **texture_drop anchor** |
| rook invasion | low cello/bass entrance | "low register cello + double bass" |
| passed pawn | recurring motif (leitmotif) | reuse a short phrase across sections |
| pawn advances | motif rises/accelerates | restate motif higher each advance |
| promotion | climax | **energy_peak anchor** |
| promotion immediately captured | false climax, abrupt interrupt | energy_peak + code SFX overlay stinger |
| check | rhythmic accent | map to nearest strong onset |
| checkmate | final cadence, resolve to tonic | clean ending |
| draw/uncertain end | unresolved harmony | avoid tonic resolution |

Optional deterministic SFX overlay (frame-accurate) for blunder/false-climax: a short dissonant stinger /
filter-drop mixed onto the bed at the exact anchor timestamp — emotional precision the model can't guarantee.

---

## 7. SYNC & MASTERING (analyze.py + master.py — correctness core)

**Sync (music leads, replay follows):**
1. Generate to the arc (caption + `duration`, batch 2). Do NOT trust prompt timestamps for precision.
2. `[VERIFIED]` librosa on the finished audio: `onset.onset_detect` (accents/checks), `beat.beat_track`
   (grid+tempo), RMS envelope (peak = climax, drop = queen-exchange candidate).
3. Map anchors → landmarks: promotion → energy peak; queen exchange → texture drop; checks → strong onsets;
   distribute remaining moves proportionally across the beat grid. Emit `anchorMap {ply→tSec}`.
4. Replay runs on a **variable clock** so each anchor move fires on its assigned musical time; interpolate
   between anchors. Audio never edited after mastering — only the visual timeline bends. Perfect sync every time.
5. Landmark timestamps become the interactive waveform markers; scrubbing maps board↔playhead both ways.

**Mastering to EXACT length (never guillotine the ending):**
```bash
# Pass 1 measure
ffmpeg -i take.wav -af loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json -f null -
# Pass 2 apply (linear), 48k
ffmpeg -i take.wav -af "loudnorm=I=-14:TP=-1.0:LRA=11:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true" -ar 48000 mastered.wav
# Exact-length lock with graceful fade (never hard-cut a decaying chord):
ffmpeg -i mastered.wav -af "afade=t=out:st=59.6:d=0.4" -t 60.0 final.wav
#   if short: rubberband -D 60.0 (pitch-preserving, <=3–5% only) OR pad reverb tail + fade
# Verify:
ffprobe -v error -show_entries format=duration -of csv=p=0 final.wav   # assert 60.000 ± 1 frame
```
Target `-14 LUFS`. The "Mastering" stage IS this step. Watermark sting mixed here (see §12).

---

## 8. CLOUDFLARE SETUP (control plane)

**D1 schema:**
```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, user_id TEXT, pgn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', target_sec INTEGER NOT NULL,
  stage_updated_at INTEGER, error TEXT, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE takes (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, idx INTEGER NOT NULL,
  audio_key TEXT NOT NULL, seed INTEGER,
  landmarks_json TEXT, anchor_map_json TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE shares (
  slug TEXT PRIMARY KEY, take_id TEXT NOT NULL, kind TEXT NOT NULL, -- 'web'|'gif'
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_jobs_status ON jobs(status);
```
- Claim (single/few workers): `SELECT … WHERE status='queued' ORDER BY created_at LIMIT 1`, then guarded
  `UPDATE … SET status='analyzing' WHERE id=? AND status='queued'`.
- Status writes → **D1** (100k/day), never KV. Push live updates via Realtime/SSE (avoid phone polling that
  burns the 100k Worker req/day).
- **R2**: `takes/{id}.opus` (or mp3) + `takes/{id}.landmarks.json`. Stream via a Worker route or public bucket; egress $0.
- **Turnstile**: verify token in the Worker before enqueue.
- **Worker endpoints:** `POST /jobs` (verify Turnstile → insert → enqueue), `GET /jobs/:id` (status),
  `GET /takes/:id` (stream audio), `POST /share` (mint slug), `GET /health`.
- **Pages `_headers`:**
  ```
  /*
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Embedder-Policy: require-corp
  ```

**Mac connectivity (prefer pull):**
- **Pull (preferred):** `poller.py` calls OUT to a Worker endpoint to claim a job, POSTs status, uploads results
  to R2. Mac accepts ZERO inbound. Tunnel only for admin.
- **Service-token:** `cloudflared` tunnel + Cloudflare Access service token; Worker calls the Mac over the
  authenticated tunnel; ACE-Step stays on localhost:8001.
- **launchd** keep-alive plists for `acestep-api`, `cloudflared`, `poller`; `caffeinate`/`pmset` to prevent
  sleep; Worker `/health` gates dispatch; if Mac unhealthy show "you're #N in queue" (never an error).

---

## 9. PROVIDER ABSTRACTION (providers/)

```python
class MusicGenerator(Protocol):
    def submit(self, spec: SoundtrackSpec) -> JobHandle: ...
    def poll(self, handle: JobHandle) -> GenResult | None: ...

class LocalACEGenerator:   # Mac FastAPI localhost:8001 (DEFAULT for launch)
class CloudACEGenerator:   # Modal ($30/mo free, scale-to-zero) or RunPod L4/A40 serverless — burst only
class LyriaGenerator:      # Lyria 3 Pro (~$0.08) premium fallback, watermarked
```
Policy picks impl by cost/queue-depth/premium flag. Adding a cloud worker = config change, not app change.
Launch on `LocalACEGenerator` only.

---

## 10. BUILD MILESTONES (each runnable + tested)

- **M0 — MEASURE (do this first):** Install ACE-Step on the Mac (MLX macOS scripts). Generate one 60s
  instrumental (turbo + 1.7B LM, `batch_size=2`, `instrumental=True`). Record wall-clock + peak memory in
  `infra/README.md`. Print the numbers before writing any UI.
- **M1 — Mac pipeline (no UI):** `grammar.py` → `generate.py` (2 takes) → `master.py` (exact 60/75s +
  watermark sting) → `analyze.py` (landmark map). Golden test = the Dutch Defense game. Local files only.
- **M2 — Cloudflare control plane:** Worker + D1 migrations + Queue + R2 + Turnstile. `POST /jobs` → row →
  `poller.py` claims (pull) → uploads take + landmarks → status flips `done`.
- **M3 — Client analysis:** Stockfish lite wasm in a Web Worker, lazy-load on PGN paste, fixed-depth per-move
  sweep → EventGraph JSON sent with the job. `_headers` COOP/COEP + feature-detect fallback to single-thread.
- **M4 — Mobile UI:** paste/upload + sample; board + Stockfish read-out; explicit "Create Soundtrack"; staged
  progress from real status via Realtime/SSE; takes carousel (swipe); interactive waveform with anchor markers;
  bidirectional scrub between waveform and time-warped replay.
- **M5 — Share + harden + ship:** web-player share link (+ silent GIF teaser, §12); rate limiting; launchd
  keep-alive + `/health` gating; R2 streaming; watermark sting live on every take. Pre-wire `CloudACEGenerator`
  (Modal) as failover. Invite ~100 users. **Video export stays disabled.**
- **M6 (planned, OFF) — Video export + visual watermark:** implement §11 behind `EXPORT_VIDEO=false`. Do not
  enable at launch. This is the future viral loop.

---

## 11. VIDEO EXPORT — DESIGNED, DISABLED (the planned viral loop)

**Status:** feature-flagged `EXPORT_VIDEO=false`. Build the seams and document the path; do NOT ship it on.

**Why it's separate:** a GIF cannot carry audio; the moment moving pieces + soundtrack live in one file, it's an
**MP4**. Social platforms (Reels/TikTok/Shorts) require an MP4 upload with sound. So video is an on-demand render,
not a core path.

**Planned render (when enabled):** render on the **Mac** — draw the board animation frames on the same
time-warped landmark timeline, mux with the already-mastered audio via FFmpeg into a vertical MP4. Reuse
`worker-mac/export_video/`. No new infra; still audio-first, just captured to pixels on demand for one user.

**Three-tier share model (build tiers 1–2 now, tier 3 disabled):**
1. **Interactive web player** (LIVE) — audio + live-rendered moving pieces, fully interactive, $0-egress. Default share link.
2. **Silent GIF teaser** (LIVE) — short looping board animation of the decisive moves as the link
   preview/thumbnail. No audio by nature → it's bait: "🔊 tap to hear your game's soundtrack." Generated
   client-side (canvas → gif) or on the Mac.
3. **MP4 with audio** (DISABLED, planned) — moving pieces + soundtrack + visual watermark, rendered on demand
   on the Mac. The only postable-with-sound artifact. Enable later for the viral loop.

**Autoplay reality:** browsers/social feeds block autoplay-with-sound until a tap. So EVERY shared surface opens
on a "tap to play" poster (ideally the silent GIF/first frame with a 🔊 hint), then audio + pieces roll together.

---

## 12. WATERMARK & VIRAL LOOP (build now, applies to all shares)

Every shared artifact must carry attribution so the product spreads:
- **Audio watermark:** a short, tasteful branded sting (≤1.5s) appended/mixed at the tail during mastering
  (`watermark.py` + `master.py`). Present on every take by default; a paid tier may later remove it.
- **Visual watermark (for GIF now, MP4 later):** the gold crown logo + "chess-to-music" wordmark in a corner,
  plus the game's share URL. For the silent GIF teaser it doubles as the "tap to play" call-to-action.
- **Share slug:** `POST /share` mints a short slug → `shares` table → clean URL like `chess2music.app/s/{slug}`
  that opens the interactive player. Open-graph tags use the silent GIF as preview so links look alive in chats.
- **Loop intent:** silent GIF/first-frame teaser (attention) → tap → interactive audio player (payoff) →
  branded sting + watermark + share URL (attribution) → viewer generates their own game. Design the share screen
  to make "Create your own" a one-tap next step.

---

## 13. ACCEPTANCE CRITERIA (definition of done)

1. Given the Dutch-Defense PGN, the app produces **exactly 60.000s** audio (±1 frame), instrumental, with a
   clear arc: calculation → aggression → instability → cold endgame → pawn race → apparent victory → reversal.
2. Generation is explicit; two swipeable takes appear; a new take never replaces the current.
3. Chess replay and audio stay **synchronized both ways**; anchor moves (queen exchange, promotion, the
   `47.Rxe1` false climax, `48...Nxe1` reversal) land on real musical landmarks; waveform shows those markers.
4. Progress reflects real job state (Analyzing → Arc → Composing → Mastering), not a fake spinner.
5. Stockfish runs client-side (wasm loaded at runtime, not bundled); analysis overlaps "Analyzing".
6. Mac is never reachable from the internet; ACE-Step stays on localhost; audio streams from R2 ($0 egress).
7. Every take carries the audio watermark sting; shared links open the interactive player with a silent GIF
   preview + "tap to play"; **video export is present in code but disabled** (`EXPORT_VIDEO=false`).
8. Control plane runs on Cloudflare within free tiers at ~100 users (Workers Paid $5/mo only if 100k req/day is
   hit); generation cost ≈ Mac electricity.
9. All `[MEASURE]` values (M4 gen time, memory, per-game Stockfish time) recorded in `infra/README.md`.

---

## 14. RISKS TO HANDLE IN CODE
- Mac = single point of failure for GENERATION (not the app). launchd auto-restart + `caffeinate` + `/health`
  gating + Modal failover pre-wired. App/site stays up if Mac sleeps (jobs queue, drain on wake).
- ACE-Step is seed-sensitive ("gacha"): batch 2 + explicit regenerate + reject flat-arc takes (RMS check).
- Never run FFmpeg/Stockfish/generation in a Worker (10ms CPU cap) — Mac/client only.
- KV write cap 1,000/day — status/state to D1, not KV.
- Stockfish GPL: load wasm at runtime; keep app-code license clean.
- Rate-limit generations per user (Turnstile + per-user cap) so one game can't spam regenerations.
- Video export kept OFF by flag to avoid storage/compute creep before product-market fit.

---

**START AT M0. Print the measured M4 generation time + peak memory before writing any UI. Then proceed
milestone by milestone, committing runnable code at each step. Keep video export designed but disabled. State
assumptions explicitly; verify any API surface against current primary docs before coding against it. LFG.**
