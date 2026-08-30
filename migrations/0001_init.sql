CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  pgn TEXT NOT NULL,
  event_graph_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  target_sec INTEGER NOT NULL,
  stage_updated_at INTEGER,
  error TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE takes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  audio_key TEXT NOT NULL,
  seed INTEGER,
  landmarks_json TEXT,
  anchor_map_json TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE shares (
  slug TEXT PRIMARY KEY,
  take_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_jobs_status ON jobs(status);
