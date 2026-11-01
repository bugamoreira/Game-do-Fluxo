-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 8: o Plantão Lean só começa 30 s depois de encerrar o Travado.
--
-- Nos 30 s depois de "Encerrar" o servidor ainda aceita o último placar da
-- rodada 1 (interno.aceita_rodada). Iniciar a rodada 2 nesse intervalo fazia
-- esses envios caírem em RODADA_INVALIDA. Agora debrief -> rodada2 antes de
-- rodada_fim + 30 s é recusado com TRANSICAO_INVALIDA e a espera na mensagem;
-- o painel mostra a contagem.
-- =============================================================================

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

  -- O Lean só começa depois da tolerância de 30 s do Travado: os últimos
  -- placares da rodada 1 ainda podem estar chegando (interno.aceita_rodada).
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
           atualizada_em = now()
     where id = t.id
    returning * into t;
  else
    -- encerrar: fecha a pausa em curso e congela o relógio
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
  end if;

  return interno.json_turma(t, true);
end
$$;
