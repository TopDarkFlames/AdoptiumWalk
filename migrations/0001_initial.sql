CREATE TABLE IF NOT EXISTS guild_projects (
  guild_id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  readme_content TEXT NOT NULL,
  goals_json TEXT NOT NULL,
  goal_history_json TEXT NOT NULL,
  next_goal_number INTEGER NOT NULL,
  reminder_json TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ai_cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_reminders
  ON guild_projects (updated_at)
  WHERE reminder_json IS NOT NULL;
