# Roteiro de publicação — passo a passo com o Gustavo

> Feito junto, no dia da publicação. Nada aqui é executado sem autorização expressa.

## Antes (no computador do Gustavo)

1. Ensaio local completo com o banco de ensaio (`npm run backend:local` e `npm run dev:local`, instruções em `scripts/backend-local/README.md`). O Gustavo joga como facilitador e como um grupo.
2. Aprovação do Portão 4 (ensaio aprovado).

## Supabase (projeto `okmafynejwrwnmvyruwy`)

1. **Tabelas antigas do FLAME** (`rooms`, `teams`, `game_state`, `game_logs`): conferir e trancar a escrita pela chave pública.
   ```sql
   select relname, relrowsecurity from pg_class where relname in ('rooms','teams','game_state','game_logs');
   select tablename, policyname, cmd, roles, qual from pg_policies where tablename in ('rooms','teams','game_state','game_logs');
   revoke insert, update, delete, truncate on public.rooms, public.teams, public.game_state, public.game_logs from anon, authenticated;
   ```
2. **Migrações**, em ordem (lista em `supabase/README.md`), e depois o Security Advisor.
3. **Cadastro aberto**: Authentication → desligar "Allow new users to sign up". Conferir com uma tentativa de cadastro com senha forte (a resposta deve ser `signup_disabled`).
4. **Usuário do facilitador**: Authentication → Users → Add user (Auto Confirm), senha forte e única (nunca a do FLAME), e `insert into public.facilitadores (user_id, nome) values ('<UID>', 'Gustavo');`.
5. **Teto de gastos**: Organization → Billing → Spend cap.
6. **Prova de segurança contra o projeto real**: `supabase/tests/prova-seguranca.mjs` com a chave pública e uma turma de teste; guardar a saída em `docs/`.

## Netlify

1. Ligar o site `plantaocbmede` ao repositório GitHub (branch `main`), com build `npm run build` e pasta `dist`.
2. Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (chave anon/publishable; nunca a service_role; nenhuma outra `VITE_*` com segredo).
3. Merge no `main` e publicação única.
4. Conferir cabeçalhos (`curl -sI https://plantaocbmede.netlify.app/`), abrir o telão, clicar em "Ativar som" e confirmar que a música continua sem erro de CSP no console.
5. Teste de fumaça no endereço final: abrir turma de teste, entrar com dois computadores, iniciar e encerrar uma rodada, gerar relatório.
6. Decidir sobre o site antigo `plantaoflame.netlify.app` (tirar do ar ou manter congelado).

## GitHub

1. Ligar Secret scanning e Push protection no repositório público.
2. A senha antiga do FLAME continua no histórico: trocá-la em qualquer lugar onde tenha sido reaproveitada.

## No dia da aula

1. Abrir a turma `CBMEDE` com antecedência; conferir o código de acesso no telão.
2. Testar o som do telão e de um computador de grupo.
3. Ter o 5G como reserva.
