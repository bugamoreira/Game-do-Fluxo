-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 4: desempate estável do ranking.
--
-- O desempate por placar.atualizado_em mudava a cada envio (2 s) e fazia a
-- ordem de grupos empatados oscilar no telão. Agora o empate é decidido pela
-- ordem de entrada do grupo (grupos.criado_em) e, por fim, pelo nome.
-- =============================================================================

create or replace function interno.ranking_rodada(p_turma_id uuid, p_rodada integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'posicao', r.posicao, 'grupo_id', r.grupo_id, 'nome', r.nome, 'cor', r.cor,
             'rodada', r.rodada, 'pontuacao', r.pontuacao, 'minuto', r.minuto,
             'metricas', r.metricas)
           order by r.posicao), '[]'::jsonb)
    from (
      select pg_catalog.row_number() over (
               order by p.pontuacao desc, g.criado_em asc, g.nome_chave asc, g.id asc) as posicao,
             g.id as grupo_id, g.nome, g.cor, p.rodada, p.pontuacao, p.minuto, p.metricas
        from public.placar p
        join public.grupos g on g.id = p.grupo_id
       where g.turma_id = p_turma_id
         and g.removido_em is null
         and p.rodada = p_rodada
    ) r
$$;
