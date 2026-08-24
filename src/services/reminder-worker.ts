import { D1Store } from "../cloudflare/d1-store.js";
import type { RuntimeConfig } from "../cloudflare/env.js";
import { sendChannelMessage } from "../discord/api.js";
import { formatReminder } from "./messages.js";
import { configuredReminderTimes, dueReminderTime, reminderKey } from "./time.js";

export async function runScheduledReminders(
  env: Env,
  config: RuntimeConfig,
  date = new Date()
): Promise<void> {
  const store = new D1Store(env.DB);
  for (const project of await store.listGuilds()) {
    const reminder = project.reminder;
    if (!reminder?.enabled) continue;
    const scheduledTime = dueReminderTime(
      date,
      reminder.timezone,
      configuredReminderTimes(reminder),
      reminder.frequency,
      reminder.lastSentKey
    );
    if (!scheduledTime) continue;

    try {
      await sendChannelMessage(
        reminder.channelId,
        formatReminder(project, 5, scheduledTime),
        config.discordToken,
        reminder.roleId
      );
      const sentKey = reminderKey(date, reminder.timezone, scheduledTime);
      await store.updateGuild(project.guildId, (current) => {
        if (!current?.reminder) throw new Error("Projeto removido durante o lembrete.");
        const now = new Date().toISOString();
        return {
          project: {
            ...current,
            reminder: { ...current.reminder, lastSentKey: sentKey },
            updatedAt: now
          },
          result: undefined
        };
      });
    } catch (error) {
      const kind = error instanceof Error ? error.name : typeof error;
      console.error(`Falha segura no lembrete do servidor ${project.guildId}: ${kind}`);
    }
  }
}
