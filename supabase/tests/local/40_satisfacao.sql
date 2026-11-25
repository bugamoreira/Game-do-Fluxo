-- Pesquisa de satisfação (migração 20261125090000).
-- Roda depois de 10_ponta_a_ponta.sql (usa o schema tst e o facilitador criados lá).
-- NUNCA rode no projeto Supabase.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.enviar_satisfacao('{"turma":"testesat","nps":10,"aplicabilidade":5,"profundidade":"adequado","aplicar_30_dias":"Fluxista","nome":"Fulana de Tal","email":"a@b.com","interesse_consultoria":true}');
select public.enviar_satisfacao('{"turma":"testesat","nps":8,"bloco_lean":4}');
select public.enviar_satisfacao('{"turma":"testesat","nps":3,"bloco_lean":2,"nps_motivo":"Pouca prática"}');
select tst.ok(tst.erro_de($q$select public.enviar_satisfacao('{"turma":"testesat","nps":11}')$q$) = 'CB008:DADOS_INVALIDOS',
              'nps fora de 0 a 10 é recusado');
select tst.ok(tst.erro_de($q$select public.enviar_satisfacao('{"turma":"testesat","aplicabilidade":3}')$q$) = 'CB008:DADOS_INVALIDOS',
              'resposta sem nps é recusada');
select tst.ok(tst.erro_de($q$select public.enviar_satisfacao('{"turma":"testesat","nps":9,"log_sala":7}')$q$) = 'CB008:DADOS_INVALIDOS',
              'nota fora de 1 a 5 é recusada');
select tst.ok(tst.erro_de($q$select public.enviar_satisfacao('{"turma":"testesat","nps":9,"email":"nao-e-email"}')$q$) = 'CB008:DADOS_INVALIDOS',
              'e-mail malformado é recusado');

select public.painel_satisfacao('testesat') as p \gset
select tst.ok((:'p'::jsonb ->> 'n')::int = 3, 'painel conta 3 respostas');
select tst.ok((:'p'::jsonb ->> 'nps')::int = 0, 'NPS = (1 promotor - 1 detrator) / 3 = 0');
select tst.ok((:'p'::jsonb -> 'medias' ->> 'bloco_lean')::numeric = 3, 'média do bloco Lean = 3');
select tst.ok(position('a@b.com' in :'p') = 0, 'painel não expõe e-mail');
select tst.ok(position('Fulana' in :'p') = 0, 'painel não expõe o nome');
select tst.ok(not (:'p'::jsonb ? 'interesse_consultoria'), 'painel não expõe interesse em consultoria');

select tst.ok(tst.erro_de($q$select count(*) from public.satisfacao_respostas$q$) like '42501%',
              'anon não lê a tabela');
select tst.ok(tst.erro_de($q$insert into public.satisfacao_respostas (nps) values (9)$q$) like '42501%',
              'anon não grava direto na tabela');
select tst.ok(tst.erro_de($q$select public.leads_satisfacao('testesat')$q$) like '42501%',
              'anon não chama leads_satisfacao');
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
select tst.ok(tst.erro_de($q$select public.leads_satisfacao('testesat')$q$) = 'CB006:NAO_AUTORIZADO',
              'logado que não é facilitador não lê os leads');
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.leads_satisfacao('testesat') as l \gset
select tst.ok(jsonb_array_length(:'l'::jsonb) = 1 and (:'l'::jsonb -> 0 ->> 'email') = 'a@b.com'
              and (:'l'::jsonb -> 0 ->> 'nome') = 'Fulana de Tal',
              'facilitador lê o e-mail e o interesse');
reset role;

-- anti-spam: 60 por minuto no total (as 3 de cima já contam)
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select count(public.enviar_satisfacao('{"turma":"spam","nps":5}')) from generate_series(1, 57);
select tst.ok(tst.erro_de($q$select public.enviar_satisfacao('{"turma":"outra","nps":5}')$q$) = 'CB013:LIMITE_EXCEDIDO',
              'a 61ª resposta no mesmo minuto é recusada, mesmo com outra turma');
reset role;
