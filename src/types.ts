export type GoalStatusFilter = "pendentes" | "concluidas" | "todas";

export type ReminderFrequency = "todos-os-dias" | "dias-uteis" | "fins-de-semana";

export interface GoalDraft {
  key: string;
  text: string;
  section: string;
  completed: boolean;
}

export interface Goal extends GoalDraft {
  number: number;
  updatedAt: string;
}

export interface GoalHistoryEntry {
  number: number;
  completed: boolean;
  updatedAt: string;
}

export interface ParsedRoadmap {
  projectName: string;
  goals: GoalDraft[];
}

export interface ReminderConfig {
  enabled: boolean;
  channelId: string;
  times: string[];
  /** Compatibilidade de leitura com bancos criados antes do suporte a vários horários. */
  time?: string;
  timezone: string;
  frequency: ReminderFrequency;
  roleId?: string;
  lastSentKey?: string;
  updatedAt: string;
}

export interface GuildProject {
  guildId: string;
  projectName: string;
  readmeContent: string;
  goals: Goal[];
  goalHistory: Record<string, GoalHistoryEntry>;
  nextGoalNumber: number;
  reminder?: ReminderConfig;
  importedAt: string;
  updatedAt: string;
}

export interface RepositorySyncConfig {
  guildId: string;
  owner: string;
  repo: string;
  branch: string;
  channelId: string;
  timezone: string;
  weeklyTime: string;
  enabled: boolean;
  lastCommitSha?: string;
  lastRunKey?: string;
  lastSyncAt?: string;
  lastError?: string;
  forceSync: boolean;
  retryAfter?: number;
  leaseUntil?: number;
  updatedAt: string;
}

export interface DatabaseSchema {
  version: 2;
  guilds: Record<string, GuildProject>;
}
