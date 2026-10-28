# Atlas Backend

## Produto e stack

- Produto e regras: `PRODUCT.md`.
- Arquitetura: `docs/architecture.md`.
- Node.js 20+ + Express + PostgreSQL.
- Serviço oficial: `atlas-api` no Render.

## Comandos

- Instalar: `npm install`
- Dev: `npm run dev`
- Testes: `npm test`
- Sintaxe: `npm run check`
- Quality: `npm run quality`
- Verificação: `npm run verify`

## Acordos

- Preserve ownership e vínculo treinador-aluno em todas as rotas.
- SQL deve continuar parametrizado.
- "Intensidade" foi removida do produto.
- Não execute reset destrutivo em produção.
- Novos módulos JS devem ficar abaixo de 350 linhas; `server.js` e `atlas-extra.js` são legado temporário.
- Regras puras de domínio devem preferir `src/domain/` e testes determinísticos.
- Refatore por responsabilidade e mantenha contratos HTTP existentes.
- Não remova legado do ControlFinance sem cobertura e plano de migração.
- Rode `npm run verify` em mudanças relevantes.
