# Atlas API

Backend oficial do Atlas.

## Stack

- Node.js 20+
- Express
- PostgreSQL
- Render

## API

- Base: `/atlas-api`
- Health: `/atlas-api/health`

## Rodar

```bash
npm install
npm run dev
```

## Verificar

```bash
npm run verify
```

## Variáveis

```env
DATABASE_URL=postgres://...
SESSION_SECRET=uma-chave-segura
ATLAS_DEMO_PASSWORD=opcional
PORT=3000
NODE_ENV=production
```

## Documentação

- `PRODUCT.md` — contratos do produto;
- `AGENTS.md` — comandos e regras para agentes;
- `docs/architecture.md` — fronteiras atuais e direção de refatoração;
- `docs/onboarding.md` — setup local;
- `docs/quality.md` — checks e estratégia de legado;
- `docs/setup.md` — adoção do toolkit.

O serviço ainda contém legado do ControlFinance por segurança da migração. A remoção desse legado deve ocorrer em mudanças separadas e verificáveis.
