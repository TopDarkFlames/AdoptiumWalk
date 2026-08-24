import { splitDiscordMessage } from "../services/messages.js";
import type { DiscordInteraction } from "./types.js";

const DISCORD_API = "https://discord.com/api/v10";
const NO_MENTIONS = { parse: [] as string[] };

async function discordFetch(url: string, init: RequestInit, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(url, init);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Discord API respondeu com status ${response.status}.`);
  }
  await response.body?.cancel();
}

export function interactionJson(type: number, data?: Record<string, unknown>): Response {
  return Response.json(data ? { type, data } : { type });
}

export function deferredInteraction(ephemeral: boolean): Response {
  return interactionJson(5, ephemeral ? { flags: 64 } : undefined);
}

export function initialInteractionText(text: string, ephemeral: boolean): Response {
  return interactionJson(4, {
    content: text,
    allowed_mentions: NO_MENTIONS,
    ...(ephemeral ? { flags: 64 } : {})
  });
}

export async function sendInteractionText(
  interaction: DiscordInteraction,
  text: string,
  ephemeral: boolean,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const chunks = splitDiscordMessage(text).slice(0, 5);
  const webhookUrl = `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}`;
  const first = chunks.shift() ?? "Resposta vazia.";
  await discordFetch(`${webhookUrl}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: first, allowed_mentions: NO_MENTIONS })
  }, fetcher);
  for (const chunk of chunks) {
    await discordFetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: chunk,
        allowed_mentions: NO_MENTIONS,
        ...(ephemeral ? { flags: 64 } : {})
      })
    }, fetcher);
  }
}

export async function sendChannelMessage(
  channelId: string,
  content: string,
  botToken: string,
  roleId?: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  await discordFetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${botToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [], roles: roleId ? [roleId] : [] }
    })
  }, fetcher);
}

export async function sendChannelFile(
  channelId: string,
  content: string,
  fileName: string,
  fileContent: string,
  botToken: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const form = new FormData();
  form.set("payload_json", JSON.stringify({
    content,
    allowed_mentions: NO_MENTIONS,
    attachments: [{
      id: 0,
      filename: fileName,
      description: "Roadmap semanal gerado a partir das mudanças do GitHub."
    }]
  }));
  form.set(
    "files[0]",
    new Blob([fileContent], { type: "text/markdown;charset=utf-8" }),
    fileName
  );
  await discordFetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { authorization: `Bot ${botToken}` },
    body: form
  }, fetcher);
}
