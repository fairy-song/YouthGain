-- Additive migration; the daily unique key is present in both new and old stores.
-- podcast_store additionally adds a nullable recommendation_id column to legacy
-- daily_picks and creates its UNIQUE index, inside a serialized migration.
CREATE TABLE IF NOT EXISTS daily_picks (
    user_id TEXT NOT NULL,
    local_date TEXT NOT NULL,
    program_id TEXT,
    payload TEXT NOT NULL,
    recommendation_id TEXT,
    PRIMARY KEY(user_id, local_date)
);

CREATE TABLE IF NOT EXISTS finance_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    as_of TEXT NOT NULL,
    feature_version TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS finance_snapshots_user_time
    ON finance_snapshots(user_id, as_of);

CREATE TABLE IF NOT EXISTS recommendation_events (
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    recommendation_id TEXT NOT NULL,
    local_date TEXT NOT NULL,
    program_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN
        ('served','impression','click','follow','dislike','helpful_yes','helpful_no')),
    occurred_at TEXT NOT NULL,
    snapshot_id TEXT,
    model_version TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS recommendation_events_user_time
    ON recommendation_events(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS recommendation_events_recommendation
    ON recommendation_events(user_id, recommendation_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS recommendation_events_single_exposure
    ON recommendation_events(user_id, recommendation_id, event_type)
    WHERE event_type IN ('served','impression');
CREATE TRIGGER IF NOT EXISTS recommendation_events_no_update
    BEFORE UPDATE ON recommendation_events BEGIN
        SELECT RAISE(ABORT, 'recommendation_events is append-only');
    END;
CREATE TRIGGER IF NOT EXISTS recommendation_events_no_delete
    BEFORE DELETE ON recommendation_events BEGIN
        SELECT RAISE(ABORT, 'recommendation_events is append-only');
    END;
CREATE TRIGGER IF NOT EXISTS finance_snapshots_no_update
    BEFORE UPDATE ON finance_snapshots BEGIN
        SELECT RAISE(ABORT, 'finance_snapshots is immutable');
    END;
