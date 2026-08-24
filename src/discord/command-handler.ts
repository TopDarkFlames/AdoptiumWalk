import { D1Store } from "../cloudflare/d1-store.js";
import type { RuntimeConfig } from "../cloudflare/env.js";
import { mergeRoadmap, updateGoalStatus } from "../roadmap/merge.js";
import { parseRoadmap, RoadmapValidationError } from "../roadmap/parser.js";
import { askProjectQuestion } from "../services/ai-worker.js";
import { downloadRoadmapAttachment } from "../services/attachment.js";
import { getPublicRepository, GitHubRepositoryError } from "../services/github.js";
import {
  formatGoalList,
  formatProjectStatus,
  formatReminder,
  sanitizeDiscordText
} from "../services/messages.js";
import { isValidTime, isValidTimezone, parseReminderTimes } from "../services/time.js";
import type { GoalStatusFilter, GuildProject, ReminderConfig, ReminderFrequency } from "../types.js";
import { sendChannelMessage } from "./api.js";
import {
  getSubcommand,
  optionValue,
  type DiscordInteraction,
  type DiscordInteractionData,
  type DiscordCommandOption
} from "./types.js";

export class PublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicError";
  }
}

export function commandIsEphemeral(data: DiscordInteractionData): boolean {
  if (data.name === "roadmap") return getSubcommand(data).name !== "status";
  if (data.name === "metas") return getSubcommand(data).name !== "listar";
  return true;
}

function guildId(interaction: DiscordInteraction): string {
  if (!interaction.guild_id) throw new PublicError("Este comando só funciona dentro de um servidor.");
  return interaction.guild_id;
}

function requireManageGuild(interaction: DiscordInteraction): void {
  const permissions = BigInt(interaction.member?.permissions ?? "0");
  const administrator = 1n << 3n;
  const manageGuild = 1n << 5n;
  if ((permissions & administrator) === 0n && (permissions & manageGuild) === 0n) {
    throw new PublicError("Você precisa da permissão **Gerenciar Servidor** para usar este comando.");
  }
}

async function requireProject(store: D1Store, id: string): Promise<GuildProject> {
  const project = await store.getGuild(id);
  if (!project) throw new PublicError("Nenhum roadmap foi importado neste servidor.");
  return project;
}

async function handleRoadmap(
  interaction: DiscordInteraction,
  data: DiscordInteractionData,
  store: D1Store,
  config: RuntimeConfig
): Promise<string> {
  const id = guildId(interaction);
  const subcommand = getSubcommand(data);
  if (subcommand.name === "status") return formatProjectStatus(await requireProject(store, id));

  requireManageGuild(interaction);
  const attachmentId = String(optionValue<string>(subcommand.options, "arquivo"));
  const attachment = data.resolved?.attachments?.[attachmentId];
  if (!attachment) throw new PublicError("O Discord não forneceu o anexo selecionado.");
  let readme: string;
  try {
    const roadmapAttachment = {
      name: attachment.filename,
      size: attachment.size,
      url: attachment.url
    } as { name: string; size: number; url: string; contentType?: string };
    if (attachment.content_type) roadmapAttachment.contentType = attachment.content_type;
    readme = await downloadRoadmapAttachment(roadmapAttachment, config.maxReadmeBytes);
  } catch (error) {
    throw new PublicError(error instanceof Error ? error.message : "O anexo enviado é inválido.");
  }

  const suppliedName = optionValue<string>(subcommand.options, "nome", false)?.trim();
  let parsed: ReturnType<typeof parseRoadmap>;
  try {
    parsed = parseRoadmap(readme, suppliedName, config.maxGoals);
  } catch (error) {
    if (error instanceof RoadmapValidationError) throw new PublicError(error.message);
    throw error;
  }

  const project = await store.updateGuild(id, (previous) => {
    const merged = mergeRoadmap(id, readme, parsed, previous);
    return { project: merged, result: merged };
  });
  const completed = project.goals.filter((goal) => goal.completed).length;
  const reminderInfo = project.reminder?.enabled
    ? ` Lembretes automáticos ativos em <#${project.reminder.channelId}>.`
    : "";
  return `Roadmap **${sanitizeDiscordText(project.projectName)}** importado: **${project.goals.length} metas**, ${completed} concluídas.${reminderInfo}`;
}

async function handleGoals(
  interaction: DiscordInteraction,
  data: DiscordInteractionData,
  store: D1Store
): Promise<string> {
  const id = guildId(interaction);
  const project = await requireProject(store, id);
  const subcommand = getSubcommand(data);
  if (subcommand.name === "listar") {
    return formatGoalList(project, String(optionValue<string>(subcommand.options, "status")) as GoalStatusFilter);
  }

  const number = Number(optionValue<number>(subcommand.options, "numero"));
  const completed = subcommand.name === "concluir";
  const goal = project.goals.find((candidate) => candidate.number === number);
  if (!goal) throw new PublicError(`A meta #${number} não existe no roadmap atual.`);
  const updated = await store.updateGuild(id, (current) => {
    if (!current) throw new PublicError("O projeto deixou de existir durante a atualização.");
    const changed = updateGoalStatus(current, number, completed);
    return { project: changed, result: changed.goals.find((candidate) => candidate.number === number) };
  });
  return `${completed ? "✅ Meta concluída" : "⬜ Meta reaberta"}: **#${number}** ${sanitizeDiscordText(updated?.text ?? goal.text)}`;
}

function reminderFromOptions(options: DiscordCommandOption[], config: RuntimeConfig): ReminderConfig {
  const channelId = String(optionValue<string>(options, "canal"));
  const timesValue = String(optionValue<string>(options, "horarios"));
  const timezone = optionValue<string>(options, "fuso", false)?.trim() || config.defaultTimezone;
  const frequency = String(optionValue<string>(options, "frequencia")) as ReminderFrequency;
  const roleId = optionValue<string>(options, "cargo", false);
  let times: string[];
  try {
    times = parseReminderTimes(timesValue);
  } catch (error) {
    throw new PublicError(error instanceof Error ? error.message : "A lista de horários é inválida.");
  }
  if (!isValidTimezone(timezone)) throw new PublicError("Informe um fuso IANA válido, como **America/Sao_Paulo**.");
  if (frequency !== "todos-os-dias" && frequency !== "dias-uteis" && frequency !== "fins-de-semana") {
    throw new PublicError("A frequência informada é inválida.");
  }
  const reminder: ReminderConfig = {
    enabled: true,
    channelId,
    times,
    timezone,
    frequency,
    updatedAt: new Date().toISOString()
  };
  if (roleId) reminder.roleId = roleId;
  return reminder;
}

async function handleReminders(
  interaction: DiscordInteraction,
  data: DiscordInteractionData,
  store: D1Store,
  config: RuntimeConfig
): Promise<string> {
  const id = guildId(interaction);
  requireManageGuild(interaction);
  const current = await requireProject(store, id);
  const subcommand = getSubcommand(data);

  if (subcommand.name === "configurar") {
    const reminder = reminderFromOptions(subcommand.options, config);
    await store.updateGuild(id, (project) => {
      if (!project) throw new PublicError("O projeto deixou de existir durante a configuração.");
      return { project: { ...project, reminder, updatedAt: reminder.updatedAt }, result: undefined };
    });
    return `Lembretes configurados em <#${reminder.channelId}> às **${reminder.times.join(", ")}** (${reminder.timezone}, ${reminder.frequency}).`;
  }

  if (subcommand.name === "testar") {
    if (!current.reminder?.enabled) throw new PublicError("Configure os lembretes antes de testá-los.");
    try {
      await sendChannelMessage(
        current.reminder.channelId,
        formatReminder(current),
        config.discordToken,
        current.reminder.roleId
      );
    } catch {
      throw new PublicError("Não foi possível enviar no canal configurado. Verifique o canal e as permissões do bot.");
    }
    return "Lembrete de teste enviado.";
  }

  const updatedAt = new Date().toISOString();
  await store.updateGuild(id, (project) => {
    if (!project) throw new PublicError("O projeto deixou de existir durante a atualização.");
    if (!project.reminder) return { project: { ...project, updatedAt }, result: undefined };
    return {
      project: { ...project, reminder: { ...project.reminder, enabled: false, updatedAt }, updatedAt },
      result: undefined
    };
  });
  return "Lembretes automáticos desligados.";
}

async function handleQuestion(
  interaction: DiscordInteraction,
  data: DiscordInteractionData,
  store: D1Store,
  config: RuntimeConfig
): Promise<string> {
  const id = guildId(interaction);
  const project = await requireProject(store, id);
  if (!config.aiApiKey) throw new PublicError("A IA ainda não está configurada no Worker.");
  const userId = interaction.member?.user.id ?? interaction.user?.id;
  if (!userId) throw new PublicError("Não foi possível identificar o usuário.");
  const remaining = await store.consumeAiCooldown(id, userId, config.aiCooldownSeconds);
  if (remaining > 0) throw new PublicError(`Aguarde **${remaining}s** antes de fazer outra pergunta.`);
  const question = String(optionValue<string>(data.options ?? [], "pergunta"));
  return sanitizeDiscordText(await askProjectQuestion({ ...config, aiApiKey: config.aiApiKey }, project, question));
}

async function handleRepository(
  interaction: DiscordInteraction,
  data: DiscordInteractionData,
  store: D1Store,
  config: RuntimeConfig
): Promise<string> {
  const id = guildId(interaction);
  const subcommand = getSubcommand(data);

  if (subcommand.name === "status") {
    const sync = await store.getRepositorySync(id);
    if (!sync) throw new PublicError("Nenhum repositório foi configurado neste servidor.");
    const state = sync.enabled ? "ativo" : "desligado";
    const commit = sync.lastCommitSha ? `\`${sync.lastCommitSha.slice(0, 7)}\`` : "ainda não analisado";
    const lastSync = sync.lastSyncAt
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: sync.timezone })
        .format(new Date(sync.lastSyncAt))
      : "ainda não executado";
    const error = sync.lastError ? `\nÚltimo erro: ${sanitizeDiscordText(sync.lastError)}` : "";
    return [
      `GitHub **${state}** para **${sanitizeDiscordText(`${sync.owner}/${sync.repo}`)}**.`,
      `Branch: **${sanitizeDiscordText(sync.branch)}** · Segunda às **${sync.weeklyTime}** (${sync.timezone}).`,
      `Destino: <#${sync.channelId}> · Último commit: ${commit} · Última execução: ${lastSync}.${error}`
    ].join("\n");
  }

  requireManageGuild(interaction);
  await requireProject(store, id);

  if (subcommand.name === "configurar") {
    const url = String(optionValue<string>(subcommand.options, "url"));
    const requestedBranch = optionValue<string>(subcommand.options, "branch", false)?.trim();
    const weeklyTime = optionValue<string>(subcommand.options, "horario", false)?.trim() || "08:00";
    const timezone = optionValue<string>(subcommand.options, "fuso", false)?.trim() || config.defaultTimezone;
    const channelId = optionValue<string>(subcommand.options, "canal", false)
      ?? interaction.channel_id;
    if (!channelId) throw new PublicError("Não foi possível descobrir o canal de destino.");
    if (!isValidTime(weeklyTime)) throw new PublicError("Informe o horário no formato **HH:MM**.");
    if (!isValidTimezone(timezone)) throw new PublicError("Informe um fuso IANA válido, como **America/Sao_Paulo**.");

    let repository: Awaited<ReturnType<typeof getPublicRepository>>;
    try {
      repository = await getPublicRepository(url, requestedBranch);
    } catch (error) {
      if (error instanceof GitHubRepositoryError) throw new PublicError(error.message);
      throw error;
    }
    await store.saveRepositorySync({
      guildId: id,
      owner: repository.owner,
      repo: repository.repo,
      branch: repository.branch,
      channelId,
      timezone,
      weeklyTime
    });
    return [
      `✅ GitHub **${sanitizeDiscordText(repository.fullName)}** configurado na branch **${sanitizeDiscordText(repository.branch)}**.`,
      `O bot verificará commits novos a cada **5 minutos** e fará a revisão completa toda segunda às **${weeklyTime}** (${timezone}) em <#${channelId}>.`,
      "A primeira análise foi colocada na fila e começa no próximo minuto."
    ].join("\n");
  }

  if (subcommand.name === "atualizar") {
    if (!await store.requestRepositorySync(id)) {
      throw new PublicError("Configure e ative um repositório antes de pedir a atualização.");
    }
    return "🔄 Atualização solicitada. O bot começará a analisar o GitHub no próximo minuto.";
  }

  if (!await store.disableRepositorySync(id)) {
    throw new PublicError("Nenhum repositório foi configurado neste servidor.");
  }
  return "Atualização semanal do GitHub desligada.";
}

export async function handleDiscordCommand(
  interaction: DiscordInteraction,
  store: D1Store,
  config: RuntimeConfig
): Promise<string> {
  const data = interaction.data;
  if (!data) throw new PublicError("O comando não contém dados válidos.");
  switch (data.name) {
    case "ajuda":
      return [
        "## AdoptiumWalk — início rápido",
        "Cada servidor possui seu próprio projeto e pode conectar **qualquer repositório público do GitHub**.",
        "1. Envie um arquivo com checkboxes usando `/roadmap importar`.",
        "2. Use `/repositorio configurar` e informe a URL, por exemplo `https://github.com/equipe/PIVAS`.",
        "3. A cada commit novo, o bot atualiza as próximas metas e anexa o roadmap no canal.",
        "4. Use `/metas concluir`, `/metas listar` e `/lembretes configurar` no acompanhamento diário.",
        "Documentação: https://github.com/TopDarkFlames/AdoptiumWalk"
      ].join("\n");
    case "roadmap":
      return handleRoadmap(interaction, data, store, config);
    case "metas":
      return handleGoals(interaction, data, store);
    case "lembretes":
      return handleReminders(interaction, data, store, config);
    case "perguntar":
      return handleQuestion(interaction, data, store, config);
    case "repositorio":
      return handleRepository(interaction, data, store, config);
    default:
      throw new PublicError("Comando não reconhecido.");
  }
}
