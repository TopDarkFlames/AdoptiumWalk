import { commandData } from "../src/discord/commands.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não foi configurado em .dev.vars.`);
  return value;
}

async function main(): Promise<void> {
  const applicationId = required("DISCORD_APPLICATION_ID");
  const token = required("DISCORD_TOKEN");
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const route = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;
  const response = await fetch(route, {
    method: "PUT",
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(commandData)
  });
  if (!response.ok) throw new Error(`Discord respondeu com status ${response.status}.`);
  console.log(`${commandData.length} comandos registrados ${guildId ? "no servidor de teste" : "globalmente"}.`);
}

main().catch((error: unknown) => {
  const kind = error instanceof Error ? `${error.name}: ${error.message}` : typeof error;
  console.error(`Falha ao registrar comandos: ${kind}`);
  process.exitCode = 1;
});
