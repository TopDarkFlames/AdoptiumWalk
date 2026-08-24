import type { GuildProject, RepositorySyncConfig } from "../types.js";

interface ProjectRow {
  guild_id: string;
  project_name: string;
  readme_content: string;
  goals_json: string;
  goal_history_json: string;
  next_goal_number: number;
  reminder_json: string | null;
  imported_at: string;
  updated_at: string;
  revision: number;
}

interface VersionedProject {
  project: GuildProject;
  revision: number;
}

interface RepositorySyncRow {
  guild_id: string;
  owner: string;
  repo: string;
  branch: string;
  channel_id: string;
  timezone: string;
  weekly_time: string;
  enabled: number;
  last_commit_sha: string | null;
  last_run_key: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  force_sync: number;
  retry_after: number | null;
  lease_until: number | null;
  updated_at: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fromRow(row: ProjectRow): GuildProject {
  const project: GuildProject = {
    guildId: row.guild_id,
    projectName: row.project_name,
    readmeContent: row.readme_content,
    goals: JSON.parse(row.goals_json) as GuildProject["goals"],
    goalHistory: JSON.parse(row.goal_history_json) as GuildProject["goalHistory"],
    nextGoalNumber: row.next_goal_number,
    importedAt: row.imported_at,
    updatedAt: row.updated_at
  };
  if (row.reminder_json) project.reminder = JSON.parse(row.reminder_json) as NonNullable<GuildProject["reminder"]>;
  return project;
}

function changes(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function repositorySyncFromRow(row: RepositorySyncRow): RepositorySyncConfig {
  const sync: RepositorySyncConfig = {
    guildId: row.guild_id,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    channelId: row.channel_id,
    timezone: row.timezone,
    weeklyTime: row.weekly_time,
    enabled: row.enabled === 1,
    forceSync: row.force_sync === 1,
    updatedAt: row.updated_at
  };
  if (row.last_commit_sha) sync.lastCommitSha = row.last_commit_sha;
  if (row.last_run_key) sync.lastRunKey = row.last_run_key;
  if (row.last_sync_at) sync.lastSyncAt = row.last_sync_at;
  if (row.last_error) sync.lastError = row.last_error;
  if (row.retry_after !== null) sync.retryAfter = row.retry_after;
  if (row.lease_until !== null) sync.leaseUntil = row.lease_until;
  return sync;
}

export class D1Store {
  constructor(private readonly database: D1Database) {}

  async getGuild(guildId: string): Promise<GuildProject | undefined> {
    const current = await this.getVersioned(guildId);
    return current ? clone(current.project) : undefined;
  }

  async listGuilds(): Promise<GuildProject[]> {
    const result = await this.database.prepare("SELECT * FROM guild_projects").all<ProjectRow>();
    return result.results.map((row) => fromRow(row));
  }

  async getRepositorySync(guildId: string): Promise<RepositorySyncConfig | undefined> {
    const row = await this.database.prepare(
      "SELECT * FROM repository_syncs WHERE guild_id = ?"
    ).bind(guildId).first<RepositorySyncRow>();
    return row ? repositorySyncFromRow(row) : undefined;
  }

  async listRepositorySyncs(): Promise<RepositorySyncConfig[]> {
    const result = await this.database.prepare(
      "SELECT * FROM repository_syncs WHERE enabled = 1"
    ).all<RepositorySyncRow>();
    return result.results.map((row) => repositorySyncFromRow(row));
  }

  async saveRepositorySync(sync: Omit<RepositorySyncConfig,
    "enabled" | "lastCommitSha" | "lastRunKey" | "lastSyncAt" | "lastError" |
    "forceSync" | "retryAfter" | "leaseUntil" | "updatedAt"
  >): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.database.prepare(`
      INSERT INTO repository_syncs (
        guild_id, owner, repo, branch, channel_id, timezone, weekly_time,
        enabled, force_sync, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        owner = excluded.owner,
        repo = excluded.repo,
        branch = excluded.branch,
        channel_id = excluded.channel_id,
        timezone = excluded.timezone,
        weekly_time = excluded.weekly_time,
        enabled = 1,
        last_commit_sha = NULL,
        last_run_key = NULL,
        last_sync_at = NULL,
        last_error = NULL,
        force_sync = 1,
        retry_after = NULL,
        lease_until = NULL,
        updated_at = excluded.updated_at
    `).bind(
      sync.guildId,
      sync.owner,
      sync.repo,
      sync.branch,
      sync.channelId,
      sync.timezone,
      sync.weeklyTime,
      updatedAt
    ).run();
  }

  async requestRepositorySync(guildId: string): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE repository_syncs
      SET force_sync = 1, retry_after = NULL, updated_at = ?
      WHERE guild_id = ? AND enabled = 1
    `).bind(new Date().toISOString(), guildId).run();
    return changes(result) === 1;
  }

  async disableRepositorySync(guildId: string): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE repository_syncs
      SET enabled = 0, force_sync = 0, lease_until = NULL, updated_at = ?
      WHERE guild_id = ?
    `).bind(new Date().toISOString(), guildId).run();
    return changes(result) === 1;
  }

  async claimRepositorySync(
    guildId: string,
    now: number,
    leaseUntil: number,
    expectedUpdatedAt: string
  ): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE repository_syncs
      SET lease_until = ?, updated_at = ?
      WHERE guild_id = ? AND enabled = 1
        AND (lease_until IS NULL OR lease_until < ?)
        AND updated_at = ?
    `).bind(leaseUntil, new Date(now).toISOString(), guildId, now, expectedUpdatedAt).run();
    return changes(result) === 1;
  }

  async completeRepositorySync(
    guildId: string,
    commitSha: string,
    runKey: string | undefined,
    claimTimestamp: string,
    now = new Date()
  ): Promise<boolean> {
    const timestamp = now.toISOString();
    const result = await this.database.prepare(`
      UPDATE repository_syncs SET
        last_commit_sha = ?, last_run_key = COALESCE(?, last_run_key), last_sync_at = ?, last_error = NULL,
        force_sync = 0, retry_after = NULL, lease_until = NULL, updated_at = ?
      WHERE guild_id = ? AND updated_at = ?
    `).bind(commitSha, runKey ?? null, timestamp, timestamp, guildId, claimTimestamp).run();
    return changes(result) === 1;
  }

  async releaseRepositorySync(
    guildId: string,
    claimTimestamp: string,
    now = new Date()
  ): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE repository_syncs
      SET lease_until = NULL, last_error = NULL, retry_after = NULL, updated_at = ?
      WHERE guild_id = ? AND updated_at = ?
    `).bind(now.toISOString(), guildId, claimTimestamp).run();
    return changes(result) === 1;
  }

  async failRepositorySync(
    guildId: string,
    message: string,
    retryAfter: number,
    claimTimestamp: string
  ): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE repository_syncs SET
        last_error = ?, force_sync = 1, retry_after = ?, lease_until = NULL, updated_at = ?
      WHERE guild_id = ? AND updated_at = ?
    `).bind(message.slice(0, 500), retryAfter, new Date().toISOString(), guildId, claimTimestamp).run();
    return changes(result) === 1;
  }

  async updateGuild<T>(
    guildId: string,
    updater: (current: GuildProject | undefined) => { project: GuildProject; result: T }
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await this.getVersioned(guildId);
      const update = updater(current ? clone(current.project) : undefined);
      const project = update.project;
      const reminderJson = project.reminder ? JSON.stringify(project.reminder) : null;

      const result = current
        ? await this.database.prepare(`
            UPDATE guild_projects SET
              project_name = ?, readme_content = ?, goals_json = ?, goal_history_json = ?,
              next_goal_number = ?, reminder_json = ?, imported_at = ?, updated_at = ?, revision = revision + 1
            WHERE guild_id = ? AND revision = ?
          `).bind(
            project.projectName,
            project.readmeContent,
            JSON.stringify(project.goals),
            JSON.stringify(project.goalHistory),
            project.nextGoalNumber,
            reminderJson,
            project.importedAt,
            project.updatedAt,
            guildId,
            current.revision
          ).run()
        : await this.database.prepare(`
            INSERT INTO guild_projects (
              guild_id, project_name, readme_content, goals_json, goal_history_json,
              next_goal_number, reminder_json, imported_at, updated_at, revision
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(guild_id) DO NOTHING
          `).bind(
            guildId,
            project.projectName,
            project.readmeContent,
            JSON.stringify(project.goals),
            JSON.stringify(project.goalHistory),
            project.nextGoalNumber,
            reminderJson,
            project.importedAt,
            project.updatedAt
          ).run();

      if (changes(result) === 1) return update.result;
    }
    throw new Error("Conflito ao atualizar o projeto; tente novamente.");
  }

  async consumeAiCooldown(
    guildId: string,
    userId: string,
    cooldownSeconds: number,
    now = Date.now()
  ): Promise<number> {
    const row = await this.database.prepare(
      "SELECT used_at FROM ai_cooldowns WHERE guild_id = ? AND user_id = ?"
    ).bind(guildId, userId).first<{ used_at: number }>();
    if (row) {
      const remaining = Math.ceil((row.used_at + cooldownSeconds * 1_000 - now) / 1_000);
      if (remaining > 0) return remaining;
    }
    await this.database.prepare(`
      INSERT INTO ai_cooldowns (guild_id, user_id, used_at) VALUES (?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET used_at = excluded.used_at
    `).bind(guildId, userId, now).run();
    return 0;
  }

  private async getVersioned(guildId: string): Promise<VersionedProject | undefined> {
    const row = await this.database.prepare(
      "SELECT * FROM guild_projects WHERE guild_id = ?"
    ).bind(guildId).first<ProjectRow>();
    return row ? { project: fromRow(row), revision: row.revision } : undefined;
  }
}
