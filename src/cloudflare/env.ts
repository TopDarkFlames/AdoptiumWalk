import { isValidTimezone } from "../services/time.js";

export interface RuntimeConfig {
  discordApplicationId: string;
  discordPublicKey: string;
  discordToken: string;
  defaultTimezone: string;
  aiApiKey?: string;
  aiModel: string;
  aiBaseUrl: string;
  maxReadmeBytes: number;
  maxGoals: number;
  aiCooldownSeconds: number;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} não foi configurado.`);
  return normalized;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} deve ser um inteiro positivo.`);
  return parsed;
}

export function loadRuntimeConfig(env: Env): RuntimeConfig {
  const defaultTimezone = env.DEFAULT_TIMEZONE?.trim() || "America/Sao_Paulo";
  if (!isValidTimezone(defaultTimezone)) throw new Error("DEFAULT_TIMEZONE é inválido.");

  const config: RuntimeConfig = {
    discordApplicationId: required(env.DISCORD_APPLICATION_ID, "DISCORD_APPLICATION_ID"),
    discordPublicKey: required(env.DISCORD_PUBLIC_KEY, "DISCORD_PUBLIC_KEY"),
    discordToken: required(env.DISCORD_TOKEN, "DISCORD_TOKEN"),
    defaultTimezone,
    aiModel: env.AI_MODEL?.trim() || "gpt-5-mini",
    aiBaseUrl: (env.AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
    maxReadmeBytes: positiveInteger(env.MAX_README_BYTES, 1_048_576, "MAX_README_BYTES"),
    maxGoals: positiveInteger(env.MAX_GOALS, 300, "MAX_GOALS"),
    aiCooldownSeconds: positiveInteger(env.AI_COOLDOWN_SECONDS, 20, "AI_COOLDOWN_SECONDS")
  };
  const aiApiKey = env.AI_API_KEY?.trim();
  if (aiApiKey) config.aiApiKey = aiApiKey;

  return config;
}
