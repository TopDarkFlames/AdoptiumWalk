const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_JSON_BYTES = 1_500_000;
const MAX_README_BYTES = 300_000;
const REQUEST_TIMEOUT_MS = 15_000;

export class GitHubRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubRepositoryError";
  }
}

export interface GitHubRepository {
  owner: string;
  repo: string;
  branch: string;
  htmlUrl: string;
  fullName: string;
}

export interface RepositoryCommit {
  sha: string;
  message: string;
  author: string;
  date?: string;
}

export interface RepositoryFileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface RepositorySnapshot {
  repository: GitHubRepository;
  latestSha: string;
  readme: string;
  commits: RepositoryCommit[];
  files: RepositoryFileChange[];
  compareTruncated: boolean;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function repositoryPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function githubHeaders(accept = "application/vnd.github+json"): Headers {
  return new Headers({
    accept,
    "user-agent": "AdoptiumWalk/1.0",
    "x-github-api-version": GITHUB_API_VERSION
  });
}

async function githubFetch(
  path: string,
  fetcher: typeof fetch,
  accept?: string
): Promise<Response> {
  try {
    return await fetcher(`${GITHUB_API}${path}`, {
      headers: githubHeaders(accept),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new GitHubRepositoryError("O GitHub não respondeu a tempo. Tente novamente mais tarde.");
  }
}

async function limitedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    await response.body?.cancel();
    throw new GitHubRepositoryError("A resposta do GitHub ficou grande demais para ser processada com segurança.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new GitHubRepositoryError("A resposta do GitHub ficou grande demais para ser processada com segurança.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

async function githubJson(path: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await githubFetch(path, fetcher);
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) {
      throw new GitHubRepositoryError("Repositório ou branch não encontrado. Por enquanto, use um repositório público.");
    }
    if (response.status === 403 || response.status === 429) {
      throw new GitHubRepositoryError("O limite temporário do GitHub foi atingido. O bot tentará novamente depois.");
    }
    throw new GitHubRepositoryError(`O GitHub respondeu com status ${response.status}.`);
  }
  const text = await limitedText(response, MAX_JSON_BYTES);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GitHubRepositoryError("O GitHub devolveu uma resposta inválida.");
  }
}

export function parseGitHubRepositoryUrl(value: string): { owner: string; repo: string } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new GitHubRepositoryError("Informe uma URL válida, como https://github.com/usuario/projeto.");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new GitHubRepositoryError("Por enquanto, o bot aceita apenas URLs públicas do GitHub.");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new GitHubRepositoryError("Use a URL principal do repositório, como https://github.com/usuario/projeto.");
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
    throw new GitHubRepositoryError("A URL do repositório contém um nome inválido.");
  }
  return { owner, repo };
}

export async function getPublicRepository(
  url: string,
  requestedBranch?: string,
  fetcher: typeof fetch = fetch
): Promise<GitHubRepository> {
  const { owner, repo } = parseGitHubRepositoryUrl(url);
  const data = await githubJson(repositoryPath(owner, repo), fetcher);
  if (!isObject(data) || data.private === true) {
    throw new GitHubRepositoryError("Por enquanto, configure um repositório público do GitHub.");
  }
  const defaultBranch = stringValue(data.default_branch);
  const branch = requestedBranch?.trim() || defaultBranch;
  if (
    !branch
    || branch.length > 255
    || /[\u0000-\u0020~^:?*\\\[\]]/.test(branch)
    || branch.startsWith("/")
    || branch.endsWith("/")
    || branch.endsWith(".")
    || branch.endsWith(".lock")
    || branch.includes("..")
    || branch.includes("//")
    || branch.includes("@{")
  ) {
    throw new GitHubRepositoryError("A branch informada é inválida.");
  }
  const fullName = stringValue(data.full_name, `${owner}/${repo}`);
  const htmlUrl = stringValue(data.html_url, `https://github.com/${owner}/${repo}`);
  return { owner, repo, branch, htmlUrl, fullName };
}

function commitFromJson(value: unknown): RepositoryCommit | undefined {
  if (!isObject(value)) return undefined;
  const sha = stringValue(value.sha);
  const commit = isObject(value.commit) ? value.commit : {};
  const author = isObject(commit.author) ? commit.author : {};
  const githubAuthor = isObject(value.author) ? value.author : {};
  const message = stringValue(commit.message).split("\n", 1)[0]?.trim() ?? "";
  if (!sha || !message) return undefined;
  const result: RepositoryCommit = {
    sha,
    message: message.slice(0, 500),
    author: stringValue(githubAuthor.login, stringValue(author.name, "desconhecido")).slice(0, 100)
  };
  const date = stringValue(author.date);
  if (date) result.date = date;
  return result;
}

function fileFromJson(value: unknown): RepositoryFileChange | undefined {
  if (!isObject(value)) return undefined;
  const filename = stringValue(value.filename);
  if (!filename) return undefined;
  return {
    filename: filename.slice(0, 300),
    status: stringValue(value.status, "modified").slice(0, 30),
    additions: numberValue(value.additions),
    deletions: numberValue(value.deletions)
  };
}

async function readReadme(repository: GitHubRepository, fetcher: typeof fetch): Promise<string> {
  const response = await githubFetch(
    `${repositoryPath(repository.owner, repository.repo)}/readme?ref=${encodeURIComponent(repository.branch)}`,
    fetcher,
    "application/vnd.github.raw+json"
  );
  if (response.status === 404) {
    await response.body?.cancel();
    return "";
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new GitHubRepositoryError(`Não foi possível ler o README do GitHub (status ${response.status}).`);
  }
  return limitedText(response, MAX_README_BYTES);
}

async function recentCommits(
  repository: GitHubRepository,
  fetcher: typeof fetch,
  perPage = 20
): Promise<RepositoryCommit[]> {
  const data = await githubJson(
    `${repositoryPath(repository.owner, repository.repo)}/commits?sha=${encodeURIComponent(repository.branch)}&per_page=${perPage}`,
    fetcher
  );
  if (!Array.isArray(data)) throw new GitHubRepositoryError("O GitHub não devolveu a lista de commits esperada.");
  return data.map(commitFromJson).filter((commit): commit is RepositoryCommit => Boolean(commit));
}

export async function getLatestCommitSha(
  repository: GitHubRepository,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const latest = (await recentCommits(repository, fetcher, 1))[0];
  if (!latest) throw new GitHubRepositoryError("A branch configurada ainda não possui commits.");
  return latest.sha;
}

async function latestCommitFiles(
  repository: GitHubRepository,
  latestSha: string,
  fetcher: typeof fetch
): Promise<RepositoryFileChange[]> {
  const data = await githubJson(
    `${repositoryPath(repository.owner, repository.repo)}/commits/${encodeURIComponent(latestSha)}`,
    fetcher
  );
  if (!isObject(data) || !Array.isArray(data.files)) return [];
  return data.files.map(fileFromJson).filter((file): file is RepositoryFileChange => Boolean(file)).slice(0, 100);
}

async function compareChanges(
  repository: GitHubRepository,
  previousSha: string,
  latestSha: string,
  fetcher: typeof fetch
): Promise<{ commits: RepositoryCommit[]; files: RepositoryFileChange[]; truncated: boolean } | undefined> {
  try {
    const data = await githubJson(
      `${repositoryPath(repository.owner, repository.repo)}/compare/${encodeURIComponent(previousSha)}...${encodeURIComponent(latestSha)}?per_page=100`,
      fetcher
    );
    if (!isObject(data)) return undefined;
    const rawCommits = Array.isArray(data.commits) ? data.commits : [];
    const rawFiles = Array.isArray(data.files) ? data.files : [];
    return {
      commits: rawCommits.map(commitFromJson).filter((commit): commit is RepositoryCommit => Boolean(commit)).slice(-100),
      files: rawFiles.map(fileFromJson).filter((file): file is RepositoryFileChange => Boolean(file)).slice(0, 150),
      truncated: numberValue(data.total_commits) > rawCommits.length || rawFiles.length > 150
    };
  } catch (error) {
    if (error instanceof GitHubRepositoryError) return undefined;
    throw error;
  }
}

export async function getRepositorySnapshot(
  repository: GitHubRepository,
  previousSha?: string,
  fetcher: typeof fetch = fetch
): Promise<RepositorySnapshot> {
  const [readme, listedCommits] = await Promise.all([
    readReadme(repository, fetcher),
    recentCommits(repository, fetcher)
  ]);
  const latest = listedCommits[0];
  if (!latest) throw new GitHubRepositoryError("A branch configurada ainda não possui commits.");

  if (previousSha && previousSha === latest.sha) {
    return {
      repository,
      latestSha: latest.sha,
      readme,
      commits: [],
      files: [],
      compareTruncated: false
    };
  }

  const compared = previousSha
    ? await compareChanges(repository, previousSha, latest.sha, fetcher)
    : undefined;
  const files = compared?.files ?? await latestCommitFiles(repository, latest.sha, fetcher);
  return {
    repository,
    latestSha: latest.sha,
    readme,
    commits: compared?.commits.length ? compared.commits : listedCommits,
    files,
    compareTruncated: compared?.truncated ?? false
  };
}
