-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 7: sem leitura direta de turmas, grupos e placar.
--
-- As views públicas e as tabelas listavam turmas, grupos e placares de qualquer
-- evento para qualquer visitante. O app só lê por RPC (estado_turma, ranking,
-- painel_turma...), que filtra pela turma pedida. Ficam sem SELECT para anon e
-- authenticated: as três views e as tabelas turmas, grupos e placar (o REVOKE na
-- tabela revoga também os GRANTs de coluna). estado_jogo, serie_metricas,
-- eventos_jogo e relatorios continuam como estavam (só o facilitador lê).
-- =============================================================================

revoke select on public.turmas_publicas, public.grupos_publicos, public.placar_publico
  from anon, authenticated;
revoke select on public.turmas, public.grupos, public.placar from anon, authenticated;
