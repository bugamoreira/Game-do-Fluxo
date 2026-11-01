-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 3: leituras do facilitador e relatório com facilitador e local.
--
--   painel_turma(p_turma_id)                       estado da turma na visão do facilitador
--   series_turma(p_turma_id, p_rodada?)            séries de métricas de todos os grupos
--   eventos_turma(p_turma_id, p_desde_minuto?, p_rodada?, p_limite?)  eventos recentes
--   gerar_relatorio(p_turma_id, p_versao_regras?, p_local?)  grava também
--     dados.facilitador (facilitadores.nome) e dados.local
--
-- Mesmas regras das anteriores: security definer, search_path vazio, nomes
-- qualificados, EXECUTE só para authenticated e auth.uid() conferido em
-- public.facilitadores (interno.exigir_facilitador). Grupos removidos ficam
-- fora das séries e dos eventos, como no relatório.
-- =============================================================================

-- painel_turma: o mesmo formato das RPCs de ação do facilitador, para a consulta
-- periódica do painel (grupos com visto_em, reconexao_liberada e removido).
create or replace function public.painel_turma(p_turma_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.turmas;
begin
  perform interno.exigir_facilitador();
  select * into t from public.turmas where id = p_turma_id;
  if not found then
    perform interno.erro('TURMA_NAO_ENCONTRADA', 'Turma não encontrada.');
  end if;
  return interno.json_turma(t, true);
end
$$;

-- series_turma: pontos (a cada 30 min simulados) de todos os grupos ativos.
-- [{grupo_id, nome, cor, rodada, minuto, metricas}], por grupo, rodada e minuto.
create or replace function public.series_turma(p_turma_id uuid, p_rodada integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform interno.exigir_facilitador();
  if not exists (select 1 from public.turmas where id = p_turma_id) then
    perform interno.erro('TURMA_NAO_ENCONTRADA', 'Turma não encontrada.');
  end if;
  if p_rodada is not null and p_rodada not in (1, 2) then
    perform interno.erro('DADOS_INVALIDOS', 'Rodada deve ser 1 ou 2.');
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'grupo_id', s.grupo_id, 'nome', g.nome, 'cor', g.cor,
             'rodada', s.rodada, 'minuto', s.minuto, 'metricas', s.metricas)
           order by g.criado_em, s.rodada, s.minuto)
      from public.serie_metricas s
      join public.grupos g on g.id = s.grupo_id
     where g.turma_id = p_turma_id
       and g.removido_em is null
       and (p_rodada is null or s.rodada = p_rodada)
  ), '[]'::jsonb);
end
$$;

-- eventos_turma: eventos mais recentes primeiro (rodada, minuto, ordem de chegada),
-- no máximo p_limite (1..500, padrão 100).
-- [{id, grupo_id, nome, cor, rodada, minuto, tipo, mensagem, criado_em}]
create or replace function public.eventos_turma(
  p_turma_id     uuid,
  p_desde_minuto integer default null,
  p_rodada       integer default null,
  p_limite       integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform interno.exigir_facilitador();
  if not exists (select 1 from public.turmas where id = p_turma_id) then
    perform interno.erro('TURMA_NAO_ENCONTRADA', 'Turma não encontrada.');
  end if;
  if (p_rodada is not null and p_rodada not in (1, 2))
     or (p_desde_minuto is not null and p_desde_minuto not between 0 and 1440)
     or (p_limite is not null and p_limite not between 1 and 500) then
    perform interno.erro('DADOS_INVALIDOS', 'Filtro de eventos fora dos limites.');
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', r.id, 'grupo_id', r.grupo_id, 'nome', r.nome, 'cor', r.cor,
             'rodada', r.rodada, 'minuto', r.minuto, 'tipo', r.tipo,
             'mensagem', r.mensagem, 'criado_em', r.criado_em)
           order by r.rodada desc, r.minuto desc, r.id desc)
      from (
        select e.id, e.grupo_id, g.nome, g.cor, e.rodada, e.minuto, e.tipo, e.mensagem, e.criado_em
          from public.eventos_jogo e
          join public.grupos g on g.id = e.grupo_id
         where g.turma_id = p_turma_id
           and g.removido_em is null
           and (p_rodada is null or e.rodada = p_rodada)
           and (p_desde_minuto is null or e.minuto >= p_desde_minuto)
         order by e.rodada desc, e.minuto desc, e.id desc
         limit coalesce(p_limite, 100)
      ) r
  ), '[]'::jsonb);
end
$$;

-- gerar_relatorio ganha p_local e passa a gravar dados.facilitador e dados.local.
-- A assinatura muda (novo parâmetro opcional), então a versão antiga sai antes:
-- com as duas, `gerar_relatorio(id)` ficaria ambígua.
drop function if exists public.gerar_relatorio(uuid, text);

create or replace function public.gerar_relatorio(
  p_turma_id      uuid,
  p_versao_regras text default null,
  p_local         text default 'Windsor Barra Hotel, Rio de Janeiro'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid;
  t             public.turmas;
  v_slug        text;
  v_dados       jsonb;
  v_facilitador text;
  v_local       text;
begin
  v_uid := interno.exigir_facilitador();
  t := interno.turma_travada(p_turma_id);

  select slug into v_slug from public.relatorios where turma_id = t.id;
  if found then
    return pg_catalog.jsonb_build_object('slug', v_slug, 'turma', interno.json_turma(t, true));
  end if;

  if t.status not in ('encerrada', 'arquivada') then
    perform interno.erro('TRANSICAO_INVALIDA', 'O relatório só pode ser gerado depois de encerrar a turma.');
  end if;
  if p_versao_regras is not null and char_length(p_versao_regras) > 40 then
    perform interno.erro('DADOS_INVALIDOS', 'Versão das regras muito longa.');
  end if;
  v_local := nullif(pg_catalog.btrim(coalesce(p_local, '')), '');
  if v_local is not null and char_length(v_local) > 120 then
    perform interno.erro('DADOS_INVALIDOS', 'Local muito longo (até 120 caracteres).');
  end if;
  select f.nome into v_facilitador from public.facilitadores f where f.user_id = v_uid;

  v_dados := pg_catalog.jsonb_build_object(
    'turma', pg_catalog.jsonb_build_object(
      'id', t.id, 'codigo', t.codigo, 'nome', t.nome, 'evento', t.evento, 'data', t.data),
    'facilitador', v_facilitador,
    'local', v_local,
    'gerado_em', now(),
    'versao_regras', p_versao_regras,
    'grupos', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', g.id, 'nome', g.nome, 'cor', g.cor, 'rodada_entrada', g.rodada_entrada)
             order by g.criado_em)
        from public.grupos g
       where g.turma_id = t.id and g.removido_em is null), '[]'::jsonb),
    'ranking', pg_catalog.jsonb_build_object(
      'rodada1', interno.ranking_rodada(t.id, 1),
      'rodada2', interno.ranking_rodada(t.id, 2)),
    'placar', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'grupo_id', p.grupo_id, 'rodada', p.rodada, 'minuto', p.minuto,
               'pontuacao', p.pontuacao, 'metricas', p.metricas)
             order by p.rodada, p.pontuacao desc)
        from public.placar p
        join public.grupos g on g.id = p.grupo_id
       where g.turma_id = t.id and g.removido_em is null), '[]'::jsonb),
    'series', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'grupo_id', s.grupo_id, 'rodada', s.rodada, 'minuto', s.minuto,
               'metricas', s.metricas)
             order by s.grupo_id, s.rodada, s.minuto)
        from public.serie_metricas s
        join public.grupos g on g.id = s.grupo_id
       where g.turma_id = t.id and g.removido_em is null), '[]'::jsonb),
    'eventos', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'grupo_id', e.grupo_id, 'rodada', e.rodada, 'minuto', e.minuto,
               'tipo', e.tipo, 'mensagem', e.mensagem)
             order by e.rodada, e.minuto, e.id)
        from public.eventos_jogo e
        join public.grupos g on g.id = e.grupo_id
       where g.turma_id = t.id and g.removido_em is null), '[]'::jsonb)
  );

  v_slug := interno.novo_segredo(18);  -- 24 caracteres, 144 bits
  insert into public.relatorios (turma_id, slug, dados, versao_regras)
  values (t.id, v_slug, v_dados, p_versao_regras);

  update public.turmas
     set status = 'arquivada', atualizada_em = now()
   where id = t.id
  returning * into t;

  return pg_catalog.jsonb_build_object('slug', v_slug, 'turma', interno.json_turma(t, true));
end
$$;

-- =============================================================================
-- Privilégios: só authenticated (cada função confere facilitadores por dentro).
-- =============================================================================
revoke all on function
  public.painel_turma(uuid),
  public.series_turma(uuid, integer),
  public.eventos_turma(uuid, integer, integer, integer),
  public.gerar_relatorio(uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.painel_turma(uuid),
  public.series_turma(uuid, integer),
  public.eventos_turma(uuid, integer, integer, integer),
  public.gerar_relatorio(uuid, text, text)
to authenticated;
