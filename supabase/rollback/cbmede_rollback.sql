-- =============================================================================
-- ROLLBACK do schema CBMEDE 2026.
-- Apaga SÓ os objetos criados pelas migrações 20261101190000, 20261101190100
-- e 20261101200000.
-- NÃO toca nas tabelas do FLAME (rooms, teams, game_state, game_logs),
-- nem no pgcrypto, nem no schema auth.
--
-- ATENÇÃO: apaga turmas, grupos, placares e relatórios do CBMEDE. Exporte antes
-- se houver dado que importa.
-- Não fica em supabase/migrations/ de propósito, para o CLI não aplicar.
-- =============================================================================

-- funções públicas
drop function if exists public.estado_turma(text, text);
drop function if exists public.ranking(text);
drop function if exists public.obter_relatorio(text);
drop function if exists public.entrar_grupo(text, text, text);
drop function if exists public.enviar_estado(text, integer, integer, bigint, jsonb, numeric, jsonb);
drop function if exists public.obter_estado(text, integer);
drop function if exists public.registrar_serie(text, integer, integer, jsonb);
drop function if exists public.registrar_eventos(text, integer, jsonb);
drop function if exists public.abrir_turma(text, text, text, date, boolean);
drop function if exists public.mudar_status(uuid, text);
drop function if exists public.pausar(uuid);
drop function if exists public.retomar(uuid);
drop function if exists public.liberar_entrada(uuid, boolean);
drop function if exists public.liberar_reconexao(uuid, boolean);
drop function if exists public.liberar_full_capacity(uuid, boolean);
drop function if exists public.alternar_musica(uuid, boolean);
drop function if exists public.remover_grupo(uuid);
drop function if exists public.gerar_relatorio(uuid, text);
drop function if exists public.gerar_relatorio(uuid, text, text);
drop function if exists public.painel_turma(uuid);
drop function if exists public.series_turma(uuid, integer);
drop function if exists public.eventos_turma(uuid, integer, integer, integer);

-- schema interno inteiro (só contém as auxiliares do CBMEDE)
drop schema if exists interno cascade;

-- views
drop view if exists public.placar_publico;
drop view if exists public.grupos_publicos;
drop view if exists public.turmas_publicas;

-- tabelas (ordem das FKs)
drop table if exists public.relatorios;
drop table if exists public.eventos_jogo;
drop table if exists public.serie_metricas;
drop table if exists public.estado_jogo;
drop table if exists public.placar;
drop table if exists public.grupos;
drop table if exists public.turmas;
drop table if exists public.facilitadores;
