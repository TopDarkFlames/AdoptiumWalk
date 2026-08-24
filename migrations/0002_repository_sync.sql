CREATE TABLE IF NOT EXISTS repository_syncs (
  guild_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  timezone TEXT NOT NULL,
  weekly_time TEXT NOT NULL DEFAULT '08:00',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_commit_sha TEXT,
  last_run_key TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  force_sync INTEGER NOT NULL DEFAULT 1,
  retry_after INTEGER,
  lease_until INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guild_projects(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repository_syncs_enabled
  ON repository_syncs (enabled, retry_after, lease_until);
