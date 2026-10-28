# Qualidade

## Gate canônico

```bash
npm run verify
```

Executa:

1. invariantes locais;
2. checagem de sintaxe;
3. testes de domínio.

## Invariantes

- novos módulos JS: máximo de 350 linhas;
- `server.js` e `atlas-extra.js` estão temporariamente grandfathered;
- "intensidade" não pode reaparecer no código Atlas novo;
- regras de dias/status do treino possuem testes determinísticos.

## Estratégia de legado

O objetivo inicial é impedir dívida nova e extrair regras de negócio testáveis. A remoção do legado do ControlFinance deve ser feita em lotes pequenos, com teste e smoke test do serviço entre as extrações.
