# Registro de setup

## Adoção do Vibe Coding Toolkit

Modo: **projeto existente**, preservando Express, PostgreSQL, Render e contratos atuais.

### Aplicado

- documentação de produto e arquitetura;
- `AGENTS.md` e `CLAUDE.md`;
- quality gate;
- CI no GitHub;
- `node --check` para sintaxe;
- testes nativos com `node:test`;
- extração de regra de agenda/status para `src/domain/workouts.js`.

### Não aplicado de propósito

- troca de framework/ORM;
- migrações destrutivas;
- formatter global;
- hooks de commit/push;
- ferramentas externas como requisito para rodar o projeto.

### Pendências

- separar módulos de domínio/rotas de `atlas-extra.js`;
- remover ControlFinance do serviço dedicado após cobertura suficiente;
- ampliar testes de autorização/ownership;
- revisar segurança de sessão, convites e upload de vídeo;
- tornar CORS e URL de convite configuráveis por ambiente.
