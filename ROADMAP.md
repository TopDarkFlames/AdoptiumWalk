# AdoptiumWalk — Roadmap

## Fundação serverless

- [x] Criar o bot com Cloudflare Workers e interações HTTP do Discord
- [x] Persistir projetos, metas, lembretes e estado de sincronização no D1
- [x] Publicar o Worker com health check e observabilidade estruturada
- [x] Configurar lembretes no fuso `America/Sao_Paulo`

## Roadmap e metas

- [x] Importar arquivos `.md`, `.markdown` e `.txt` enviados pelo Discord
- [x] Extrair checkboxes Markdown como metas numeradas
- [x] Preservar números e progresso após uma atualização do roadmap
- [x] Permitir concluir e reabrir metas por slash command
- [x] Anexar o roadmap atualizado como arquivo Markdown no canal

## Integração com GitHub

- [x] Configurar um repositório público e sua branch pelo Discord
- [x] Verificar o último commit automaticamente a cada cinco minutos
- [x] Comparar mudanças desde o último SHA processado
- [x] Gerar próximas metas com Workers AI quando houver commit novo
- [x] Fazer uma revisão completa toda segunda-feira
- [x] Mostrar até três próximas metas diretamente na mensagem do Discord

## Distribuição pública

- [x] Isolar projetos, progresso e configurações pelo servidor Discord
- [x] Aceitar qualquer repositório público informado em `/repositorio configurar`
- [x] Publicar slash commands globais para servidores instaladores
- [x] Disponibilizar link público de instalação do bot
- [x] Adicionar `/ajuda` com instruções dentro do Discord

## Próximas metas — segurança

- [ ] Rotacionar credenciais expostas e documentar o procedimento de resposta
- [ ] Adicionar testes de integração executados no runtime real do Workers
- [ ] Implementar limitação de uso persistente para comandos administrativos
- [ ] Avaliar webhook assinado do GitHub para atualizações imediatas
- [ ] Adicionar suporte seguro a repositórios privados com token de escopo mínimo
- [ ] Realizar uma revisão das permissões do bot e dos canais configurados

## Qualidade e operação

- [ ] Criar ambiente separado de staging para validar migrations e deploys
- [ ] Adicionar alertas para falhas repetidas de GitHub, IA ou Discord
- [ ] Documentar restauração do D1 a partir de backup
- [ ] Cobrir o fluxo agendado completo com testes de integração
