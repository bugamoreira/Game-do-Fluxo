-- =============================================================================
-- Pesquisa de satisfação: nome opcional (25/11). Visto só pelo facilitador
-- (leads_satisfacao); o painel do telão continua sem nome e sem e-mail.
-- =============================================================================

alter table public.satisfacao_respostas add column nome text check (char_length(nome) <= 120);

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
    aplicar_30_dias, mudaria, temas_futuros, nome, email, quer_conteudos, interesse_consultoria)
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
    nullif(pg_catalog.btrim(p_dados ->> 'nome'), ''),
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
             'data', r.created_at, 'nome', r.nome, 'email', r.email, 'quer_conteudos', r.quer_conteudos,
             'interesse_consultoria', r.interesse_consultoria, 'nps', r.nps)
           order by r.created_at)
      from public.satisfacao_respostas r
     where r.turma = coalesce(nullif(pg_catalog.btrim(p_turma), ''), 'cbmede26')
       and (r.nome is not null or r.email is not null or r.interesse_consultoria or r.quer_conteudos)
  ), '[]'::jsonb);
end
$$;

revoke all on function public.enviar_satisfacao(jsonb), public.leads_satisfacao(text) from public, anon, authenticated;
grant execute on function public.enviar_satisfacao(jsonb) to anon, authenticated;
grant execute on function public.leads_satisfacao(text) to authenticated;
