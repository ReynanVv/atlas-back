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
13. Uma prescrição pode ser editada por completo enquanto ainda não houver sessão iniciada. Depois do primeiro início, ela fica imutável para preservar o histórico.
14. Um treino é um plano que pode conter qualquer quantidade de prescrições; cada prescrição possui seus próprios dias, duração, observações e exercícios.
15. O treinador pode definir o perfil como público ou privado. Perfis públicos podem ser encontrados e vinculados por alunos; perfis privados entram somente por convite.
16. A biblioteca de exercícios separa itens pessoais dos itens externos. A fonte externa inicial é o wger, priorizando conteúdo em pt-BR.
17. O horário sugerido não faz parte da criação de novos treinos.

## Lacunas conhecidas

- o backend dedicado ainda contém rotas e helpers herdados do ControlFinance;
- os arquivos `server.js` e `atlas-extra.js` continuam grandes e devem ser separados por domínio de forma incremental.

## Restrição de migração

Enquanto houver legado compartilhado, mudanças de schema devem ser aditivas e não destrutivas sem uma migração explicitamente planejada.

18. O template representa o treino completo, incluindo suas prescrições e exercícios. Uma prescrição isolada não é um template de treino.

19. O treinador recebe uma notificação quando um novo aluno se vincula, seja por convite ou por perfil público; vínculos já existentes não geram notificações duplicadas.

20. O treinador pode desvincular um aluno sem apagar conta, treinos, sessões, histórico ou mensagens antigas. A desvinculação encerra apenas a relação ativa e impede novas ações que dependem do vínculo até que ele seja criado novamente.
