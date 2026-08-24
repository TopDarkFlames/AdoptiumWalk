import assert from "node:assert/strict";
import test from "node:test";
import { downloadRoadmapAttachment } from "../../src/services/attachment.js";

test("aceita Markdown UTF-8 hospedado pelo Discord", async () => {
  const body = "# Projeto\n- [ ] Meta";
  const fetcher = async (): Promise<Response> => new Response(body, {
    status: 200,
    headers: { "content-length": String(Buffer.byteLength(body)) }
  });
  const result = await downloadRoadmapAttachment({
    name: "README.md",
    size: Buffer.byteLength(body),
    url: "https://cdn.discordapp.com/attachments/1/2/README.md"
  }, 1_000, fetcher as typeof fetch);
  assert.equal(result, body);
});

test("segue redirecionamento seguro do CDN do Discord", async () => {
  const body = "# Projeto redirecionado";
  const requests: string[] = [];
  const fetcher = async (input: URL | RequestInfo): Promise<Response> => {
    const url = input.toString();
    requests.push(url);
    if (requests.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://media.discordapp.net/attachments/1/2/README.md?hm=abc" }
      });
    }
    return new Response(body, { status: 200 });
  };
  const result = await downloadRoadmapAttachment({
    name: "README.md",
    size: Buffer.byteLength(body),
    url: "https://cdn.discordapp.com/attachments/1/2/README.md?hm=abc"
  }, 1_000, fetcher as typeof fetch);
  assert.equal(result, body);
  assert.equal(requests.length, 2);
});

test("tenta a URL de proxy quando a URL principal falha", async () => {
  const body = "# Projeto via proxy";
  const fetcher = async (input: URL | RequestInfo): Promise<Response> => {
    if (input.toString().startsWith("https://cdn.discordapp.com")) throw new Error("falha de rede");
    return new Response(body, { status: 200 });
  };
  const result = await downloadRoadmapAttachment({
    name: "README.md",
    size: Buffer.byteLength(body),
    url: "https://cdn.discordapp.com/attachments/1/2/README.md",
    proxyUrl: "https://media.discordapp.net/attachments/1/2/README.md"
  }, 1_000, fetcher as typeof fetch);
  assert.equal(result, body);
});

test("bloqueia redirecionamento para fora do CDN do Discord", async () => {
  const fetcher = async (): Promise<Response> => new Response(null, {
    status: 302,
    headers: { location: "https://example.com/README.md" }
  });
  await assert.rejects(() => downloadRoadmapAttachment({
    name: "README.md",
    size: 10,
    url: "https://cdn.discordapp.com/attachments/1/2/README.md"
  }, 1_000, fetcher as typeof fetch), /Anexe o arquivo novamente/);
});

test("rejeita extensão, origem e UTF-8 inválidos", async () => {
  await assert.rejects(() => downloadRoadmapAttachment({
    name: "README.pdf",
    size: 10,
    url: "https://cdn.discordapp.com/attachments/1/2/README.pdf"
  }, 1_000));
  await assert.rejects(() => downloadRoadmapAttachment({
    name: "README.md",
    size: 10,
    url: "https://example.com/README.md"
  }, 1_000));
  await assert.rejects(() => downloadRoadmapAttachment({
    name: "README.md",
    size: 10,
    contentType: "application/pdf",
    url: "https://cdn.discordapp.com/attachments/1/2/README.md"
  }, 1_000));

  const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
  const fetcher = async (): Promise<Response> => new Response(invalidUtf8, { status: 200 });
  await assert.rejects(() => downloadRoadmapAttachment({
    name: "README.txt",
    size: 2,
    url: "https://media.discordapp.net/attachments/1/2/README.txt"
  }, 1_000, fetcher as typeof fetch));
});
