-- Additive catalogue migration. Legacy programs remain stable episode IDs for picks/events.
CREATE TABLE IF NOT EXISTS podcast_sources (
    id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS podcast_shows (
    id TEXT PRIMARY KEY, canonical_url TEXT NOT NULL UNIQUE, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS podcast_episode_keys (
    source_id TEXT NOT NULL, external_key TEXT NOT NULL,
    program_id TEXT NOT NULL, content_hash TEXT NOT NULL,
    PRIMARY KEY(source_id, external_key)
);
CREATE INDEX IF NOT EXISTS podcast_episode_program ON podcast_episode_keys(program_id);
CREATE TABLE IF NOT EXISTS podcast_processing (
    program_id TEXT NOT NULL, content_hash TEXT NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(program_id, content_hash)
);
CREATE TABLE IF NOT EXISTS podcast_jobs (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL,
    dedupe_key TEXT NOT NULL, state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL,
    locked_at TEXT, lease_token TEXT, error TEXT, created_at TEXT NOT NULL,
    finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS podcast_jobs_active
    ON podcast_jobs(dedupe_key) WHERE state IN ('queued','running');
CREATE INDEX IF NOT EXISTS podcast_jobs_due ON podcast_jobs(state, available_at);
CREATE TABLE IF NOT EXISTS podcast_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entity_id TEXT NOT NULL,
    action TEXT NOT NULL, occurred_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS podcast_discoveries (
    id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, payload TEXT NOT NULL
);
