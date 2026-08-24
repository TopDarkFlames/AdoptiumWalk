import assert from "node:assert/strict";
import test from "node:test";
import {
  dueReminderTime,
  frequencyMatches,
  isReminderDue,
  isRepositoryPollDue,
  isWeeklyRepositorySyncDue,
  isValidTime,
  isValidTimezone,
  parseReminderTimes,
  reminderKey,
  weeklyRepositoryRunKey
} from "../../src/services/time.js";

test("valida horário e fuso", () => {
  assert.equal(isValidTime("09:00"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("9:00"), false);
  assert.equal(isValidTimezone("America/Sao_Paulo"), true);
  assert.equal(isValidTimezone("Planeta/Inexistente"), false);
  assert.deepEqual(parseReminderTimes("15:00, 08:00,15:00;20:30"), ["08:00", "15:00", "20:30"]);
  assert.throws(() => parseReminderTimes("08:00,25:00"));
});

test("seleciona um entre vários horários configurados", () => {
  const date = new Date("2026-08-17T18:00:00.000Z");
  assert.equal(dueReminderTime(
    date,
    "America/Sao_Paulo",
    ["08:00", "12:00", "15:00", "20:30", "23:00"],
    "todos-os-dias"
  ), "15:00");
});

test("aplica frequências de dias úteis e fins de semana", () => {
  assert.equal(frequencyMatches("dias-uteis", "Mon"), true);
  assert.equal(frequencyMatches("dias-uteis", "Sun"), false);
  assert.equal(frequencyMatches("fins-de-semana", "Sat"), true);
  assert.equal(frequencyMatches("fins-de-semana", "Wed"), false);
  assert.equal(frequencyMatches("todos-os-dias", "Sun"), true);
});

test("evita lembrete duplicado para a mesma data, hora e fuso", () => {
  const mondayAtNine = new Date("2026-08-17T12:00:00.000Z");
  const timezone = "America/Sao_Paulo";
  assert.equal(isReminderDue(mondayAtNine, timezone, "09:00", "dias-uteis"), true);

  const sentKey = reminderKey(mondayAtNine, timezone, "09:00");
  assert.equal(isReminderDue(mondayAtNine, timezone, "09:00", "dias-uteis", sentKey), false);
  assert.equal(isReminderDue(mondayAtNine, timezone, "10:00", "dias-uteis"), false);
});

test("agenda a revisão do repositório na segunda-feira sem duplicar", () => {
  const mondayAtEight = new Date("2026-08-24T11:00:00.000Z");
  const timezone = "America/Sao_Paulo";
  assert.equal(isWeeklyRepositorySyncDue(mondayAtEight, timezone, "08:00"), true);
  const runKey = weeklyRepositoryRunKey(mondayAtEight, timezone);
  assert.equal(isWeeklyRepositorySyncDue(mondayAtEight, timezone, "08:00", runKey), false);
  assert.equal(isWeeklyRepositorySyncDue(new Date("2026-08-25T11:00:00.000Z"), timezone, "08:00"), false);
});

test("monitora commits a cada cinco minutos", () => {
  assert.equal(isRepositoryPollDue(new Date("2026-08-24T11:30:00.000Z")), true);
  assert.equal(isRepositoryPollDue(new Date("2026-08-24T11:31:00.000Z")), false);
  assert.equal(isRepositoryPollDue(new Date("2026-08-24T11:35:00.000Z")), true);
});
