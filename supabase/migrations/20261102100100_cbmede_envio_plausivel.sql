-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 5: checagem de plausibilidade e de frequência em enviar_estado.
--
-- O motor roda no navegador do grupo; o servidor não refaz a simulação, mas
-- recusa o que não pode ter saído de um jogo honesto:
--   - minuto à frente do relógio da sala (mais de 3 min) ou menor que o já
--     guardado na mesma rodada                                -> DADOS_INVALIDOS
--   - pontuação fora da faixa possível (0 a 3000)             -> DADOS_INVALIDOS
--   - estado maior que 256 KB (o real fica perto de 90 KB)    -> DADOS_INVALIDOS
--   - nova versão menos de 1 s depois da anterior do mesmo
--     grupo e rodada (o app envia no máximo a cada 2 s)       -> LIMITE_EXCEDIDO
-- =============================================================================

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
  -- Tolerância do minuto enviado sobre o relógio da sala (diferença de relógio e latência).
  c_tolerancia_min constant integer := 3;
  -- Faixa possível da pontuação: base 1500 + bônus sem óbito 150 + altas e atendidos no alvo.
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

  v_relogio := interno.minuto_plantao(t);
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
      -- outro envio do mesmo grupo chegou ao mesmo tempo
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
