import assert from "node:assert/strict";
import test from "node:test";
import { formatReminder, sanitizeDiscordText, splitDiscordMessage } from "../../src/services/messages.js";
import { mergeRoadmap } from "../../src/roadmap/merge.js";
import { parseRoadmap } from "../../src/roadmap/parser.js";

test("divide respostas sem ultrapassar o limite do Discord", () => {
  const chunks = splitDiscordMessage(`primeira linha\n${"x".repeat(55)}\núltima`, 20);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 20));
});

test("neutraliza menções e cercas originadas do README ou da IA", () => {
  const safe = sanitizeDiscordText("@everyone ```segredo```");
  assert.equal(safe.includes("@everyone"), false);
  assert.equal(safe.includes("```"), false);
});

test("formata lembrete com progresso e metas pendentes", () => {
  const project = mergeRoadmap(
    "guild",
    "readme",
    parseRoadmap("# Projeto\n- [x] Feito\n- [ ] Próximo passo"),
    undefined,
    new Date("2026-01-01T00:00:00Z")
  );
  project.reminder = {
    enabled: true,
    channelId: "123",
    times: ["09:00", "15:00"],
    timezone: "America/Sao_Paulo",
    frequency: "dias-uteis",
    updatedAt: "2026-01-01T00:00:00Z"
  };

  const message = formatReminder(project, 5, "15:00");
  assert.match(message, /1\/2 \(50%\)/);
  assert.match(message, /#2.*Próximo passo/);
  assert.match(message, /\/metas listar/);
  assert.match(message, /\/perguntar/);
  assert.match(message, /Impulso das 15h/);
});
