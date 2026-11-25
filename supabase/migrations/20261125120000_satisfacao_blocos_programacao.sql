-- =============================================================================
-- Pesquisa de satisfação: blocos iguais aos temas da programação (25/11).
-- Sete temas (ITO, filas, indicadores, triagem, Lean, superlotação, liderança)
-- e duas práticas (Game do Fluxo, dinâmica de conflito). Saem colunas que não
-- correspondem à programação (só havia respostas de teste).
-- =============================================================================

alter table public.satisfacao_respostas
  drop column bloco_nir_fluxista,
  drop column bloco_segmentacao,
  drop column bloco_capacidade,
  drop column pratica_dashboard,
  drop column pratica_planilha_vsm,
  add column bloco_ito          smallint check (bloco_ito between 1 and 5),
  add column bloco_filas        smallint check (bloco_filas between 1 and 5),
  add column bloco_triagem      smallint check (bloco_triagem between 1 and 5),
  add column bloco_superlotacao smallint check (bloco_superlotacao between 1 and 5),
  add column bloco_lideranca    smallint check (bloco_lideranca between 1 and 5),
  add column pratica_conflito   smallint check (pratica_conflito between 1 and 5);

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
    bloco_ito, bloco_filas, bloco_indicadores, bloco_triagem, bloco_lean, bloco_superlotacao, bloco_lideranca,
    pratica_game_fluxo, pratica_conflito, equilibrio,
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
    (p_dados ->> 'bloco_ito')::smallint,
    (p_dados ->> 'bloco_filas')::smallint,
    (p_dados ->> 'bloco_indicadores')::smallint,
    (p_dados ->> 'bloco_triagem')::smallint,
    (p_dados ->> 'bloco_lean')::smallint,
    (p_dados ->> 'bloco_superlotacao')::smallint,
    (p_dados ->> 'bloco_lideranca')::smallint,
    (p_dados ->> 'pratica_game_fluxo')::smallint,
    (p_dados ->> 'pratica_conflito')::smallint,
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
        'bloco_ito', pg_catalog.round(avg(bloco_ito), 2),
        'bloco_filas', pg_catalog.round(avg(bloco_filas), 2),
        'bloco_indicadores', pg_catalog.round(avg(bloco_indicadores), 2),
        'bloco_triagem', pg_catalog.round(avg(bloco_triagem), 2),
        'bloco_lean', pg_catalog.round(avg(bloco_lean), 2),
        'bloco_superlotacao', pg_catalog.round(avg(bloco_superlotacao), 2),
        'bloco_lideranca', pg_catalog.round(avg(bloco_lideranca), 2),
        'pratica_game_fluxo', pg_catalog.round(avg(pratica_game_fluxo), 2),
        'pratica_conflito', pg_catalog.round(avg(pratica_conflito), 2),
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

revoke all on function public.enviar_satisfacao(jsonb), public.painel_satisfacao(text) from public, anon, authenticated;
grant execute on function public.enviar_satisfacao(jsonb), public.painel_satisfacao(text) to anon, authenticated;
