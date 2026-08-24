const SUB_COMMAND = 1;
const STRING = 3;
const INTEGER = 4;
const CHANNEL = 7;
const ROLE = 8;
const ATTACHMENT = 11;
const GUILD_ONLY = {
  dm_permission: false,
  integration_types: [0],
  contexts: [0]
} as const;

export const commandData = [
  {
    ...GUILD_ONLY,
    name: "roadmap",
    description: "Importa e consulta o roadmap deste servidor.",
    options: [
      {
        type: SUB_COMMAND,
        name: "importar",
        description: "Importa um README e preserva o progresso conhecido.",
        options: [
          { type: ATTACHMENT, name: "arquivo", description: "Arquivo .md, .markdown ou .txt do Discord.", required: true },
          { type: STRING, name: "nome", description: "Nome opcional do projeto.", max_length: 100 }
        ]
      },
      { type: SUB_COMMAND, name: "status", description: "Mostra o progresso e os lembretes atuais." }
    ]
  },
  {
    ...GUILD_ONLY,
    name: "metas",
    description: "Lista e atualiza metas do roadmap.",
    options: [
      {
        type: SUB_COMMAND,
        name: "listar",
        description: "Lista metas por estado.",
        options: [{
          type: STRING,
          name: "status",
          description: "Estado das metas.",
          required: true,
          choices: [
            { name: "Pendentes", value: "pendentes" },
            { name: "Concluídas", value: "concluidas" },
            { name: "Todas", value: "todas" }
          ]
        }]
      },
      {
        type: SUB_COMMAND,
        name: "concluir",
        description: "Marca uma meta como concluída.",
        options: [{ type: INTEGER, name: "numero", description: "Número estável da meta.", required: true, min_value: 1 }]
      },
      {
        type: SUB_COMMAND,
        name: "reabrir",
        description: "Marca uma meta como pendente.",
        options: [{ type: INTEGER, name: "numero", description: "Número estável da meta.", required: true, min_value: 1 }]
      }
    ]
  },
  {
    ...GUILD_ONLY,
    name: "lembretes",
    description: "Configura os lembretes automáticos do projeto.",
    options: [
      {
        type: SUB_COMMAND,
        name: "configurar",
        description: "Define destino e agenda dos lembretes.",
        options: [
          { type: CHANNEL, name: "canal", description: "Canal que receberá os lembretes.", required: true, channel_types: [0, 5] },
          { type: STRING, name: "horarios", description: "Horários HH:MM separados por vírgula.", required: true, min_length: 5, max_length: 100 },
          {
            type: STRING,
            name: "frequencia",
            description: "Dias em que os lembretes serão enviados.",
            required: true,
            choices: [
              { name: "Todos os dias", value: "todos-os-dias" },
              { name: "Dias úteis", value: "dias-uteis" },
              { name: "Fins de semana", value: "fins-de-semana" }
            ]
          },
          { type: STRING, name: "fuso", description: "Fuso IANA, como America/Sao_Paulo.", max_length: 100 },
          { type: ROLE, name: "cargo", description: "Cargo opcional a mencionar." }
        ]
      },
      { type: SUB_COMMAND, name: "testar", description: "Envia um lembrete de teste imediatamente." },
      { type: SUB_COMMAND, name: "desligar", description: "Desativa os lembretes automáticos." }
    ]
  },
  {
    ...GUILD_ONLY,
    name: "perguntar",
    description: "Pergunta à IA usando somente o contexto do projeto.",
    options: [{
      type: STRING,
      name: "pergunta",
      description: "Sua dúvida sobre o README ou as metas.",
      required: true,
      min_length: 3,
      max_length: 500
    }]
  },
  {
    ...GUILD_ONLY,
    name: "repositorio",
    description: "Gera um roadmap semanal acompanhando os commits do GitHub.",
    options: [
      {
        type: SUB_COMMAND,
        name: "configurar",
        description: "Liga um repositório público do GitHub ao roadmap.",
        options: [
          { type: STRING, name: "url", description: "URL principal do repositório público.", required: true, max_length: 300 },
          { type: CHANNEL, name: "canal", description: "Canal que receberá o roadmap semanal.", channel_types: [0, 5] },
          { type: STRING, name: "branch", description: "Branch; se omitida, usa a branch padrão.", max_length: 255 },
          { type: STRING, name: "horario", description: "Horário de segunda-feira em HH:MM; padrão 08:00.", min_length: 5, max_length: 5 },
          { type: STRING, name: "fuso", description: "Fuso IANA; padrão America/Sao_Paulo.", max_length: 100 }
        ]
      },
      { type: SUB_COMMAND, name: "atualizar", description: "Pede uma atualização no próximo minuto, sem esperar segunda-feira." },
      { type: SUB_COMMAND, name: "status", description: "Mostra a configuração e o último commit analisado." },
      { type: SUB_COMMAND, name: "desligar", description: "Desativa a atualização semanal do GitHub." }
    ]
  },
  {
    ...GUILD_ONLY,
    name: "ajuda",
    description: "Explica como importar um roadmap e conectar qualquer projeto GitHub."
  }
] as const;
