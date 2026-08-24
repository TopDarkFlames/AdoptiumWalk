import assert from "node:assert/strict";
import test from "node:test";
import { mergeRoadmap, updateGoalStatus } from "../../src/roadmap/merge.js";
import { parseRoadmap, RoadmapValidationError } from "../../src/roadmap/parser.js";

test("extrai nome, checkboxes, status e seção do README", () => {
  const parsed = parseRoadmap(`# Meu Projeto

## Roadmap

### Meta 1 — Fundação
- [x] Criar repositório
- [ ] Configurar banco
`);

  assert.equal(parsed.projectName, "Meu Projeto");
  assert.equal(parsed.goals.length, 2);
  assert.deepEqual(parsed.goals.map((goal) => goal.completed), [true, false]);
  assert.equal(parsed.goals[0]?.section, "Roadmap › Meta 1 — Fundação");
});

test("nome fornecido substitui o título do documento", () => {
  const parsed = parseRoadmap("# Nome original\n- [ ] Entregar MVP", "Nome escolhido");
  assert.equal(parsed.projectName, "Nome escolhido");
});

test("usa títulos de meta como fallback quando não há checkboxes", () => {
  const parsed = parseRoadmap(`# Produto
## Introdução
## Fase 1 — Descoberta
### Objetivo principal
## Sprint 2
`);

  assert.deepEqual(parsed.goals.map((goal) => goal.text), [
    "Fase 1 — Descoberta",
    "Objetivo principal",
    "Sprint 2"
  ]);
  assert.ok(parsed.goals.every((goal) => !goal.completed));
});

test("rejeita README vazio ou sem metas", () => {
  assert.throws(() => parseRoadmap(" \n"), RoadmapValidationError);
  assert.throws(() => parseRoadmap("# Projeto\nTexto informativo."), RoadmapValidationError);
});

test("preserva número e progresso manual após reimportação", () => {
  const firstParsed = parseRoadmap("# Projeto\n- [ ] Meta A\n- [ ] Meta B");
  const first = mergeRoadmap("guild", "primeiro", firstParsed, undefined, new Date("2026-01-01T00:00:00Z"));
  const completed = updateGoalStatus(first, 2, true, new Date("2026-01-02T00:00:00Z"));

  const secondParsed = parseRoadmap("# Projeto\n- [x] Meta A\n- [ ] Meta B\n- [ ] Meta C");
  const second = mergeRoadmap("guild", "segundo", secondParsed, completed, new Date("2026-01-03T00:00:00Z"));

  assert.deepEqual(second.goals.map((goal) => [goal.number, goal.completed]), [
    [1, false],
    [2, true],
    [3, false]
  ]);
});

test("mantém número histórico se uma meta removida voltar", () => {
  const initial = mergeRoadmap("g", "", parseRoadmap("# P\n- [ ] A\n- [ ] B"), undefined);
  const withoutA = mergeRoadmap("g", "", parseRoadmap("# P\n- [ ] B"), initial);
  const restored = mergeRoadmap("g", "", parseRoadmap("# P\n- [ ] A\n- [ ] B"), withoutA);
  assert.deepEqual(restored.goals.map((goal) => goal.number), [1, 2]);
});
