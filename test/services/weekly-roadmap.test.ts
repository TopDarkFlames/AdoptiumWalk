import assert from "node:assert/strict";
import test from "node:test";
import { mergeRoadmap, updateGoalStatus } from "../../src/roadmap/merge.js";
import { parseRoadmap } from "../../src/roadmap/parser.js";
import type { RepositorySnapshot } from "../../src/services/github.js";
import { generateWeeklyRoadmap } from "../../src/services/weekly-roadmap.js";

test("preserva metas concluídas quando a IA as reabre ou omite", async () => {
  const initial = mergeRoadmap(
    "guild",
    "# Projeto\n## Entregas\n- [ ] Publicar o Worker\n- [ ] Criar o banco D1",
    parseRoadmap("# Projeto\n## Entregas\n- [ ] Publicar o Worker\n- [ ] Criar o banco D1")
  );
  const project = updateGoalStatus(updateGoalStatus(initial, 1, true), 2, true);
  const snapshot: RepositorySnapshot = {
    repository: {
      owner: "nero",
      repo: "projeto",
      branch: "main",
      fullName: "nero/projeto",
      htmlUrl: "https://github.com/nero/projeto"
    },
    latestSha: "abcdef123456",
    readme: "# Projeto",
    commits: [{ sha: "abcdef123456", message: "feat: testes", author: "nero" }],
    files: [{ filename: "test.ts", status: "added", additions: 10, deletions: 0 }],
    compareTruncated: false
  };
  const ai = {
    run: async () => ({ response: "# Projeto\n\n## Próxima semana\n\n- [ ] Publicar o Worker\n- [ ] Ampliar os testes" })
  } as unknown as Ai;

  const result = await generateWeeklyRoadmap(ai, project, snapshot, 20);
  assert.match(result.markdown, /- \[x\] Publicar o Worker/);
  assert.match(result.markdown, /## Histórico concluído/);
  assert.match(result.markdown, /- \[x\] Criar o banco D1/);
  const completed = result.parsed.goals.find((goal) => goal.text === "Publicar o Worker");
  assert.equal(completed?.completed, true);
  assert.equal(completed?.key, project.goals[0]?.key);
});
