# Onboarding de desenvolvimento

## Pré-requisitos

- Node.js 20+
- npm
- PostgreSQL acessível

## Configuração

```env
DATABASE_URL=postgres://...
SESSION_SECRET=...
ATLAS_DEMO_PASSWORD=...
PORT=3000
NODE_ENV=development
```

## Executar

```bash
npm install
npm run dev
```

## Verificar

```bash
npm run verify
```

## Smoke test

Após subir o serviço:

```text
GET /atlas-api/health
```

Não use rotas de reset em ambiente com dados reais.
