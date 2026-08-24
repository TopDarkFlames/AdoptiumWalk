import assert from "node:assert/strict";
import test from "node:test";
import { commandData } from "../../src/discord/commands.js";

test("serializa os cinco grupos de slash commands para registro REST", () => {
  assert.deepEqual(commandData.map((command) => command.name), ["roadmap", "metas", "lembretes", "perguntar", "repositorio"]);
  const reminders = commandData.find((command) => command.name === "lembretes");
  assert.ok(JSON.stringify(reminders).includes("horarios"));
  const repository = commandData.find((command) => command.name === "repositorio");
  assert.ok(JSON.stringify(repository).includes("configurar"));
});
