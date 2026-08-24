export interface DiscordAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  content_type?: string;
}

export interface DiscordCommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordCommandOption[];
}

export interface DiscordInteractionData {
  name: string;
  options?: DiscordCommandOption[];
  resolved?: {
    attachments?: Record<string, DiscordAttachment>;
  };
}

export interface DiscordInteraction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  data?: DiscordInteractionData;
  member?: {
    permissions: string;
    user: { id: string; username: string };
  };
  user?: { id: string; username: string };
}

export interface ParsedSubcommand {
  name: string;
  options: DiscordCommandOption[];
}

export function getSubcommand(data: DiscordInteractionData): ParsedSubcommand {
  const subcommand = data.options?.find((option) => option.type === 1);
  if (!subcommand) throw new Error("Subcomando ausente.");
  return { name: subcommand.name, options: subcommand.options ?? [] };
}

export function optionValue<T extends string | number | boolean>(
  options: DiscordCommandOption[],
  name: string,
  required = true
): T | undefined {
  const value = options.find((option) => option.name === name)?.value;
  if (value === undefined) {
    if (required) throw new Error(`Opção ${name} ausente.`);
    return undefined;
  }
  return value as T;
}
