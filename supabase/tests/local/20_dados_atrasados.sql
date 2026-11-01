-- Dados atrasados de uma rodada que acabou (migração 20261103100000, ensaio E2).
-- Roda depois de 10_ponta_a_ponta.sql (usa o schema tst e o facilitador criados lá).
-- NUNCA rode no projeto Supabase.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_turma('ATRASO', 'Turma atrasada') ->> 'id' as t_atraso \gset
reset role;

set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.entrar_grupo('ATRASO', 'Grupo Lento', null, tst.acesso('ATRASO')) ->> 'token' as tok_l \gset
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.mudar_status(:'t_atraso', 'rodada1') is not null as x \gset
reset role;
-- R1 parou no minuto 900 (8 min de plantão)
update public.turmas set rodada_inicio = now() - interval '480 seconds' where id = :'t_atraso';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.enviar_estado(:'tok_l', 1, 880, 1, '{}'::jsonb, 100, '{}'::jsonb) ->> 'versao') = '1', 'R1: envio normal');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.mudar_status(:'t_atraso', 'debrief') is not null as x \gset
reset role;
select tst.ok((select rodada1_fim is not null and rodada1_minuto_fim = 900 from public.turmas where id = :'t_atraso'),
              'encerrar a R1 guarda rodada1_fim e rodada1_minuto_fim');
update public.estado_jogo set atualizado_em = now() - interval '5 seconds';

-- ---------------------------------------------------------------- debrief: R1 atrasada é aceita
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.registrar_serie(:'tok_l', 1, 870, '{"boarding":3}') ->> 'registrado')::boolean, 'debrief: série atrasada da R1 aceita');
select tst.ok((public.registrar_eventos(:'tok_l', 1, '[{"minuto":871,"tipo":"surto","chave":"r1:871:surto:0"}]') ->> 'inseridos') = '1',
              'debrief: eventos atrasados da R1 aceitos');
select tst.ok((public.enviar_estado(:'tok_l', 1, 895, 2, '{}'::jsonb, 120, '{}'::jsonb) ->> 'versao') = '2', 'debrief: estado atrasado da R1 aceito');
reset role;
update public.estado_jogo set atualizado_em = now() - interval '5 seconds';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 910, 3, '{}'::jsonb, 1, '{}'::jsonb)$q$, :'tok_l')) like 'CB008:%',
              'plausibilidade: minuto além do fim da R1 (+3) -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 896, 3, '{}'::jsonb, 4000, '{}'::jsonb)$q$, :'tok_l')) like 'CB008:%',
              'plausibilidade: pontuação acima de 3000 -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 890, 3, '{}'::jsonb, 1, '{}'::jsonb)$q$, :'tok_l')) like 'CB008:%',
              'plausibilidade: minuto que regride -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 2, 430, 1, '{}'::jsonb, 1, '{}'::jsonb)$q$, :'tok_l')) like 'CB009:%',
              'debrief: rodada 2 ainda não começou -> RODADA_INVALIDA');
reset role;

-- ---------------------------------------------------------------- rodada 2: R1 atrasada ainda aceita na janela
update public.turmas set rodada_fim = now() - interval '40 seconds', rodada1_fim = now() - interval '40 seconds' where id = :'t_atraso';
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok((public.mudar_status(:'t_atraso', 'rodada2') ->> 'rodada') = '2', 'debrief -> rodada2');
reset role;
select tst.ok((select rodada1_minuto_fim = 900 from public.turmas where id = :'t_atraso'), 'iniciar a R2 preserva o fim da R1');
update public.estado_jogo set atualizado_em = now() - interval '5 seconds';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.registrar_serie(:'tok_l', 1, 900, '{"boarding":4}') ->> 'registrado')::boolean, 'R2: série atrasada da R1 aceita');
select tst.ok((public.registrar_eventos(:'tok_l', 1, '[{"minuto":899,"tipo":"obito"}]') ->> 'inseridos') = '1', 'R2: eventos atrasados da R1 aceitos');
select tst.ok((public.enviar_estado(:'tok_l', 1, 900, 4, '{}'::jsonb, 130, '{}'::jsonb) ->> 'versao') = '4',
              'R2: estado atrasado da R1 aceito, com o relógio da R1 (900) e não o da R2');
select tst.ok((public.enviar_estado(:'tok_l', 2, 420, 1, '{}'::jsonb, 10, '{}'::jsonb) ->> 'versao') = '1', 'R2: envio normal da R2');
reset role;
select tst.ok((select pontuacao = 130 from public.placar p join public.grupos g on g.id = p.grupo_id
                where g.turma_id = :'t_atraso' and p.rodada = 1), 'placar da R1 recebeu o envio atrasado');

-- janela de 5 min da R1 acabou
update public.turmas set rodada1_fim = now() - interval '6 minutes' where id = :'t_atraso';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de(format($q$select public.registrar_serie(%L, 1, 900, '{}'::jsonb)$q$, :'tok_l')) like 'CB009:%',
              'R2: série da R1 depois da janela -> RODADA_INVALIDA');
select tst.ok(tst.erro_de(format($q$select public.registrar_eventos(%L, 1, '[{"minuto":900,"tipo":"x"}]'::jsonb)$q$, :'tok_l')) like 'CB009:%',
              'R2: eventos da R1 depois da janela -> RODADA_INVALIDA');
reset role;

-- ---------------------------------------------------------------- encerrada: R2 atrasada aceita na janela
update public.turmas set rodada_inicio = now() - interval '720 seconds' where id = :'t_atraso';
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.mudar_status(:'t_atraso', 'encerrada') is not null as x \gset
reset role;
update public.estado_jogo set atualizado_em = now() - interval '5 seconds';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.registrar_serie(:'tok_l', 2, 1140, '{"boarding":0}') ->> 'registrado')::boolean, 'encerrada: série atrasada da R2 aceita');
select tst.ok((public.enviar_estado(:'tok_l', 2, 1140, 2, '{}'::jsonb, 900, '{}'::jsonb) ->> 'versao') = '2', 'encerrada: estado atrasado da R2 aceito');
select tst.ok(tst.erro_de(format($q$select public.registrar_serie(%L, 1, 900, '{}'::jsonb)$q$, :'tok_l')) like 'CB009:%',
              'encerrada: R1 fora da janela continua recusada');
reset role;
update public.turmas set rodada_fim = now() - interval '6 minutes' where id = :'t_atraso';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de(format($q$select public.registrar_serie(%L, 2, 1140, '{}'::jsonb)$q$, :'tok_l')) like 'CB009:%',
              'encerrada: R2 depois da janela -> RODADA_INVALIDA');
reset role;
select tst.ok(not has_function_privilege('anon', 'interno.minuto_da_rodada(public.turmas,integer)', 'execute'),
              'anon não executa interno.minuto_da_rodada');

select 'DADOS ATRASADOS: TODOS OS TESTES PASSARAM';
