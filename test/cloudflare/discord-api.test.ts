import assert from "node:assert/strict";
import test from "node:test";
import { initialInteractionText, sendChannelFile, sendInteractionText } from "../../src/discord/api.js";
import type { DiscordInteraction } from "../../src/discord/types.js";

const interaction: DiscordInteraction = {
  id: "interaction-1",
  application_id: "application-1",
  type: 2,
  token: "interaction-token"
};

test("responde inline sem permitir menções", async () => {
  const response = initialInteractionText("Concluído.", true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    type: 4,
    data: {
      content: "Concluído.",
      allowed_mentions: { parse: [] },
      flags: 64
    }
  });
});

test("edita a resposta diferida pelo webhook da interação", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ id: "message-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  await sendInteractionText(interaction, "Concluído.", true, fetcher as typeof fetch);

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    "https://discord.com/api/v10/webhooks/application-1/interaction-token/messages/@original"
  );
  assert.equal(requests[0]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    content: "Concluído.",
    allowed_mentions: { parse: [] }
  });
});

test("propaga o status quando o Discord rejeita a resposta diferida", async () => {
  const fetcher = async (): Promise<Response> => new Response("", { status: 404 });
  await assert.rejects(
    () => sendInteractionText(interaction, "Concluído.", true, fetcher as typeof fetch),
    /status 404/
  );
});

test("anexa o roadmap Markdown sem liberar menções", async () => {
  let captured: RequestInit | undefined;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captured = init;
    return new Response("", { status: 200 });
  };
  await sendChannelFile(
    "channel-1",
    "Roadmap novo",
    "roadmap.md",
    "# Projeto\n- [ ] Meta",
    "bot-token",
    fetcher as typeof fetch
  );

  assert.equal(captured?.method, "POST");
  assert.equal(new Headers(captured?.headers).get("authorization"), "Bot bot-token");
  assert.equal(new Headers(captured?.headers).has("content-type"), false);
  assert.ok(captured?.body instanceof FormData);
  const form = captured.body as FormData;
  const payload = JSON.parse(String(form.get("payload_json"))) as Record<string, unknown>;
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  const file = form.get("files[0]");
  assert.ok(file instanceof File);
  assert.equal(await file.text(), "# Projeto\n- [ ] Meta");
});
