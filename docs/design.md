# Contratos de API e experiência

Este repositório não possui interface visual própria. O equivalente à direção de design aqui são contratos previsíveis para o frontend.

- erros devem retornar mensagem clara em `error`;
- endpoints protegidos exigem autenticação;
- ações treinador-aluno exigem vínculo e ownership;
- listas devem retornar apenas dados autorizados;
- não expor segredos, hashes ou dados internos desnecessários;
- "intensidade" não deve aparecer em DTOs do Atlas;
- mudanças incompatíveis de payload precisam ser tratadas como alteração de contrato.
