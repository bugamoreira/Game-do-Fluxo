-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 10: dados atrasados de uma rodada que acabou (ensaio E2).
--
-- Grupos com o computador lento mandavam registrar_serie, registrar_eventos e
-- enviar_estado da rodada 1 já no debrief ou na rodada 2 e recebiam
-- RODADA_INVALIDA: a série e os eventos se perdiam e o console enchia.
--
-- Agora o servidor aceita dados de uma rodada que acabou por 5 minutos depois
-- do fim dela:
--   - rodada 1 durante debrief, rodada2 e encerrada (até rodada1_fim + 5 min);
--   - rodada 2 durante encerrada (até rodada_fim + 5 min).
-- As checagens de plausibilidade continuam: minuto 420–1140 e no máximo 3 min
-- à frente do relógio da rodada (para a rodada 1 já encerrada, o minuto em que
-- ela parou), pontuação 0–3000, estado até 256 KB, minuto que não regride.
--
-- Como iniciar a rodada 2 reescreve rodada_inicio e rodada_fim, o fim da
-- rodada 1 passa a ficar guardado em rodada1_fim e rodada1_minuto_fim.
-- =============================================================================

alter table public.turmas
  add column if not exists rodada1_fim timestamptz,
  add column if not exists rodada1_minuto_fim integer
    check (rodada1_minuto_fim is null or rodada1_minuto_fim between 420 and 1140);

-- Turmas já no debrief: o fim da rodada 1 é o rodada_fim atual.
update public.turmas t
   set rodada1_fim = t.rodada_fim,
       rodada1_minuto_fim = interno.minuto_plantao(t)
 where t.status = 'debrief' and t.rodada = 1 and t.rodada_fim is not null and t.rodada1_fim is null;

-- Janela para dados atrasados de uma rodada que acabou.
create or replace function interno.aceita_rodada(t public.turmas, p_rodada integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(case
    when t.rodada is null or p_rodada is null then false
    -- rodada em andamento
    when t.status in ('rodada1', 'rodada2') and t.rodada = p_rodada then true
    -- rodada 1 que acabou: no debrief o fim dela é rodada_fim; depois, rodada1_fim
    when p_rodada = 1 and t.status = 'debrief' then t.rodada_fim > now() - interval '5 minutes'
    when p_rodada = 1 and t.status in ('rodada2', 'encerrada') then t.rodada1_fim > now() - interval '5 minutes'
    -- rodada 2 que acabou
    when p_rodada = 2 and t.status = 'encerrada' then t.rodada_fim > now() - interval '5 minutes'
    else false
  end, false)
$$;

-- Relógio da rodada informada: o da sala, se for a atual; o minuto em que a
-- rodada 1 parou, se ela já acabou e a turma está na rodada 2.
create or replace function interno.minuto_da_rodada(t public.turmas, p_rodada integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_rodada = t.rodada then interno.minuto_plantao(t)
    when p_rodada = 1 then t.rodada1_minuto_fim
    else null
  end
$$;

revoke all on function interno.aceita_rodada(public.turmas, integer) from public, anon, authenticated;
revoke all on function interno.minuto_da_rodada(public.turmas, integer) from public, anon, authenticated;

-- enviar_estado: igual à migração 5, com o relógio da rodada informada.
create or replace function public.enviar_estado(
  p_token     text,
  p_rodada    integer,
  p_minuto    integer,
  p_versao    bigint,
  p_estado    jsonb,
  p_pontuacao numeric,
  p_metricas  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_tolerancia_min constant integer := 3;
  c_pontuacao_max  constant numeric := 3000;
  c_estado_max     constant integer := 262144;
  g        public.grupos;
  t        public.turmas;
  atual    public.estado_jogo;
  v_relogio integer;
begin
  g := interno.grupo_do_token(p_token);
  select * into t from public.turmas where id = g.turma_id;

  if p_rodada is null or p_rodada not in (1, 2)
     or p_minuto is null or p_minuto not between 420 and 1140
     or p_versao is null or p_versao < 0
     or p_estado is null or pg_catalog.jsonb_typeof(p_estado) <> 'object'
     or pg_catalog.octet_length(p_estado::text) > c_estado_max
     or p_pontuacao is null or p_pontuacao < 0 or p_pontuacao > c_pontuacao_max
     or (p_metricas is not null and (pg_catalog.jsonb_typeof(p_metricas) <> 'object'
                                     or pg_catalog.octet_length(p_metricas::text) > 16384)) then
    perform interno.erro('DADOS_INVALIDOS', 'Dados do jogo fora do formato esperado.');
  end if;

  if not interno.aceita_rodada(t, p_rodada) then
    perform interno.erro('RODADA_INVALIDA', 'Esta rodada não está em andamento.');
  end if;

  v_relogio := interno.minuto_da_rodada(t, p_rodada);
  if v_relogio is null or p_minuto > v_relogio + c_tolerancia_min then
    perform interno.erro('DADOS_INVALIDOS', 'O horário do jogo está à frente do relógio da sala.');
  end if;

  select * into atual
    from public.estado_jogo e
   where e.grupo_id = g.id and e.rodada = p_rodada
   for update;

  if found then
    if atual.versao >= p_versao then
      perform interno.erro('VERSAO_ANTIGA', 'O servidor já tem uma versão mais nova deste jogo.');
    end if;
    if atual.atualizado_em > now() - interval '1 second' then
      perform interno.erro('LIMITE_EXCEDIDO', 'Envios muito próximos. O jogo tenta de novo em instantes.');
    end if;
    if p_minuto < atual.minuto then
      perform interno.erro('DADOS_INVALIDOS', 'O horário do jogo voltou para trás.');
    end if;
    update public.estado_jogo
       set minuto = p_minuto, versao = p_versao, estado = p_estado, atualizado_em = now()
     where grupo_id = g.id and rodada = p_rodada;
  else
    insert into public.estado_jogo (grupo_id, rodada, minuto, versao, estado, atualizado_em)
    values (g.id, p_rodada, p_minuto, p_versao, p_estado, now())
    on conflict (grupo_id, rodada) do nothing;
    if not found then
      perform interno.erro('LIMITE_EXCEDIDO', 'Envios muito próximos. O jogo tenta de novo em instantes.');
    end if;
  end if;

  insert into public.placar as p (grupo_id, rodada, minuto, pontuacao, metricas, atualizado_em)
  values (g.id, p_rodada, p_minuto, p_pontuacao, coalesce(p_metricas, '{}'::jsonb), now())
  on conflict (grupo_id, rodada) do update
     set minuto = excluded.minuto,
         pontuacao = excluded.pontuacao,
         metricas = excluded.metricas,
         atualizado_em = excluded.atualizado_em;

  update public.grupos set visto_em = now() where id = g.id;

  return pg_catalog.jsonb_build_object('versao', p_versao, 'hora_servidor', now());
end
$$;

-- mudar_status: igual à migração 8, guardando o fim da rodada 1.
create or replace function public.mudar_status(p_turma_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.turmas;
begin
  perform interno.exigir_facilitador();
  t := interno.turma_travada(p_turma_id);

  if p_status is null or (t.status, p_status) not in (
       ('aberta', 'rodada1'), ('rodada1', 'debrief'),
       ('debrief', 'rodada2'), ('rodada2', 'encerrada')) then
    perform interno.erro('TRANSICAO_INVALIDA',
      pg_catalog.format('Não é possível ir de "%s" para "%s".', t.status, coalesce(p_status, '?')));
  end if;

  if t.status = 'debrief' and p_status = 'rodada2'
     and t.rodada_fim is not null and t.rodada_fim > now() - interval '30 seconds' then
    perform interno.erro('TRANSICAO_INVALIDA',
      pg_catalog.format('Aguarde %s s para iniciar o Plantão Lean: os últimos placares do Travado ainda estão chegando.',
        greatest(1, pg_catalog.ceil(extract(epoch from (t.rodada_fim + interval '30 seconds' - now())))::integer)));
  end if;

  if p_status in ('rodada1', 'rodada2') then
    update public.turmas
       set status = p_status,
           rodada = case p_status when 'rodada1' then 1 else 2 end,
           rodada_inicio = now(),
           rodada_fim = null,
           pausada_em = null,
           pausa_acumulada_ms = 0,
           rodada1_fim = case p_status when 'rodada1' then null else rodada1_fim end,
           rodada1_minuto_fim = case p_status when 'rodada1' then null else rodada1_minuto_fim end,
           atualizada_em = now()
     where id = t.id
    returning * into t;
  else
    update public.turmas
       set status = p_status,
           pausa_acumulada_ms = pausa_acumulada_ms
             + case when pausada_em is null then 0
                    else pg_catalog.floor(extract(epoch from (now() - pausada_em)) * 1000)::bigint end,
           pausada_em = null,
           rodada_fim = now(),
           atualizada_em = now()
     where id = t.id
    returning * into t;
    if t.status = 'debrief' then
      -- O fim da rodada 1 sobrevive ao início da rodada 2 (dados atrasados).
      update public.turmas
         set rodada1_fim = t.rodada_fim,
             rodada1_minuto_fim = interno.minuto_plantao(t)
       where id = t.id
      returning * into t;
    end if;
  end if;

  return interno.json_turma(t, true);
end
$$;
