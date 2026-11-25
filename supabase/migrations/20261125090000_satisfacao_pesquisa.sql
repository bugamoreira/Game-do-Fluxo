-- =============================================================================
-- Pesquisa de satisfação do Curso de Gestão do ED Leaders (CBMEDE 2026)
--
-- Objetos novos; nenhuma tabela do jogo é alterada.
--   satisfacao_respostas         respostas; ninguém lê nem escreve direto
--   enviar_satisfacao(jsonb)     anon: grava uma resposta validada
--   painel_satisfacao(turma)     anon: só agregados e comentários, sem e-mail
--   leads_satisfacao(turma)      facilitador logado: e-mails e interesse
-- =============================================================================

create table public.satisfacao_respostas (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz not null default now(),
  turma                 text not null default 'cbmede26' check (turma ~ '^[a-z0-9]{2,20}$'),
  nps                   smallint not null check (nps between 0 and 10),
  nps_motivo            text check (char_length(nps_motivo) <= 1000),
  aplicabilidade        smallint check (aplicabilidade between 1 and 5),
  profundidade          text check (profundidade in ('basico', 'adequado', 'avancado')),
  bloco_nir_fluxista    smallint check (bloco_nir_fluxista between 1 and 5),
  bloco_segmentacao     smallint check (bloco_segmentacao between 1 and 5),
  bloco_indicadores     smallint check (bloco_indicadores between 1 and 5),
  bloco_capacidade      smallint check (bloco_capacidade between 1 and 5),
  bloco_lean            smallint check (bloco_lean between 1 and 5),
  pratica_dashboard     smallint check (pratica_dashboard between 1 and 5),
  pratica_planilha_vsm  smallint check (pratica_planilha_vsm between 1 and 5),
  pratica_game_fluxo    smallint check (pratica_game_fluxo between 1 and 5),
  equilibrio            text check (equilibrio in ('teoria_demais', 'equilibrado', 'pratica_demais')),
  gustavo_dominio       smallint check (gustavo_dominio between 1 and 5),
  gustavo_clareza       smallint check (gustavo_clareza between 1 and 5),
  gustavo_interacao     smallint check (gustavo_interacao between 1 and 5),
  juliana_dominio       smallint check (juliana_dominio between 1 and 5),
  juliana_clareza       smallint check (juliana_clareza between 1 and 5),
  juliana_interacao     smallint check (juliana_interacao between 1 and 5),
  log_sala              smallint check (log_sala between 1 and 5),
  log_duracao           smallint check (log_duracao between 1 and 5),
  log_ritmo             smallint check (log_ritmo between 1 and 5),
  log_intervalos        smallint check (log_intervalos between 1 and 5),
  aplicar_30_dias       text check (char_length(aplicar_30_dias) <= 1000),
  mudaria               text check (char_length(mudaria) <= 1000),
  temas_futuros         text check (char_length(temas_futuros) <= 1000),
  email                 text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  quer_conteudos        boolean not null default false,
  interesse_consultoria boolean not null default false
);
create index satisfacao_respostas_turma_idx on public.satisfacao_respostas (turma, created_at);

alter table public.satisfacao_respostas enable row level security;
revoke all on table public.satisfacao_respostas from public, anon, authenticated;
revoke all on sequence public.satisfacao_respostas_id_seq from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- enviar_satisfacao: grava uma resposta. Só as chaves conhecidas são lidas;
-- faixas e formatos são conferidos pelas restrições da tabela.
-- Teto de 600 respostas por turma (contra envio em massa).
-- -----------------------------------------------------------------------------
create or replace function public.enviar_satisfacao(p_dados jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_turma text;
  v_id    bigint;
  v_email text;
begin
  if p_dados is null or pg_catalog.jsonb_typeof(p_dados) <> 'object'
     or pg_catalog.octet_length(p_dados::text) > 20000 then
    raise exception using errcode = 'CB008', message = 'DADOS_INVALIDOS', detail = 'Resposta fora do formato esperado.';
  end if;
  v_turma := coalesce(nullif(pg_catalog.btrim(p_dados ->> 'turma'), ''), 'cbmede26');
  if (select count(*) from public.satisfacao_respostas where turma = v_turma) >= 600 then
    raise exception using errcode = 'CB013', message = 'LIMITE_EXCEDIDO', detail = 'Limite de respostas atingido.';
  end if;
  v_email := nullif(pg_catalog.lower(pg_catalog.btrim(p_dados ->> 'email')), '');

  insert into public.satisfacao_respostas (
    turma, nps, nps_motivo, aplicabilidade, profundidade,
    bloco_nir_fluxista, bloco_segmentacao, bloco_indicadores, bloco_capacidade, bloco_lean,
    pratica_dashboard, pratica_planilha_vsm, pratica_game_fluxo, equilibrio,
    gustavo_dominio, gustavo_clareza, gustavo_interacao,
    juliana_dominio, juliana_clareza, juliana_interacao,
    log_sala, log_duracao, log_ritmo, log_intervalos,
    aplicar_30_dias, mudaria, temas_futuros, email, quer_conteudos, interesse_consultoria)
  values (
    v_turma,
    (p_dados ->> 'nps')::smallint,
    nullif(pg_catalog.btrim(p_dados ->> 'nps_motivo'), ''),
    (p_dados ->> 'aplicabilidade')::smallint,
    nullif(p_dados ->> 'profundidade', ''),
    (p_dados ->> 'bloco_nir_fluxista')::smallint,
    (p_dados ->> 'bloco_segmentacao')::smallint,
    (p_dados ->> 'bloco_indicadores')::smallint,
    (p_dados ->> 'bloco_capacidade')::smallint,
    (p_dados ->> 'bloco_lean')::smallint,
    (p_dados ->> 'pratica_dashboard')::smallint,
    (p_dados ->> 'pratica_planilha_vsm')::smallint,
    (p_dados ->> 'pratica_game_fluxo')::smallint,
    nullif(p_dados ->> 'equilibrio', ''),
    (p_dados ->> 'gustavo_dominio')::smallint,
    (p_dados ->> 'gustavo_clareza')::smallint,
    (p_dados ->> 'gustavo_interacao')::smallint,
    (p_dados ->> 'juliana_dominio')::smallint,
    (p_dados ->> 'juliana_clareza')::smallint,
    (p_dados ->> 'juliana_interacao')::smallint,
    (p_dados ->> 'log_sala')::smallint,
    (p_dados ->> 'log_duracao')::smallint,
    (p_dados ->> 'log_ritmo')::smallint,
    (p_dados ->> 'log_intervalos')::smallint,
    nullif(pg_catalog.btrim(p_dados ->> 'aplicar_30_dias'), ''),
    nullif(pg_catalog.btrim(p_dados ->> 'mudaria'), ''),
    nullif(pg_catalog.btrim(p_dados ->> 'temas_futuros'), ''),
    v_email,
    coalesce((p_dados ->> 'quer_conteudos')::boolean, false),
    coalesce((p_dados ->> 'interesse_consultoria')::boolean, false))
  returning id into v_id;

  return pg_catalog.jsonb_build_object('ok', true);
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation then
    raise exception using errcode = 'CB008', message = 'DADOS_INVALIDOS', detail = 'Alguma resposta está fora do formato esperado.';
end
$$;

-- -----------------------------------------------------------------------------
-- painel_satisfacao: agregados para o telão. Nunca devolve e-mail nem
-- interesse em consultoria. Comentários: os 80 mais recentes de cada campo.
-- -----------------------------------------------------------------------------
create or replace function public.painel_satisfacao(p_turma text default 'cbmede26')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select * from public.satisfacao_respostas
     where turma = coalesce(nullif(pg_catalog.btrim(p_turma), ''), 'cbmede26')
  ),
  nps as (
    select count(*) as n,
           count(*) filter (where nps >= 9) as promotores,
           count(*) filter (where nps between 7 and 8) as neutros,
           count(*) filter (where nps <= 6) as detratores
      from r
  )
  select pg_catalog.jsonb_build_object(
    'n', nps.n,
    'atualizado_em', now(),
    'nps', case when nps.n = 0 then null
                else pg_catalog.round(100.0 * (nps.promotores - nps.detratores) / nps.n) end,
    'promotores', nps.promotores,
    'neutros', nps.neutros,
    'detratores', nps.detratores,
    'distribuicao_nps', (select coalesce(pg_catalog.jsonb_agg(c order by v), '[]'::jsonb)
                           from (select v, (select count(*) from r where r.nps = v) as c
                                   from pg_catalog.generate_series(0, 10) as v) d),
    'medias', (select pg_catalog.jsonb_build_object(
        'aplicabilidade', pg_catalog.round(avg(aplicabilidade), 2),
        'bloco_nir_fluxista', pg_catalog.round(avg(bloco_nir_fluxista), 2),
        'bloco_segmentacao', pg_catalog.round(avg(bloco_segmentacao), 2),
        'bloco_indicadores', pg_catalog.round(avg(bloco_indicadores), 2),
        'bloco_capacidade', pg_catalog.round(avg(bloco_capacidade), 2),
        'bloco_lean', pg_catalog.round(avg(bloco_lean), 2),
        'pratica_dashboard', pg_catalog.round(avg(pratica_dashboard), 2),
        'pratica_planilha_vsm', pg_catalog.round(avg(pratica_planilha_vsm), 2),
        'pratica_game_fluxo', pg_catalog.round(avg(pratica_game_fluxo), 2),
        'gustavo_dominio', pg_catalog.round(avg(gustavo_dominio), 2),
        'gustavo_clareza', pg_catalog.round(avg(gustavo_clareza), 2),
        'gustavo_interacao', pg_catalog.round(avg(gustavo_interacao), 2),
        'juliana_dominio', pg_catalog.round(avg(juliana_dominio), 2),
        'juliana_clareza', pg_catalog.round(avg(juliana_clareza), 2),
        'juliana_interacao', pg_catalog.round(avg(juliana_interacao), 2),
        'log_sala', pg_catalog.round(avg(log_sala), 2),
        'log_duracao', pg_catalog.round(avg(log_duracao), 2),
        'log_ritmo', pg_catalog.round(avg(log_ritmo), 2),
        'log_intervalos', pg_catalog.round(avg(log_intervalos), 2)) from r),
    'profundidade', (select pg_catalog.jsonb_build_object(
        'basico', count(*) filter (where profundidade = 'basico'),
        'adequado', count(*) filter (where profundidade = 'adequado'),
        'avancado', count(*) filter (where profundidade = 'avancado')) from r),
    'equilibrio', (select pg_catalog.jsonb_build_object(
        'teoria_demais', count(*) filter (where equilibrio = 'teoria_demais'),
        'equilibrado', count(*) filter (where equilibrio = 'equilibrado'),
        'pratica_demais', count(*) filter (where equilibrio = 'pratica_demais')) from r),
    'aplicar_30_dias', (select coalesce(pg_catalog.jsonb_agg(t), '[]'::jsonb) from
        (select aplicar_30_dias as t from r where aplicar_30_dias is not null order by created_at desc limit 80) x),
    'nps_motivo', (select coalesce(pg_catalog.jsonb_agg(t), '[]'::jsonb) from
        (select nps_motivo as t from r where nps_motivo is not null order by created_at desc limit 80) x),
    'mudaria', (select coalesce(pg_catalog.jsonb_agg(t), '[]'::jsonb) from
        (select mudaria as t from r where mudaria is not null order by created_at desc limit 80) x),
    'temas_futuros', (select coalesce(pg_catalog.jsonb_agg(t), '[]'::jsonb) from
        (select temas_futuros as t from r where temas_futuros is not null order by created_at desc limit 80) x)
  )
  from nps
$$;

-- -----------------------------------------------------------------------------
-- leads_satisfacao: só facilitador logado e cadastrado.
-- -----------------------------------------------------------------------------
create or replace function public.leads_satisfacao(p_turma text default 'cbmede26')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.facilitadores f where f.user_id = auth.uid()) then
    raise exception using errcode = 'CB006', message = 'NAO_AUTORIZADO', detail = 'Entre com a conta do facilitador.';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'data', r.created_at, 'email', r.email, 'quer_conteudos', r.quer_conteudos,
             'interesse_consultoria', r.interesse_consultoria, 'nps', r.nps)
           order by r.created_at)
      from public.satisfacao_respostas r
     where r.turma = coalesce(nullif(pg_catalog.btrim(p_turma), ''), 'cbmede26')
       and (r.email is not null or r.interesse_consultoria or r.quer_conteudos)
  ), '[]'::jsonb);
end
$$;

revoke all on function public.enviar_satisfacao(jsonb), public.painel_satisfacao(text), public.leads_satisfacao(text)
  from public, anon, authenticated;
grant execute on function public.enviar_satisfacao(jsonb), public.painel_satisfacao(text) to anon, authenticated;
grant execute on function public.leads_satisfacao(text) to authenticated;
