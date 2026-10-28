# Arquitetura do backend

## Estado atual

O serviço dedicado do Atlas foi separado do repositório ControlFinance sem remover imediatamente o legado compartilhado. Essa escolha preservou dados e reduziu risco de migração, mas deixou `server.js` e `atlas-extra.js` maiores do que o desejável.

## Fronteiras atuais

- `server.js`: bootstrap Express, conexão PostgreSQL e rotas herdadas/Atlas.
- `atlas-extra.js`: schemas e rotas adicionais do Atlas.
- `src/domain/workouts.js`: regras puras de agenda/status de treino.
- PostgreSQL: tabelas `atlas_*` no banco compartilhado durante a migração.

## Direção de refatoração

Extrair por domínio, preservando contratos HTTP:

- auth/profiles;
- invitations;
- availability;
- students;
- exercises;
- templates;
- workouts;
- sessions;
- progress;
- messages;
- notifications;
- db.

Queries devem continuar parametrizadas. Regras puras não devem depender de Express ou PostgreSQL.

## Migração

A limpeza do legado do ControlFinance deve ser feita depois de cobertura suficiente, sem apagar tabelas ou dados `atlas_*` e sem trocar `DATABASE_URL` implicitamente.
