import assert from "node:assert/strict";
import test from "node:test";
import {
  getPublicRepository,
  getLatestCommitSha,
  getRepositorySnapshot,
  parseGitHubRepositoryUrl
} from "../../src/services/github.js";

test("aceita apenas a URL principal de um repositório público do GitHub", () => {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/adoptium/adoptium.git"), {
    owner: "adoptium",
    repo: "adoptium"
  });
  assert.throws(() => parseGitHubRepositoryUrl("https://gitlab.com/adoptium/adoptium"));
  assert.throws(() => parseGitHubRepositoryUrl("https://github.com/adoptium/adoptium/tree/main"));
});

test("descobre a branch padrão e coleta README, commits e arquivos", async () => {
  const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url === "https://api.github.com/repos/adoptium/walk") {
      return Response.json({
        private: false,
        default_branch: "main",
        full_name: "adoptium/walk",
        html_url: "https://github.com/adoptium/walk"
      });
    }
    if (url.includes("/readme?ref=main")) return new Response("# Walk\nREADME atual");
    if (url.includes("/commits?sha=main")) {
      return Response.json([{
        sha: "abcdef1234567890",
        commit: { message: "feat: adiciona rota", author: { name: "Nero", date: "2026-08-24T10:00:00Z" } },
        author: { login: "nero" }
      }]);
    }
    if (url.endsWith("/commits/abcdef1234567890")) {
      return Response.json({ files: [{ filename: "src/worker.ts", status: "modified", additions: 8, deletions: 2 }] });
    }
    return new Response("not found", { status: 404 });
  };

  const repository = await getPublicRepository(
    "https://github.com/adoptium/walk",
    undefined,
    fetcher as typeof fetch
  );
  const snapshot = await getRepositorySnapshot(repository, undefined, fetcher as typeof fetch);
  const latestSha = await getLatestCommitSha(repository, fetcher as typeof fetch);
  assert.equal(repository.branch, "main");
  assert.equal(snapshot.latestSha, "abcdef1234567890");
  assert.equal(latestSha, "abcdef1234567890");
  assert.match(snapshot.readme, /README atual/);
  assert.equal(snapshot.commits[0]?.message, "feat: adiciona rota");
  assert.equal(snapshot.files[0]?.filename, "src/worker.ts");
});
