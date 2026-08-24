import { D1Store } from "../cloudflare/d1-store.js";
import type { RuntimeConfig } from "../cloudflare/env.js";
import { sendChannelFile } from "../discord/api.js";
import { sanitizeDiscordText } from "./messages.js";
import { mergeRoadmap } from "../roadmap/merge.js";
import type { RepositorySyncConfig } from "../types.js";
import {
  getLatestCommitSha,
  getRepositorySnapshot,
  GitHubRepositoryError,
  type GitHubRepository
} from "./github.js";
import {
  isRepositoryPollDue,
  isWeeklyRepositorySyncDue,
  weeklyRepositoryRunKey
} from "./time.js";
import { generateWeeklyRoadmap } from "./weekly-roadmap.js";

const SYNC_LEASE_MS = 10 * 60 * 1_000;
const RETRY_DELAY_MS = 60 * 60 * 1_000;
const REPOSITORY_POLL_MINUTES = 5;

type SyncReason = "commit" | "manual" | "weekly";

function syncReason(sync: RepositorySyncConfig, date: Date): SyncReason | undefined {
  if (sync.retryAfter && sync.retryAfter > date.getTime()) return undefined;
  if (sync.forceSync) return "manual";
  if (isWeeklyRepositorySyncDue(
    date,
    sync.timezone,
    sync.weeklyTime,
    sync.lastRunKey
  )) return "weekly";
  return isRepositoryPollDue(date, REPOSITORY_POLL_MINUTES) ? "commit" : undefined;
}

function repositoryFromSync(sync: RepositorySyncConfig): GitHubRepository {
  return {
    owner: sync.owner,
    repo: sync.repo,
    branch: sync.branch,
    fullName: `${sync.owner}/${sync.repo}`,
    htmlUrl: `https://github.com/${sync.owner}/${sync.repo}`
  };
}

function safeFailureMessage(error: unknown): string {
  return error instanceof GitHubRepositoryError
    ? error.message
    : "Falha interna ao gerar o roadmap; o bot tentará novamente.";
}

async function runOneRepositorySync(
  env: Env,
  config: RuntimeConfig,
  store: D1Store,
  sync: RepositorySyncConfig,
  date: Date
): Promise<void> {
  const reason = syncReason(sync, date);
  if (!reason) return;
  const now = Date.now();
  const claimTimestamp = new Date(now).toISOString();
  if (!await store.claimRepositorySync(sync.guildId, now, now + SYNC_LEASE_MS, sync.updatedAt)) return;
  const runKey = weeklyRepositoryRunKey(date, sync.timezone);

  try {
    const project = await store.getGuild(sync.guildId);
    if (!project) throw new Error("Projeto removido durante a sincronização.");
    const repository = repositoryFromSync(sync);
    if (reason === "commit" && sync.lastCommitSha) {
      const latestSha = await getLatestCommitSha(repository);
      if (latestSha === sync.lastCommitSha) {
        await store.releaseRepositorySync(sync.guildId, claimTimestamp, new Date());
        return;
      }
    }
    const snapshot = await getRepositorySnapshot(repository, sync.lastCommitSha);

    const generated = await generateWeeklyRoadmap(env.AI, project, snapshot, config.maxGoals);
    const updated = await store.updateGuild(sync.guildId, (current) => {
      if (!current) throw new Error("Projeto removido durante a atualização.");
      const merged = mergeRoadmap(sync.guildId, generated.markdown, generated.parsed, current, date);
      return { project: merged, result: merged };
    });
    const completed = updated.goals.filter((goal) => goal.completed).length;
    const nextGoals = updated.goals.filter((goal) => !goal.completed).slice(0, 3);
    const headline = reason === "commit"
      ? "🚀 **Novo commit detectado — próximas metas atualizadas**"
      : reason === "weekly"
        ? `🧭 **Roadmap semanal atualizado — ${sanitizeDiscordText(updated.projectName)}**`
        : `🔄 **Roadmap atualizado — ${sanitizeDiscordText(updated.projectName)}**`;
    const goalsText = nextGoals.length
      ? ["**Agora as próximas metas são:**", ...nextGoals.map((goal) =>
          `• **#${goal.number}** ${sanitizeDiscordText(goal.text).slice(0, 220)}`
        )].join("\n")
      : "✅ Todas as metas atuais estão concluídas.";
    const fileDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: sync.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
    await sendChannelFile(
      sync.channelId,
      [
        headline,
        `Analisei o commit \`${snapshot.latestSha.slice(0, 7)}\` de **${sanitizeDiscordText(repository.fullName)}**.`,
        `Agora são **${updated.goals.length} metas**, com **${completed} concluídas**.`,
        goalsText,
        `${repository.htmlUrl}/commit/${snapshot.latestSha}`
      ].join("\n"),
      `roadmap-${fileDate}.md`,
      generated.markdown,
      config.discordToken
    );
    await store.completeRepositorySync(
      sync.guildId,
      snapshot.latestSha,
      reason === "weekly" ? runKey : undefined,
      claimTimestamp,
      new Date()
    );
    console.log(JSON.stringify({
      event: "repository_sync_completed",
      guildId: sync.guildId,
      repository: repository.fullName,
      commit: snapshot.latestSha,
      reason,
      goals: updated.goals.length
    }));
  } catch (error) {
    await store.failRepositorySync(
      sync.guildId,
      safeFailureMessage(error),
      now + RETRY_DELAY_MS,
      claimTimestamp
    );
    console.error(JSON.stringify({
      event: "repository_sync_failed",
      guildId: sync.guildId,
      repository: `${sync.owner}/${sync.repo}`,
      errorType: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : undefined
    }));
  }
}

export async function runScheduledRepositorySyncs(
  env: Env,
  config: RuntimeConfig,
  date = new Date()
): Promise<void> {
  const store = new D1Store(env.DB);
  for (const sync of await store.listRepositorySyncs()) {
    await runOneRepositorySync(env, config, store, sync, date);
  }
}
