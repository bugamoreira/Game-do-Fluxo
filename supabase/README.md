# Supabase — schema do CBMEDE 2026

Banco do Simulador do Plantão para o CBMEDE. Desenho e regras em [`docs/schema.md`](../docs/schema.md).
**Nada daqui foi aplicado no projeto `okmafynejwrwnmvyruwy`.** A aplicação depende de autorização do Gustavo.

As tabelas do FLAME (`rooms`, `teams`, `game_state`, `game_logs`) não são tocadas por nenhum arquivo desta pasta.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `migrations/20261101190000_cbmede_schema.sql` | pgcrypto, schema `interno`, 8 tabelas, índices, RLS, privilégios e views públicas |
| `migrations/20261101190100_cbmede_rpcs.sql` | 18 RPCs `security definer` e os `grant execute` |
| `migrations/20261101200000_cbmede_leituras_facilitador.sql` | Leituras do facilitador (`painel_turma`, `series_turma`, `eventos_turma`) e `gerar_relatorio` com facilitador e local |
| `migrations/20261102100000_cbmede_ranking_estavel.sql` | Desempate estável do ranking (ordem de entrada e nome) |
| `migrations/20261102100100_cbmede_envio_plausivel.sql` | `enviar_estado` com checagem de plausibilidade (minuto, pontuação, tamanho) e de frequência |
| `rollback/cbmede_rollback.sql` | Apaga só os objetos acima (fora de `migrations/` para o CLI não aplicar) |
| `tests/rodar-local.sh` | Sobe um Postgres temporário, aplica as migrações, roda o teste ponta a ponta, o rollback e reaplica |
| `tests/local/00_stubs_supabase.sql` | Stubs de `auth.uid()`, `auth.users`, `anon`, `authenticated` (só para o Postgres local) |
| `tests/local/10_ponta_a_ponta.sql` | 130+ verificações: entrada, reconexão, versões, transições, pausa, relógio, relatório, privilégios |
| `tests/prova-seguranca.mjs` | Ataque com a chave pública contra o projeto real, depois de aplicado |

## 1. Validar localmente (antes de aplicar)

Precisa de Postgres 16+ instalado (`/usr/lib/postgresql/*/bin`). Não toca no Supabase.

```bash
bash supabase/tests/rodar-local.sh
# termina com "TODOS OS TESTES PASSARAM" e "OK"
```

## 2. Aplicar (com autorização)

Ordem obrigatória: `20261101190000_cbmede_schema.sql`, `20261101190100_cbmede_rpcs.sql` e `20261101200000_cbmede_leituras_facilitador.sql`.

**Opção A — painel (mais simples):** Supabase → SQL Editor → New query → escrever `begin;`, colar o conteúdo do primeiro arquivo, terminar com `commit;` → Run. Repetir com o segundo e com o terceiro. Com o `begin/commit`, um erro no meio desfaz o arquivo inteiro. Se algo der errado depois do primeiro arquivo, rode o rollback (seção 6) e recomece.

**Opção B — CLI:**

```bash
supabase link --project-ref okmafynejwrwnmvyruwy
supabase db push        # aplica as migrações pendentes desta pasta, em ordem
```

Depois de aplicar, no painel: **Advisors → Security Advisor** deve ficar sem erro para as tabelas novas.

## 3. Criar o usuário do facilitador

1. **Authentication → Users → Add user → Create new user**: e-mail e senha forte do facilitador, marcar *Auto Confirm User*.
2. Copiar o *User UID* criado.
3. **SQL Editor**:

   ```sql
   insert into public.facilitadores (user_id, nome)
   values ('COLE-AQUI-O-USER-UID', 'Gustavo');
   ```

4. **Authentication → Sign In / Providers**: desligar *Allow new users to sign up*. O facilitador é criado à mão; ninguém precisa se cadastrar sozinho. (Mesmo com cadastro aberto, uma conta nova não comanda turma, porque não está em `facilitadores`; mas cadastro fechado elimina a conta-robô.)
5. A senha antiga do FLAME já saiu do código (pós-mortem) e não deve ser reaproveitada.

## 4. Criar a turma do evento

Pelo painel do facilitador (`/instrutor.html`), ou à mão no SQL Editor fingindo ser o facilitador:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', 'COLE-AQUI-O-USER-UID', 'role', 'authenticated')::text, true);
select public.abrir_turma('CBMEDE', 'CBMEDE 2026 — Simulador do Plantão', 'CBMEDE 2026', date '2026-11-20');
commit;
```

Se já houver uma turma `CBMEDE` com grupos, `abrir_turma` recusa com `CODIGO_EM_USO`; passe `p_substituir => true` para arquivar a anterior (nada é apagado).

Para a prova de segurança, crie também uma turma de teste (ex.: `PROVA`) do mesmo jeito.

## 5. Rodar a prova de segurança

Depois de aplicar, com a chave **pública** (Project Settings → API Keys → `anon`/publishable). Nunca com a `service_role`.

```bash
SUPABASE_URL=https://okmafynejwrwnmvyruwy.supabase.co \
SUPABASE_ANON_KEY=eyJ... \
CODIGO_TESTE=PROVA \
node supabase/tests/prova-seguranca.mjs
```

Imprime a tabela PASSOU/FALHOU e sai com código 1 se alguma tentativa indevida der certo. Guardar a saída em `docs/` (etapa B4, D3). Depois, arquivar a turma `PROVA` (abrir outra com `p_substituir` ou deixar como está: ela não aparece para quem digita `CBMEDE`).

## 6. Reverter

```bash
# painel: colar supabase/rollback/cbmede_rollback.sql no SQL Editor e rodar
# ou:
psql "$DATABASE_URL" -1 -f supabase/rollback/cbmede_rollback.sql
```

Apaga as 21 RPCs, o schema `interno`, as 3 views e as 8 tabelas novas, **com os dados do CBMEDE**. Exporte antes o que importar (ex.: `relatorios`). Não toca no FLAME, no pgcrypto nem no Auth. Se aplicou pelo CLI, apague também as linhas de `supabase_migrations.schema_migrations` (versões `20261101190000`, `20261101190100` e `20261101200000`) para o CLI aceitar reaplicar.

## Como o app chama

- Leituras públicas: RPC `estado_turma` (a cada 1 s), `ranking`; ou as views `turmas_publicas`, `grupos_publicos`, `placar_publico`.
- Parâmetros das RPCs têm prefixo `p_` (ex.: `supabase.rpc('entrar_grupo', { p_codigo, p_nome, p_token })`).
- Erro: `error.message` traz o código estável (`TOKEN_INVALIDO`...), `error.details` a frase para a tela. Tabela em `docs/schema.md`.
- Nada usa Realtime: as tabelas novas não entram na publicação.
