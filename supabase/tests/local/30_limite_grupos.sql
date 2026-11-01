-- Limite de 10 grupos por turma (migração 20261103100200).
-- Roda depois de 10_ponta_a_ponta.sql (usa o schema tst e o facilitador criados lá).
-- NUNCA rode no projeto Supabase.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_turma('LOTADA', 'Turma lotada') ->> 'id' as t_lotada \gset
reset role;
select tst.ok((select max_grupos = 10 from public.turmas where id = :'t_lotada'), 'turma nova nasce com limite de 10 grupos');

set role anon;
set request.jwt.claims = '{"role":"anon"}';
select count(public.entrar_grupo('LOTADA', 'Grupo ' || i, null, tst.acesso('LOTADA')) ->> 'token') as entraram
  from generate_series(1, 10) as i \gset
select tst.ok(:entraram = 10, 'dez grupos entram');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('LOTADA', 'Grupo 11', null, tst.acesso('LOTADA'))$q$)
                = 'CB010:TURMA_CHEIA',
              'o 11º grupo é recusado com TURMA_CHEIA');
reset role;
-- a frase da recusa (details) é a que a J1 mostra
do $$
declare v_det text;
begin
  begin
    perform public.entrar_grupo('LOTADA', 'Grupo 11', null, tst.acesso('LOTADA'));
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
  end;
  if v_det is distinct from 'A sala está cheia (10 grupos). Fale com o facilitador.' then
    raise exception 'FALHOU: frase da recusa: %', v_det;
  end if;
end $$;
select 'ok - frase: A sala está cheia (10 grupos). Fale com o facilitador.';

-- removido libera a vaga
select id as g_saiu from public.grupos where turma_id = :'t_lotada' and nome = 'Grupo 3' \gset
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.remover_grupo(:'g_saiu') is not null as x \gset
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(length(public.entrar_grupo('LOTADA', 'Grupo 11', null, tst.acesso('LOTADA')) ->> 'token') = 43,
              'grupo removido libera a vaga para o 11º');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('LOTADA', 'Grupo 12', null, tst.acesso('LOTADA'))$q$) like 'CB010:%',
              'com 10 ativos de novo, o próximo é recusado');
reset role;
select tst.ok(tst.erro_de($q$update public.turmas set max_grupos = 12 where codigo = 'LOTADA'$q$) like '23514:%',
              'max_grupos acima de 10 é recusado pela restrição');

select 'LIMITE DE GRUPOS: TODOS OS TESTES PASSARAM';
