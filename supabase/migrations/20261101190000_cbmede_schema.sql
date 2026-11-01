-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 1/2: extensões, tabelas, índices, RLS, privilégios e views públicas.
--
-- Regras (docs/schema.md):
--   * Ninguém escreve direto nas tabelas: só por RPC security definer (migração 2).
--   * anon e authenticated só leem colunas liberadas, por view ou por GRANT de coluna.
--   * token_hash e estado_jogo nunca são legíveis pela chave pública.
--   * As tabelas do FLAME (rooms, teams, game_state, game_logs) NÃO são tocadas.
--
-- Rollback: supabase/rollback/cbmede_rollback.sql (apaga só o que está aqui).
-- =============================================================================

-- Extensões ------------------------------------------------------------------
-- No Supabase o schema `extensions` já existe e o pgcrypto já está instalado nele.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Schema interno: funções auxiliares das RPCs. Não é exposto pelo PostgREST
-- (só `public` é) e ninguém além do dono tem USAGE.
create schema if not exists interno;
revoke all on schema interno from public;

-- =============================================================================
-- Tabelas
-- =============================================================================

-- Facilitadores: só o painel do Supabase cadastra (ver supabase/README.md).
create table public.facilitadores (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nome       text not null check (char_length(nome) between 2 and 80),
  criado_em  timestamptz not null default now()
);
comment on table public.facilitadores is
  'Usuários do Supabase Auth autorizados a conduzir turmas. Cadastro só pelo painel.';

-- Turmas: uma por evento. `codigo` é o que os grupos digitam (ex.: CBMEDE).
create table public.turmas (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null check (codigo ~ '^[A-Z0-9]{3,16}$'),
  nome                    text not null check (char_length(nome) between 2 and 80),
  evento                  text check (evento is null or char_length(evento) <= 120),
  data                    date not null default current_date,
  facilitador_id          uuid references public.facilitadores (user_id) on delete set null,
  status                  text not null default 'aberta'
                          check (status in ('aberta', 'rodada1', 'debrief', 'rodada2', 'encerrada', 'arquivada')),
  rodada                  smallint check (rodada in (1, 2)),
  rodada_inicio           timestamptz,
  rodada_fim              timestamptz,
  pausada_em              timestamptz,
  pausa_acumulada_ms      bigint not null default 0 check (pausa_acumulada_ms >= 0),
  entrada_liberada        boolean not null default false,
  full_capacity_liberado  boolean not null default false,
  musica_mudo             boolean not null default false,
  max_grupos              smallint not null default 12 check (max_grupos between 1 and 40),
  criada_em               timestamptz not null default now(),
  atualizada_em           timestamptz not null default now(),
  -- a rodada guardada precisa bater com o status
  constraint turmas_rodada_coerente check (
       (status = 'aberta'                  and rodada is null)
    or (status in ('rodada1', 'debrief')   and rodada = 1)
    or (status in ('rodada2', 'encerrada') and rodada = 2)
    or (status = 'arquivada')
  ),
  -- só se pausa rodada em andamento
  constraint turmas_pausa_so_em_rodada check (
    pausada_em is null or status in ('rodada1', 'rodada2')
  )
);
comment on table public.turmas is
  'Uma turma por evento. Estado público pela view turmas_publicas e pela RPC estado_turma.';

-- Um único código ativo (não arquivado) por vez.
create unique index turmas_codigo_ativo_uq on public.turmas (codigo) where status <> 'arquivada';
create index turmas_codigo_criada_idx on public.turmas (codigo, criada_em desc);

-- Grupos: identificados por token (só o hash é guardado).
create table public.grupos (
  id                  uuid primary key default gen_random_uuid(),
  turma_id            uuid not null references public.turmas (id) on delete cascade,
  nome                text not null check (char_length(nome) between 2 and 30),
  nome_chave          text generated always as (lower(nome)) stored,
  cor                 text not null check (cor ~ '^#[0-9A-F]{6}$'),
  token_hash          bytea not null check (octet_length(token_hash) = 32),
  reconexao_liberada  boolean not null default false,
  rodada_entrada      smallint check (rodada_entrada in (1, 2)),
  visto_em            timestamptz,
  removido_em         timestamptz,
  criado_em           timestamptz not null default now()
);
comment on column public.grupos.token_hash is
  'sha256 do token do grupo. O token em claro só existe no computador do grupo.';

create unique index grupos_token_hash_uq on public.grupos (token_hash);
create unique index grupos_nome_ativo_uq on public.grupos (turma_id, nome_chave) where removido_em is null;
create index grupos_turma_idx on public.grupos (turma_id);

-- Placar: última pontuação de cada grupo em cada rodada (alimenta ranking e telão).
create table public.placar (
  grupo_id       uuid not null references public.grupos (id) on delete cascade,
  rodada         smallint not null check (rodada in (1, 2)),
  minuto         smallint not null check (minuto between 420 and 1140),
  pontuacao      numeric(12, 2) not null,
  metricas       jsonb not null default '{}'::jsonb check (jsonb_typeof(metricas) = 'object'),
  atualizado_em  timestamptz not null default now(),
  primary key (grupo_id, rodada)
);

-- Estado completo da simulação: só o grupo (pelo token) e o facilitador.
create table public.estado_jogo (
  grupo_id       uuid not null references public.grupos (id) on delete cascade,
  rodada         smallint not null check (rodada in (1, 2)),
  minuto         smallint not null check (minuto between 420 and 1140),
  versao         bigint not null check (versao >= 0),
  estado         jsonb not null check (jsonb_typeof(estado) = 'object'),
  atualizado_em  timestamptz not null default now(),
  primary key (grupo_id, rodada)
);

-- Série de métricas (a cada 30 min simulados). Só inclui, nunca altera.
create table public.serie_metricas (
  id         bigint generated always as identity primary key,
  grupo_id   uuid not null references public.grupos (id) on delete cascade,
  rodada     smallint not null check (rodada in (1, 2)),
  minuto     smallint not null check (minuto between 420 and 1140),
  metricas   jsonb not null check (jsonb_typeof(metricas) = 'object'),
  criado_em  timestamptz not null default now(),
  unique (grupo_id, rodada, minuto)
);

-- Eventos marcantes (óbitos, cancelamentos, surto...). Só inclui.
-- `chave` é opcional e torna o reenvio idempotente.
create table public.eventos_jogo (
  id         bigint generated always as identity primary key,
  grupo_id   uuid not null references public.grupos (id) on delete cascade,
  rodada     smallint not null check (rodada in (1, 2)),
  minuto     smallint not null check (minuto between 420 and 1140),
  tipo       text not null check (tipo ~ '^[A-Za-z0-9_.-]{1,40}$'),
  mensagem   text not null default '' check (char_length(mensagem) <= 300),
  chave      text check (chave is null or chave ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  criado_em  timestamptz not null default now(),
  unique (grupo_id, rodada, chave)
);
create index eventos_jogo_grupo_rodada_idx on public.eventos_jogo (grupo_id, rodada, minuto);

-- Relatórios congelados. Lidos só por quem tem o slug (RPC obter_relatorio).
create table public.relatorios (
  id             uuid primary key default gen_random_uuid(),
  turma_id       uuid not null unique references public.turmas (id) on delete cascade,
  slug           text not null unique check (slug ~ '^[A-Za-z0-9_-]{22,64}$'),
  dados          jsonb not null check (jsonb_typeof(dados) = 'object'),
  versao_regras  text check (versao_regras is null or char_length(versao_regras) <= 40),
  criado_em      timestamptz not null default now()
);

-- =============================================================================
-- RLS: ligado em todas. Nenhuma política de INSERT/UPDATE/DELETE.
-- =============================================================================
alter table public.facilitadores  enable row level security;
alter table public.turmas         enable row level security;
alter table public.grupos         enable row level security;
alter table public.placar         enable row level security;
alter table public.estado_jogo    enable row level security;
alter table public.serie_metricas enable row level security;
alter table public.eventos_jogo   enable row level security;
alter table public.relatorios     enable row level security;

-- =============================================================================
-- Privilégios. O Supabase dá tudo a anon/authenticated em tabela nova
-- (inclusive TRUNCATE, que o RLS não cobre). Tiramos tudo e devolvemos só
-- SELECT nas colunas liberadas.
-- =============================================================================
revoke all on table
  public.facilitadores, public.turmas, public.grupos, public.placar,
  public.estado_jogo, public.serie_metricas, public.eventos_jogo, public.relatorios
from public, anon, authenticated;

revoke all on sequence
  public.serie_metricas_id_seq, public.eventos_jogo_id_seq
from public, anon, authenticated;

-- facilitadores: o próprio facilitador lê a própria linha (o app usa para saber se é facilitador).
grant select (user_id, nome) on public.facilitadores to authenticated;
create policy facilitadores_le_o_proprio on public.facilitadores
  for select to authenticated
  using (user_id = (select auth.uid()));

-- turmas: estado é público (sem facilitador_id nem max_grupos).
grant select (id, codigo, nome, evento, data, status, rodada, rodada_inicio, rodada_fim,
              pausada_em, pausa_acumulada_ms, entrada_liberada, full_capacity_liberado,
              musica_mudo, criada_em)
  on public.turmas to anon, authenticated;
create policy turmas_estado_publico on public.turmas
  for select to anon, authenticated
  using (true);

-- grupos: nome, cor e presença são públicos. token_hash NUNCA.
grant select (id, turma_id, nome, cor, rodada_entrada, visto_em, removido_em, criado_em)
  on public.grupos to anon, authenticated;
grant select (reconexao_liberada) on public.grupos to authenticated;
create policy grupos_ativos_publicos on public.grupos
  for select to anon
  using (removido_em is null);
-- logado: os ativos; o facilitador vê também os removidos
create policy grupos_leitura_autenticado on public.grupos
  for select to authenticated
  using (
    removido_em is null
    or exists (select 1 from public.facilitadores f where f.user_id = (select auth.uid()))
  );

-- placar: público.
grant select (grupo_id, rodada, minuto, pontuacao, metricas, atualizado_em)
  on public.placar to anon, authenticated;
create policy placar_publico on public.placar
  for select to anon, authenticated
  using (true);

-- estado_jogo, serie_metricas, eventos_jogo, relatorios: só o facilitador lê direto.
-- anon não recebe GRANT nenhum: a tentativa para em "permission denied".
grant select on public.estado_jogo, public.serie_metricas, public.eventos_jogo, public.relatorios
  to authenticated;
create policy estado_jogo_facilitador on public.estado_jogo
  for select to authenticated
  using (exists (select 1 from public.facilitadores f where f.user_id = (select auth.uid())));
create policy serie_metricas_facilitador on public.serie_metricas
  for select to authenticated
  using (exists (select 1 from public.facilitadores f where f.user_id = (select auth.uid())));
create policy eventos_jogo_facilitador on public.eventos_jogo
  for select to authenticated
  using (exists (select 1 from public.facilitadores f where f.user_id = (select auth.uid())));
create policy relatorios_facilitador on public.relatorios
  for select to authenticated
  using (exists (select 1 from public.facilitadores f where f.user_id = (select auth.uid())));

-- =============================================================================
-- Views públicas (security_invoker: respeitam RLS e GRANT de coluna de quem lê).
-- =============================================================================
create view public.turmas_publicas with (security_invoker = true) as
select t.id, t.codigo, t.nome, t.evento, t.data, t.status, t.rodada,
       t.rodada_inicio, t.rodada_fim,
       (t.pausada_em is not null) as pausada, t.pausada_em, t.pausa_acumulada_ms,
       t.entrada_liberada, t.full_capacity_liberado, t.musica_mudo, t.criada_em
from public.turmas t;

create view public.grupos_publicos with (security_invoker = true) as
select g.id, g.turma_id, g.nome, g.cor,
       coalesce(g.visto_em > now() - interval '15 seconds', false) as conectado,
       g.visto_em
from public.grupos g
where g.removido_em is null;

create view public.placar_publico with (security_invoker = true) as
select p.grupo_id, g.turma_id, g.nome, g.cor, p.rodada, p.minuto, p.pontuacao,
       p.metricas, p.atualizado_em
from public.placar p
join public.grupos g on g.id = p.grupo_id
where g.removido_em is null;

revoke all on public.turmas_publicas, public.grupos_publicos, public.placar_publico
  from public, anon, authenticated;
grant select on public.turmas_publicas, public.grupos_publicos, public.placar_publico
  to anon, authenticated;

-- Não entra na publicação Realtime: o app consulta por polling (pós-mortem FLAME).
