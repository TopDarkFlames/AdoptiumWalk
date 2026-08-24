import type { ReminderFrequency } from "../types.js";

export interface ZonedDateParts {
  date: string;
  time: string;
  weekday: string;
}

export function isValidTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseReminderTimes(value: string, maxTimes = 10): string[] {
  const times = [...new Set(value.split(/[,;\s]+/).map((time) => time.trim()).filter(Boolean))];
  if (!times.length) throw new Error("Informe ao menos um horário.");
  if (times.length > maxTimes) throw new Error(`Configure no máximo ${maxTimes} horários.`);
  const invalid = times.find((time) => !isValidTime(time));
  if (invalid) throw new Error(`O horário ${invalid} é inválido; use HH:MM.`);
  return times.sort((left, right) => left.localeCompare(right));
}

export function configuredReminderTimes(reminder: { times?: string[]; time?: string }): string[] {
  const candidates = reminder.times?.length ? reminder.times : reminder.time ? [reminder.time] : [];
  return [...new Set(candidates.filter(isValidTime))].sort((left, right) => left.localeCompare(right));
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const { year, month, day, hour, minute, weekday } = parts;
  if (!year || !month || !day || !hour || !minute || !weekday) {
    throw new Error("Não foi possível calcular a data no fuso configurado.");
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    weekday
  };
}

export function frequencyMatches(frequency: ReminderFrequency, weekday: string): boolean {
  const weekend = weekday === "Sat" || weekday === "Sun";
  switch (frequency) {
    case "todos-os-dias":
      return true;
    case "dias-uteis":
      return !weekend;
    case "fins-de-semana":
      return weekend;
  }
}

export function reminderKey(date: Date, timezone: string, time: string): string {
  return `${getZonedDateParts(date, timezone).date}|${time}|${timezone}`;
}

export function isReminderDue(
  date: Date,
  timezone: string,
  time: string,
  frequency: ReminderFrequency,
  lastSentKey?: string
): boolean {
  const parts = getZonedDateParts(date, timezone);
  const key = `${parts.date}|${time}|${timezone}`;
  return parts.time === time && frequencyMatches(frequency, parts.weekday) && lastSentKey !== key;
}

export function dueReminderTime(
  date: Date,
  timezone: string,
  times: string[],
  frequency: ReminderFrequency,
  lastSentKey?: string
): string | undefined {
  return times.find((time) => isReminderDue(date, timezone, time, frequency, lastSentKey));
}

export function weeklyRepositoryRunKey(date: Date, timezone: string): string {
  return `${getZonedDateParts(date, timezone).date}|weekly|${timezone}`;
}

export function isWeeklyRepositorySyncDue(
  date: Date,
  timezone: string,
  time: string,
  lastRunKey?: string
): boolean {
  const parts = getZonedDateParts(date, timezone);
  return parts.weekday === "Mon"
    && parts.time === time
    && lastRunKey !== weeklyRepositoryRunKey(date, timezone);
}

export function isRepositoryPollDue(date: Date, intervalMinutes = 5): boolean {
  if (!Number.isSafeInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
    throw new Error("O intervalo de monitoramento deve ser um inteiro entre 1 e 60 minutos.");
  }
  return date.getUTCMinutes() % intervalMinutes === 0;
}
