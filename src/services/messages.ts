import type { GuildProject, GoalStatusFilter } from "../types.js";
import { configuredReminderTimes } from "./time.js";

export const SAFE_ALLOWED_MENTIONS = { parse: [] as never[] };

export function sanitizeDiscordText(value: string): string {
  return value.replace(/@/g, "@\u200b").replace(/```/g, "ˋˋˋ");
}

export function splitDiscordMessage(value: string, maxLength = 1_900): string[] {
  if (maxLength < 1) throw new Error("maxLength deve ser positivo.");
  if (!value) return [""];

  const chunks: string[] = [];
  let current = "";
  const pushCurrent = (): void => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const originalLine of value.split("\n")) {
    let line = originalLine;
    while (line.length > maxLength) {
      pushCurrent();
      chunks.push(line.slice(0, maxLength));
      line = line.slice(maxLength);
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength) {
      pushCurrent();
      current = line;
    } else {
      current = candidate;
    }
  }
  pushCurrent();
  return chunks.length ? chunks : [""];
}

export function progress(project: GuildProject): { completed: number; total: number; percent: number } {
  const total = project.goals.length;
  const completed = project.goals.filter((goal) => goal.completed).length;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export function formatProjectStatus(project: GuildProject): string {
  const summary = progress(project);
  const reminder = project.reminder?.enabled
    ? `<#${project.reminder.channelId}> às ${configuredReminderTimes(project.reminder).join(", ")} (${project.reminder.timezone}, ${project.reminder.frequency})`
    : "desligado";
  return [
    `**${sanitizeDiscordText(project.projectName)}**`,
    `Progresso: **${summary.completed}/${summary.total} (${summary.percent}%)**`,
    `Lembrete: ${reminder}`
  ].join("\n");
}

export function formatGoalList(project: GuildProject, filter: GoalStatusFilter): string {
  const filtered = project.goals
    .filter((goal) => filter === "todas" || (filter === "concluidas" ? goal.completed : !goal.completed))
    .sort((left, right) => left.number - right.number);
  if (!filtered.length) return `Nenhuma meta ${filter === "todas" ? "" : filter} encontrada.`.trim();

  const lines = filtered.map((goal) => {
    const mark = goal.completed ? "✅" : "⬜";
    return `${mark} **#${goal.number}** ${sanitizeDiscordText(goal.text)}\n↳ ${sanitizeDiscordText(goal.section)}`;
  });
  return `**Metas de ${sanitizeDiscordText(project.projectName)}**\n\n${lines.join("\n\n")}`;
}

function reminderOpening(scheduledTime?: string): string {
  switch (scheduledTime) {
    case "08:00":
      return "☀️ **Bom dia!** Escolham uma meta concreta para fazer o projeto andar hoje.";
    case "12:00":
      return "🧭 **Check-in do meio-dia:** o foco da manhã avançou ou precisa de ajuste?";
    case "15:00":
      return "⚡ **Impulso das 15h:** destravem uma pendência pequena antes que ela cresça.";
    case "20:30":
      return "🌆 **Reta final:** registrem o que avançou e fechem a principal pendência possível.";
    case "23:00":
      return "🌙 **Última chamada:** terminem o que couber hoje ou deixem a próxima ação bem definida.";
    default:
      return "🚶 **Hora de dar mais um passo no projeto.**";
  }
}

export function formatReminder(project: GuildProject, maxPending = 5, scheduledTime?: string): string {
  const summary = progress(project);
  const pending = project.goals.filter((goal) => !goal.completed).sort((a, b) => a.number - b.number);
  const roleMention = project.reminder?.roleId ? `<@&${project.reminder.roleId}>\n` : "";
  const priorities = pending.length
    ? pending.slice(0, maxPending).map((goal) => `• **#${goal.number}** ${sanitizeDiscordText(goal.text)}`).join("\n")
    : "🎉 Todas as metas atuais estão concluídas.";

  return [
    `${roleMention}**AdoptiumWalk — ${sanitizeDiscordText(project.projectName)}**`,
    reminderOpening(scheduledTime),
    `Progresso: **${summary.completed}/${summary.total} (${summary.percent}%)**`,
    "",
    "**Próximas metas pendentes**",
    priorities,
    "",
    "Use `/metas listar` para ver o roadmap ou `/perguntar` para tirar uma dúvida."
  ].join("\n");
}
