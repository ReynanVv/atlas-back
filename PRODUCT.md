# Atlas — Produto e escopo do MVP

Este repositório implementa a API do Atlas. As regras abaixo são contratos de produto e não devem ser alteradas silenciosamente.

## Atores

- **Aluno**
- **Treinador**
- **Usuário com múltiplos perfis**

## Regras do MVP

1. Convite é feito por link; o treinador não cadastra e-mail do aluno.
2. Treinador pode ter zero ou mais alunos.
3. Aluno pode ter um ou mais treinadores.
4. Disponibilidade pertence ao aluno.
5. Prescrição só aceita dias disponíveis do aluno.
6. Treinos podem ser criados do zero ou por template.
7. Exercícios usam séries, repetições, carga sugerida, descanso, observação e vídeo.
8. Execução registra o realizado por série e sessão.
9. Histórico e evolução derivam de sessões concluídas.
10. Mensagens exigem vínculo treinador-aluno.
11. Notificações cobrem prescrição, mensagem e treino do dia.
12. **Intensidade não faz parte do domínio do Atlas.**

## Lacunas conhecidas

- edição de treino prescrito ainda não está completa;
- o backend dedicado ainda contém rotas e helpers herdados do ControlFinance;
- os arquivos `server.js` e `atlas-extra.js` continuam grandes e devem ser separados por domínio de forma incremental.

## Restrição de migração

Enquanto houver legado compartilhado, mudanças de schema devem ser aditivas e não destrutivas sem uma migração explicitamente planejada.
