import { D1Store } from "./cloudflare/d1-store.js";
import { loadRuntimeConfig } from "./cloudflare/env.js";
import {
  deferredInteraction,
  initialInteractionText,
  interactionJson,
  sendInteractionText
} from "./discord/api.js";
import {
  commandIsEphemeral,
  handleDiscordCommand,
  PublicError
} from "./discord/command-handler.js";
import { verifiedInteractionBody } from "./discord/signature.js";
import type { DiscordInteraction } from "./discord/types.js";
import { splitDiscordMessage } from "./services/messages.js";
import { runScheduledReminders } from "./services/reminder-worker.js";
import { runScheduledRepositorySyncs } from "./services/repository-worker.js";

const PING = 1;
const APPLICATION_COMMAND = 2;
const INLINE_RESPONSE_DEADLINE_MS = 1_500;

interface CommandOutcome {
  text: string;
  isError: boolean;
}

function interactionLog(
  level: "info" | "error",
  event: string,
  interaction: DiscordInteraction,
  details: Record<string, unknown> = {}
): void {
  const entry = JSON.stringify({
    event,
    interactionId: interaction.id,
    guildId: interaction.guild_id,
    command: interaction.data?.name,
    ...details
  });
  if (level === "error") console.error(entry);
  else console.log(entry);
}

function safeInitialError(message: string): Response {
  return interactionJson(4, {
    content: `⚠️ ${message}`,
    flags: 64,
    allowed_mentions: { parse: [] }
  });
}

async function resolveInteraction(
  interaction: DiscordInteraction,
  env: Env
): Promise<CommandOutcome> {
  const startedAt = performance.now();
  try {
    const config = loadRuntimeConfig(env);
    const answer = await handleDiscordCommand(interaction, new D1Store(env.DB), config);
    interactionLog("info", "interaction_resolved", interaction, {
      elapsedMs: Math.round(performance.now() - startedAt)
    });
    return { text: answer, isError: false };
  } catch (error) {
    const message = error instanceof PublicError
      ? error.message
      : "Não foi possível concluir a operação. Tente novamente mais tarde.";
    interactionLog(error instanceof PublicError ? "info" : "error", "interaction_failed", interaction, {
      elapsedMs: Math.round(performance.now() - startedAt),
      errorType: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : undefined
    });
    return { text: `⚠️ ${message}`, isError: true };
  }
}

async function deliverDeferredInteraction(
  interaction: DiscordInteraction,
  outcomePromise: Promise<CommandOutcome>,
  ephemeral: boolean
): Promise<void> {
  const outcome = await outcomePromise;
  try {
    await sendInteractionText(interaction, outcome.text, ephemeral);
    interactionLog("info", "interaction_delivered", interaction, {
      delivery: "deferred",
      isError: outcome.isError
    });
  } catch (error) {
    interactionLog("error", "interaction_delivery_failed", interaction, {
      delivery: "deferred",
      errorType: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : undefined
    });
  }
}

async function handleHttp(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    return Response.json({ ok: true, service: "AdoptiumWalk", runtime: "cloudflare-workers" });
  }
  if (request.method !== "POST" || url.pathname !== "/interactions") {
    return new Response("Not found", { status: 404 });
  }

  const publicKey = env.DISCORD_PUBLIC_KEY?.trim();
  if (!publicKey) return new Response("Worker misconfigured", { status: 500 });
  const body = await verifiedInteractionBody(request, publicKey);
  if (!body) return new Response("Invalid request signature", { status: 401 });

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (interaction.application_id !== env.DISCORD_APPLICATION_ID) {
    return new Response("Wrong application", { status: 401 });
  }
  if (interaction.type === PING) return interactionJson(1);
  if (interaction.type !== APPLICATION_COMMAND || !interaction.data) {
    return safeInitialError("Tipo de interação não suportado.");
  }

  let ephemeral = true;
  try {
    ephemeral = commandIsEphemeral(interaction.data);
  } catch {
    return safeInitialError("O comando recebido é inválido.");
  }
  interactionLog("info", "interaction_received", interaction);
  const outcomePromise = resolveInteraction(interaction, env);
  const immediateOutcome = await Promise.race([
    outcomePromise,
    scheduler.wait(INLINE_RESPONSE_DEADLINE_MS).then(() => undefined)
  ]);
  if (immediateOutcome && splitDiscordMessage(immediateOutcome.text).length === 1) {
    interactionLog("info", "interaction_delivered", interaction, {
      delivery: "inline",
      isError: immediateOutcome.isError
    });
    return initialInteractionText(immediateOutcome.text, ephemeral);
  }

  context.waitUntil(deliverDeferredInteraction(interaction, outcomePromise, ephemeral));
  interactionLog("info", "interaction_deferred", interaction);
  return deferredInteraction(ephemeral);
}

export default {
  fetch: handleHttp,
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const config = loadRuntimeConfig(env);
    const date = new Date(controller.scheduledTime);
    await runScheduledReminders(env, config, date);
    await runScheduledRepositorySyncs(env, config, date);
  }
} satisfies ExportedHandler<Env>;
