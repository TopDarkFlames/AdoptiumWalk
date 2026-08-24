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
