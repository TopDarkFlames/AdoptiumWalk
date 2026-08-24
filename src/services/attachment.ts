export interface RoadmapAttachment {
  name: string;
  url: string;
  size: number;
  contentType?: string | null;
}

const ALLOWED_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const ALLOWED_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const ALLOWED_APPLICATION_TYPES = new Set(["application/octet-stream", "application/x-markdown"]);

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

  const url = validatedDiscordUrl(attachment.url);
  let response: Response;
  try {
    response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "AdoptiumWalk/1.0" }
    });
  } catch {
    throw new Error("Não foi possível baixar o anexo do Discord.");
  }
  if (!response.ok) throw new Error("O Discord não disponibilizou o anexo.");
  validatedDiscordUrl(response.url || url.toString());

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
