-- Authoritative goal state and append-only versions share PODCAST_DB_PATH.
CREATE TABLE IF NOT EXISTS finance_goal_migrations (
    user_id TEXT PRIMARY KEY, observed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS finance_goals (
    user_id TEXT NOT NULL, goal_id TEXT NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(user_id, goal_id)
);
CREATE TABLE IF NOT EXISTS finance_goal_versions (
    revision INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
    goal_id TEXT NOT NULL, recorded_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS finance_goal_versions_asof
    ON finance_goal_versions(user_id, recorded_at, goal_id);
CREATE TABLE IF NOT EXISTS savings_transfers (
    user_id TEXT NOT NULL, event_id TEXT NOT NULL, goal_id TEXT NOT NULL,
    local_date TEXT NOT NULL, occurred_at TEXT NOT NULL,
    locked_delta_cents INTEGER NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS savings_transfers_asof ON savings_transfers(user_id, occurred_at);
CREATE TABLE IF NOT EXISTS monthly_carryovers (
    revision INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
    event_id TEXT NOT NULL, month TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    recorded_at TEXT NOT NULL, UNIQUE(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS monthly_carryovers_asof ON monthly_carryovers(user_id, month, recorded_at);
CREATE TRIGGER IF NOT EXISTS savings_transfers_no_update BEFORE UPDATE ON savings_transfers
    BEGIN SELECT RAISE(ABORT, 'savings_transfers is append-only'); END;
CREATE TRIGGER IF NOT EXISTS savings_transfers_no_delete BEFORE DELETE ON savings_transfers
    BEGIN SELECT RAISE(ABORT, 'savings_transfers is append-only'); END;
CREATE TRIGGER IF NOT EXISTS finance_goal_versions_no_update BEFORE UPDATE ON finance_goal_versions
    BEGIN SELECT RAISE(ABORT, 'goal versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS finance_goal_versions_no_delete BEFORE DELETE ON finance_goal_versions
    BEGIN SELECT RAISE(ABORT, 'goal versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS monthly_carryovers_no_update BEFORE UPDATE ON monthly_carryovers
    BEGIN SELECT RAISE(ABORT, 'carryovers are append-only'); END;
CREATE TRIGGER IF NOT EXISTS monthly_carryovers_no_delete BEFORE DELETE ON monthly_carryovers
    BEGIN SELECT RAISE(ABORT, 'carryovers are append-only'); END;
