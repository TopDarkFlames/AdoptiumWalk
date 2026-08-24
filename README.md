# AdoptiumWalk

Bot serverless do Discord que transforma um README em metas acompanháveis, envia lembretes, observa commits do GitHub e cria um roadmap semanal com IA. O runtime usa **Cloudflare Workers + D1 + Workers AI** e não depende de VPS, contêiner ou computador ligado.

## Adicionar o bot ao seu servidor

[**Instalar AdoptiumWalk no Discord**](https://discord.com/oauth2/authorize?client_id=1539285893096013905&permissions=35840&integration_type=0&scope=bot%20applications.commands)

O serviço hospedado é multi-servidor: cada servidor mantém seu próprio roadmap, lembretes, progresso e repositório no D1. O código fica em `TopDarkFlames/AdoptiumWalk`, mas uma equipe pode configurar qualquer projeto público, por exemplo `https://github.com/equipe/PIVAS`.

Depois da instalação, use `/ajuda` dentro do Discord.

## Uso rápido

Depois de instalar o bot — ou fazer seu próprio deploy — siga este fluxo:

1. importe [ROADMAP.md](./ROADMAP.md) no Discord com `/roadmap importar`;
2. conecte um repositório público com `/repositorio configurar`;
3. faça `git commit` e `git push` normalmente;
4. em até cinco minutos o bot compara o novo SHA com o último processado, atualiza as metas e publica o Markdown no canal.

Exemplo de configuração no Discord:

```text
/roadmap importar arquivo:ROADMAP.md nome:AdoptiumWalk
/repositorio configurar url:https://github.com/USUARIO/AdoptiumWalk canal:#projeto branch:main horario:08:00 fuso:America/Sao_Paulo
```

Depois, o uso diário é apenas:

```bash
git add .
git commit -m "feat: descreva a mudança"
git push
```

O monitor consulta somente o commit mais recente quando nada mudou. Ao encontrar um SHA novo, analisa todos os commits e arquivos desde a última execução, apresenta até três próximas metas diretamente na mensagem e anexa o roadmap completo. `/repositorio atualizar` força uma análise no próximo minuto.

## Arquitetura

```text
Discord slash command ──HTTP assinado──> Cloudflare Worker
                                              │
                                              ├── D1: projetos, metas, agenda e último commit
                                              ├── GitHub REST API: README, commits e arquivos alterados
                                              ├── Workers AI: geração do roadmap semanal
                                              ├── Discord REST API: respostas, lembretes e anexos
                                              └── OpenAI Responses API: /perguntar (opcional)

Cron Trigger (a cada minuto) ───────────> lembretes + monitor de commits + revisão semanal
```

- `src/worker.ts`: endpoint `/interactions`, health check e handler agendado;
- `src/discord`: assinatura Ed25519, comandos e chamadas REST;
- `src/cloudflare`: configuração e repositório D1 com controle otimista de concorrência;
- `src/roadmap`: parser e preservação de números/progresso;
- `src/services`: anexos, IA, GitHub, geração semanal, horários, mensagens e lembretes;
- `migrations`: schema versionado do D1;
- `scripts/register-commands.ts`: publicação dos slash commands.

O Worker não solicita intents de mensagens, presenças ou membros. O Discord envia somente as interações dos slash commands para o endpoint HTTP.

## Recursos gratuitos utilizados

O projeto cabe no plano Workers Free: 100 mil invocações por dia, 3 MB por Worker e até cinco Cron Triggers. O D1 Free oferece banco de até 500 MB. O Workers AI inclui uma alocação gratuita diária, suficiente para a geração semanal de um projeto pequeno. Este projeto usa somente um Cron Trigger por minuto, aproximadamente 1.440 invocações diárias.

- [Limites dos Workers](https://developers.cloudflare.com/workers/platform/limits/)
- [Limites do D1](https://developers.cloudflare.com/d1/platform/limits/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Preços do Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)

Os limites podem mudar; confirme as páginas oficiais antes de uma implantação futura.

## Requisitos

- Node.js 22 ou superior;
- conta gratuita da Cloudflare;
- aplicação Discord já instalada no servidor;
- token novo do bot — redefina o anterior em **Developer Portal → Bot → Reset Token**;
- chave OpenAI somente se `/perguntar` for utilizado.

## Instalação local

```bash
npm install
cp .dev.vars.example .dev.vars
```

Preencha `.dev.vars` apenas na máquina local:

```dotenv
DISCORD_APPLICATION_ID=seu_application_id
DISCORD_PUBLIC_KEY=sua_chave_publica
DISCORD_GUILD_ID=servidor_de_teste_opcional
DISCORD_TOKEN=token_novo_do_bot
AI_API_KEY=
```

`.dev.vars` está ignorado pelo Git. Nunca coloque tokens em `wrangler.jsonc`, comandos do Discord, issues ou mensagens.

## Criar e publicar na Cloudflare

### 1. Autenticar o Wrangler

```bash
npx wrangler login
```

### 2. Criar o banco D1

```bash
npx wrangler d1 create adoptiumwalk
```

Em uma nova instalação, copie o `database_id` retornado para `wrangler.jsonc`. Neste projeto, o banco já foi criado e o identificador atual já está configurado.

### 3. Gravar segredos no Worker

Cada comando abaixo abre um prompt seguro. Cole o valor somente no terminal:

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put AI_API_KEY
```

`AI_API_KEY` é opcional. Sem ela, todos os recursos funcionam exceto `/perguntar`.

### 4. Criar as tabelas e fazer deploy

```bash
npm run db:migrate:remote
npm run deploy
```

O Worker deste projeto está publicado em:

```text
https://adoptiumwalk.adoptiumwalk.workers.dev
```

O health check está em `/health` e o endpoint Discord em `/interactions`.

### 5. Conectar o Discord ao Worker

No Discord Developer Portal:

1. abra a aplicação;
2. entre em **General Information**;
3. em **Interactions Endpoint URL**, informe `https://SUA-URL.workers.dev/interactions`;
4. salve; o Discord enviará um PING assinado, que o Worker valida e responde automaticamente.

O endpoint desta aplicação já foi configurado e validado pela API oficial do Discord como `https://adoptiumwalk.adoptiumwalk.workers.dev/interactions`.

### 6. Publicar os comandos atualizados

Com o token novo preenchido em `.dev.vars`:

```bash
npm run deploy:commands
npm run deploy:commands:global
```

`deploy:commands` atualiza imediatamente o servidor definido em `DISCORD_GUILD_ID`, útil para testes. `deploy:commands:global` publica os comandos para todos os servidores que instalarem o bot.

## Configuração por servidor

Nenhum canal ou repositório é compartilhado entre servidores. Um administrador configura o projeto localmente com:

```text
/roadmap importar
/repositorio configurar
/lembretes configurar
```

O fuso padrão é `America/Sao_Paulo`, mas pode ser alterado em cada configuração. Canais, horários, cargos, progresso e GitHub ficam associados ao ID do servidor no D1.

O Cron roda em UTC, mas o código calcula o horário no fuso IANA do projeto. Não é necessário converter manualmente e uma futura mudança de offset será respeitada pelo runtime.

## Comandos

```text
/ajuda

/roadmap importar arquivo:README.md nome:Meu Projeto
/roadmap status

/metas listar status:pendentes
/metas concluir numero:3
/metas reabrir numero:3

/lembretes configurar canal:#projeto horarios:08:00,12:00,15:00,20:30,23:00 frequencia:todos-os-dias fuso:America/Sao_Paulo
/lembretes testar
/lembretes desligar

/perguntar pergunta:Qual é a próxima prioridade?

/repositorio configurar url:https://github.com/usuario/projeto canal:#projeto branch:main horario:08:00 fuso:America/Sao_Paulo
/repositorio atualizar
/repositorio status
/repositorio desligar
```

Os comandos de importação, lembretes e configuração do repositório exigem **Gerenciar Servidor**. A autorização é conferida novamente no Worker, não apenas na interface do Discord.

### Roadmap semanal pelo GitHub

Antes de configurar, publique o diretório do projeto em um repositório público do GitHub e importe um roadmap inicial — este repositório inclui [ROADMAP.md](./ROADMAP.md) pronto para isso. Em seguida, use `/repositorio configurar`.

Na primeira execução, quando detectar commit novo e toda segunda-feira no horário configurado, o bot:

1. consulta a branch a cada cinco minutos e identifica o commit mais recente;
2. lê o README e resume commits e arquivos alterados desde a última análise;
3. pede ao Workers AI um roadmap atualizado em Markdown;
4. preserva metas já concluídas e números de metas reconhecidas;
5. salva o novo estado no D1 e anexa `roadmap-AAAA-MM-DD.md` no canal.

Quando o SHA muda, o bot compara desde o último commit processado, gera as próximas metas, atualiza o D1 e publica a prioridade no corpo da mensagem junto do arquivo completo. Dois ou mais commits entre verificações são analisados juntos, sempre terminando no commit mais recente.

`/repositorio atualizar` coloca uma revisão manual na fila do próximo Cron, normalmente em até um minuto. A revisão semanal também acontece quando não houve commit novo: nesse caso, o bot deixa a ausência de mudanças explícita e reorganiza a semana sem inventar progresso. No momento, essa integração aceita repositórios públicos do GitHub; repositórios privados exigirão suporte posterior a um token GitHub armazenado como segredo.

## Desenvolvimento e testes

Aplicar o banco local e iniciar o Worker:

```bash
npm run db:migrate:local
npm run dev
```

Validação completa:

```bash
npm test
npm run check
npm run build
npx wrangler deploy --dry-run
```

Os testes cobrem assinatura Ed25519, D1, cooldown, comandos, parser, preservação de progresso, anexos, GitHub, geração semanal, horários, deduplicação, mensagens e resposta REST da IA.

## Variáveis e segredos

| Nome | Tipo | Finalidade |
| --- | --- | --- |
| `DISCORD_APPLICATION_ID` | variável | ID público da aplicação |
| `DISCORD_PUBLIC_KEY` | segredo | valida assinatura das interações |
| `DISCORD_TOKEN` | segredo | envia lembretes e registra comandos |
| `AI_API_KEY` | segredo opcional | habilita `/perguntar` |
| `AI_MODEL` | variável | modelo da Responses API |
| `AI_BASE_URL` | variável | endpoint do provedor OpenAI |
| `DEFAULT_TIMEZONE` | variável | fuso padrão |
| `MAX_README_BYTES` | variável | limite do anexo, padrão 1 MB |
| `MAX_GOALS` | variável | limite de metas, padrão 300 |
| `AI_COOLDOWN_SECONDS` | variável | intervalo por usuário e servidor |

## Segurança e limites

- assinaturas Ed25519 obrigatórias e janela antirreplay de cinco minutos;
- anexos somente do CDN Discord, com extensão, MIME, tamanho e UTF-8 validados;
- respostas sem `@everyone` ou `@here`; somente o cargo explicitamente configurado pode ser mencionado;
- README tratado como conteúdo não confiável no prompt da IA;
- README, nomes de arquivos e mensagens de commit do GitHub tratados como dados não confiáveis, nunca como instruções;
- respostas do GitHub têm timeout e limites de tamanho; o Worker não baixa o diretório inteiro nem executa código do repositório;
- uma lease persistida no D1 impede gerações semanais concorrentes para o mesmo servidor;
- erros públicos não expõem segredos ou respostas internas de APIs;
- um projeto por servidor e até 300 metas por README;
- armazenamento D1 separado pelo ID do servidor;
- escrita com revisão otimista para evitar perda silenciosa em comandos concorrentes;
- cooldown da IA persistido no D1, adequado ao runtime serverless;
- respostas que terminam em até 1,5 segundo são devolvidas diretamente; as mais demoradas usam defer do Discord e são concluídas pelo webhook da interação;
- logs estruturados de recebimento, processamento e entrega ficam disponíveis no Workers Observability sem registrar tokens ou o conteúdo do README.

Se o Discord exibir **“AdoptiumWalk está pensando…”** por tempo indefinido, consulte os eventos `interaction_failed` e `interaction_delivery_failed` nos logs do Worker. O fluxo normal sempre encerra com uma resposta ou uma mensagem de erro segura.

## Backup do banco

```bash
npx wrangler d1 export adoptiumwalk --remote --output adoptiumwalk-backup.sql
```

Proteja o backup: ele contém o README e o estado dos projetos, embora não contenha tokens.
