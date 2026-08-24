export interface RoadmapAttachment {
  name: string;
  url: string;
  proxyUrl?: string;
  size: number;
  contentType?: string | null;
}

const ALLOWED_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const ALLOWED_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const ALLOWED_APPLICATION_TYPES = new Set(["application/octet-stream", "application/x-markdown"]);
const MAX_REDIRECTS = 3;

function validatedDiscordUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("O endereço do anexo é inválido.");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("O anexo precisa estar hospedado pelo Discord.");
  }
  return url;
}

async function fetchDiscordUrl(rawUrl: string, fetcher: typeof fetch): Promise<Response> {
  let url = validatedDiscordUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "AdoptiumWalk/1.0" }
    });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location || redirects === MAX_REDIRECTS) {
      throw new Error("O Discord redirecionou o anexo muitas vezes.");
    }
    url = validatedDiscordUrl(new URL(location, url).toString());
  }
  throw new Error("O Discord redirecionou o anexo muitas vezes.");
}

export async function downloadRoadmapAttachment(
  attachment: RoadmapAttachment,
  maxBytes: number,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const lastDot = attachment.name.lastIndexOf(".");
  const extension = lastDot >= 0 ? attachment.name.slice(lastDot).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Envie um arquivo .md, .markdown ou .txt.");
  }
  const contentType = attachment.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && !contentType.startsWith("text/") && !ALLOWED_APPLICATION_TYPES.has(contentType)) {
    throw new Error("O tipo do anexo não corresponde a um documento de texto ou Markdown.");
  }
  if (attachment.size <= 0) throw new Error("O anexo está vazio.");
  if (attachment.size > maxBytes) {
    throw new Error(`O anexo excede o limite de ${maxBytes} bytes.`);
  }

  const urls = [attachment.url, attachment.proxyUrl]
    .filter((value): value is string => Boolean(value));
  let response: Response | undefined;
  let lastError: unknown;
  for (const candidate of urls) {
    try {
      const downloaded = await fetchDiscordUrl(candidate, fetcher);
      if (downloaded.ok) {
        response = downloaded;
        break;
      }
      lastError = new Error(`O Discord respondeu HTTP ${downloaded.status}.`);
    } catch (error) {
      lastError = error;
    }
  }
  if (!response) {
    console.warn(JSON.stringify({
      event: "discord_attachment_download_failed",
      error: lastError instanceof Error ? lastError.message.slice(0, 200) : "erro desconhecido"
    }));
    throw new Error("Não foi possível baixar o anexo do Discord. Anexe o arquivo novamente e tente outra vez.");
  }
  if (response.url) validatedDiscordUrl(response.url);

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`O anexo excede o limite de ${maxBytes} bytes.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("O anexo está vazio.");
  if (bytes.byteLength > maxBytes) throw new Error(`O anexo excede o limite de ${maxBytes} bytes.`);

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("O arquivo precisa usar codificação UTF-8 válida.");
  }
}
