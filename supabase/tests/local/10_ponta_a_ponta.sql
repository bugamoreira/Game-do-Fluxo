-- Teste ponta a ponta das migrações, num Postgres local com os stubs de 00_stubs_supabase.sql.
-- Roda papéis reais (anon / authenticated) com SET ROLE e o JWT simulado em request.jwt.claims.
-- NUNCA rode no projeto Supabase.
\set ON_ERROR_STOP 1
\set QUIET 1

create schema tst;
grant usage on schema tst to anon, authenticated;
-- executa SQL e devolve 'SEM_ERRO' ou 'SQLSTATE:mensagem'
create function tst.erro_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'SEM_ERRO';
exception when others then
  return sqlstate || ':' || sqlerrm;
end $$;
create function tst.ok(p_cond boolean, p_nome text) returns text language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'FALHOU: %', p_nome;
  end if;
  return 'ok - ' || p_nome;
end $$;
grant execute on all functions in schema tst to anon, authenticated;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'facilitador@exemplo'),
  ('22222222-2222-2222-2222-222222222222', 'intruso@exemplo');
insert into public.facilitadores (user_id, nome)
values ('11111111-1111-1111-1111-111111111111', 'Facilitador Teste');

\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------- anon sem login
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de($q$select public.abrir_turma('CBMEDE','x')$q$) like '42501:%',
              'anon não executa abrir_turma (permission denied)');
select tst.ok(tst.erro_de($q$select public.mudar_status(gen_random_uuid(),'rodada1')$q$) like '42501:%',
              'anon não executa mudar_status');
select tst.ok(tst.erro_de($q$select public.gerar_relatorio(gen_random_uuid())$q$) like '42501:%',
              'anon não executa gerar_relatorio');
select tst.ok(tst.erro_de($q$select public.painel_turma(gen_random_uuid())$q$) like '42501:%',
              'anon não executa painel_turma');
select tst.ok(tst.erro_de($q$select public.series_turma(gen_random_uuid())$q$) like '42501:%',
              'anon não executa series_turma');
select tst.ok(tst.erro_de($q$select public.eventos_turma(gen_random_uuid())$q$) like '42501:%',
              'anon não executa eventos_turma');
select tst.ok(tst.erro_de($q$select public.estado_turma('NAOEXISTE')$q$) like 'CB001:TURMA_NAO_ENCONTRADA%',
              'estado_turma de código inexistente -> TURMA_NAO_ENCONTRADA');
select tst.ok(tst.erro_de($q$select interno.hash_token('x')$q$) like '42501:%',
              'anon não usa o schema interno');
reset role;

-- ---------------------------------------------------------------- logado, mas não facilitador
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select tst.ok(tst.erro_de($q$select public.abrir_turma('CBMEDE','x')$q$) like 'CB006:NAO_AUTORIZADO%',
              'logado sem cadastro em facilitadores -> NAO_AUTORIZADO');
select tst.ok(tst.erro_de($q$select public.painel_turma(gen_random_uuid())$q$) like 'CB006:NAO_AUTORIZADO%',
              'logado sem cadastro não lê painel_turma');
select tst.ok(tst.erro_de($q$select public.series_turma(gen_random_uuid())$q$) like 'CB006:%',
              'logado sem cadastro não lê series_turma');
select tst.ok(tst.erro_de($q$select public.eventos_turma(gen_random_uuid())$q$) like 'CB006:%',
              'logado sem cadastro não lê eventos_turma');
select tst.ok((select count(*) from public.estado_jogo) = 0, 'logado comum não vê estado_jogo (RLS)');
reset role;

-- ---------------------------------------------------------------- facilitador abre a turma
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_turma(' cbmede ', 'CBMEDE 2026', 'Congresso', date '2026-11-20') ->> 'id' as turma_id \gset
reset role;
select tst.ok((select status from public.turmas where id = :'turma_id') = 'aberta', 'turma aberta com código normalizado');
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
reset role;

-- ---------------------------------------------------------------- grupos entram (anon)
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.estado_turma('cbmede') ->> 'status') = 'aberta'
              and (public.estado_turma('cbmede') ? 'hora_servidor'),
              'estado_turma público devolve status e hora_servidor');
select public.entrar_grupo('CBMEDE', 'Grupo  A') ->> 'token' as tok_a \gset
select public.entrar_grupo('CBMEDE', 'Grupo B') ->> 'token' as tok_b \gset
select tst.ok(length(:'tok_a') = 43 and :'tok_a' <> :'tok_b', 'token de 43 caracteres, um por grupo');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', ' grupo a ')$q$) like 'CB003:GRUPO_JA_ATIVO%',
              'mesmo nome (normalizado) sem token -> GRUPO_JA_ATIVO');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', 'x')$q$) like 'CB008:DADOS_INVALIDOS%',
              'nome com 1 caractere -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', repeat('y', 31))$q$) like 'CB008:%',
              'nome com 31 caracteres -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', 'Grupo' || chr(8203) || 'A')$q$) like 'CB008:%',
              'nome com espaço de largura zero -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', chr(8238) || 'Grupo Z')$q$) like 'CB008:%',
              'nome com inversão de direção (U+202E) -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', '-- !!')$q$) like 'CB008:%',
              'nome sem 2 letras ou dígitos -> DADOS_INVALIDOS');
select tst.ok(jsonb_array_length(public.estado_turma('CBMEDE') -> 'grupos') = 2, 'estado_turma lista 2 grupos');
select tst.ok((public.estado_turma('CBMEDE', :'tok_a') ->> 'token_valido')::boolean, 'estado_turma com token marca presença');

-- escrita e leitura direta: tudo negado
select tst.ok(tst.erro_de($q$insert into public.turmas (codigo, nome) values ('HACK','x')$q$) like '42501:%', 'anon não insere em turmas');
select tst.ok(tst.erro_de($q$update public.turmas set status = 'encerrada'$q$) like '42501:%', 'anon não altera turmas');
select tst.ok(tst.erro_de($q$delete from public.grupos$q$) like '42501:%', 'anon não apaga grupos');
select tst.ok(tst.erro_de($q$truncate public.placar$q$) like '42501:%', 'anon não trunca placar');
select tst.ok(tst.erro_de($q$insert into public.placar (grupo_id, rodada, minuto, pontuacao) values (gen_random_uuid(),1,420,1)$q$) like '42501:%', 'anon não insere em placar');
select tst.ok(tst.erro_de($q$select token_hash from public.grupos$q$) like '42501:%', 'anon não lê token_hash');
select tst.ok(tst.erro_de($q$select * from public.grupos$q$) like '42501:%', 'anon não faz select * em grupos');
select tst.ok(tst.erro_de($q$select * from public.estado_jogo$q$) like '42501:%', 'anon não lê estado_jogo');
select tst.ok(tst.erro_de($q$select * from public.serie_metricas$q$) like '42501:%', 'anon não lê serie_metricas');
select tst.ok(tst.erro_de($q$select * from public.eventos_jogo$q$) like '42501:%', 'anon não lê eventos_jogo');
select tst.ok(tst.erro_de($q$select * from public.relatorios$q$) like '42501:%', 'anon não lista relatorios');
select tst.ok(tst.erro_de($q$select * from public.facilitadores$q$) like '42501:%', 'anon não lê facilitadores');
select tst.ok(tst.erro_de($q$select facilitador_id from public.turmas$q$) like '42501:%', 'anon não lê facilitador_id');
select tst.ok(tst.erro_de($q$insert into public.estado_jogo (grupo_id, rodada, minuto, versao, estado) values (gen_random_uuid(),1,420,1,'{}')$q$) like '42501:%', 'anon não insere em estado_jogo');
select tst.ok(tst.erro_de($q$select * from public.grupos_publicos$q$) like '42501:%', 'anon não lista grupos de todas as turmas (view)');
select tst.ok(tst.erro_de($q$select * from public.turmas_publicas$q$) like '42501:%', 'anon não lista turmas (view)');
select tst.ok(tst.erro_de($q$select * from public.placar_publico$q$) like '42501:%', 'anon não lista placares (view)');
select tst.ok(tst.erro_de($q$select id, nome from public.grupos$q$) like '42501:%', 'anon não lista grupos (tabela)');
select tst.ok(tst.erro_de($q$select id, codigo from public.turmas$q$) like '42501:%', 'anon não lista turmas (tabela)');
select tst.ok(tst.erro_de($q$select pontuacao from public.placar$q$) like '42501:%', 'anon não lista placares (tabela)');
select tst.ok(tst.erro_de($q$update public.grupos_publicos set nome = 'x'$q$) like '42501:%', 'anon não altera pela view');
-- enviar antes da rodada
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 420, 1, '{}'::jsonb, 0, '{}'::jsonb)$q$, :'tok_a')) like 'CB009:RODADA_INVALIDA%',
              'enviar_estado com turma aberta -> RODADA_INVALIDA');
reset role;

-- ---------------------------------------------------------------- facilitador: transições
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok(tst.erro_de(format($q$select public.mudar_status(%L, 'debrief')$q$, :'turma_id')) like 'CB007:TRANSICAO_INVALIDA%', 'aberta -> debrief recusado');
select tst.ok(tst.erro_de(format($q$select public.mudar_status(%L, 'arquivada')$q$, :'turma_id')) like 'CB007:%', 'aberta -> arquivada recusado');
select tst.ok(tst.erro_de(format($q$select public.pausar(%L)$q$, :'turma_id')) like 'CB007:%', 'pausar fora de rodada recusado');
select tst.ok((public.mudar_status(:'turma_id', 'rodada1') ->> 'status') = 'rodada1', 'aberta -> rodada1');
select tst.ok(tst.erro_de(format($q$select public.mudar_status(%L, 'rodada1')$q$, :'turma_id')) like 'CB007:%', 'clique duplo em Iniciar -> TRANSICAO_INVALIDA');
reset role;

-- ---------------------------------------------------------------- entrada tardia
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', 'Grupo C')$q$) like 'CB002:ENTRADA_FECHADA%', 'grupo novo em rodada sem liberação -> ENTRADA_FECHADA');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok((public.liberar_entrada(:'turma_id', true) ->> 'entrada_liberada')::boolean, 'facilitador libera entrada');
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.entrar_grupo('CBMEDE', 'Grupo C') ->> 'token' as tok_c \gset
select tst.ok(length(:'tok_c') = 43, 'grupo C entra na rodada com entrada liberada');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.liberar_entrada(:'turma_id', false) is not null as x \gset
reset role;
-- a rodada começou há 30 s (minuto 450): os envios abaixo são plausíveis
update public.turmas set rodada_inicio = now() - interval '30 seconds' where id = :'turma_id';

-- ---------------------------------------------------------------- envio de estado
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.enviar_estado(:'tok_a', 1, 430, 1, '{"pacientes":[]}'::jsonb, 10, '{"obitos":0}'::jsonb) ->> 'versao') = '1', 'enviar_estado versão 1');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 431, 1, '{}'::jsonb, 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB005:VERSAO_ANTIGA%', 'mesma versão -> VERSAO_ANTIGA');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 431, 0, '{}'::jsonb, 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB005:%', 'versão menor -> VERSAO_ANTIGA');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 2, 431, 5, '{}'::jsonb, 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB009:RODADA_INVALIDA%', 'rodada diferente da atual -> RODADA_INVALIDA');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 431, 5, '{}'::jsonb, 11, '{}'::jsonb)$q$, repeat('Z', 43))) like 'CB004:TOKEN_INVALIDO%', 'token inexistente -> TOKEN_INVALIDO');
select tst.ok(tst.erro_de($q$select public.enviar_estado('curto', 1, 431, 5, '{}'::jsonb, 11, '{}'::jsonb)$q$) like 'CB004:%', 'token malformado -> TOKEN_INVALIDO');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 431, 5, jsonb_build_object('x', repeat('a', 300000)), 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB008:%', 'estado > 256 KB -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 1140, 5, '{}'::jsonb, 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB008:%', 'minuto à frente do relógio da sala -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 431, 5, '{}'::jsonb, 999999999, '{}'::jsonb)$q$, :'tok_a')) like 'CB008:%', 'pontuação fora da faixa possível -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 431, 5, '{}'::jsonb, -1, '{}'::jsonb)$q$, :'tok_a')) like 'CB008:%', 'pontuação negativa -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 431, 5, '{}'::jsonb, 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB013:LIMITE_EXCEDIDO%', 'nova versão menos de 1 s depois -> LIMITE_EXCEDIDO');
reset role;
update public.estado_jogo set atualizado_em = now() - interval '5 seconds';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 425, 5, '{}'::jsonb, 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB008:%', 'minuto menor que o guardado -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 2000, 5, '{}'::jsonb, 11, '{}'::jsonb)$q$, :'tok_a')) like 'CB008:%', 'minuto fora de 420..1140 -> DADOS_INVALIDOS');
select tst.ok((public.enviar_estado(:'tok_b', 1, 430, 1, '{"b":true}'::jsonb, 20, '{}'::jsonb) ->> 'versao') = '1', 'grupo B envia o próprio estado');
select tst.ok((public.obter_estado(:'tok_a', 1) -> 'estado') = '{"pacientes":[]}'::jsonb, 'obter_estado devolve o estado do próprio grupo');
select tst.ok((public.obter_estado(:'tok_b') -> 'estado') = '{"b":true}'::jsonb, 'token de B só alcança o estado de B');
select tst.ok(public.obter_estado(:'tok_c') is null, 'grupo sem estado salvo -> null');
select tst.ok((public.ranking('CBMEDE') -> 0 ->> 'nome') = 'Grupo B', 'ranking ordena por pontuação');

-- ---------------------------------------------------------------- reconexão
select tst.ok((public.entrar_grupo('CBMEDE', 'grupo a', :'tok_a') -> 'estado_salvo' ->> 'versao') = '1'
              and public.entrar_grupo('CBMEDE', 'grupo a', :'tok_a') -> 'token' = 'null'::jsonb,
              'mesmo computador (token) reconecta, recebe o estado e não recebe token novo');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', 'Grupo A')$q$) like 'CB003:%', 'outro computador sem liberação -> GRUPO_JA_ATIVO');
select tst.ok(tst.erro_de(format($q$select public.entrar_grupo('CBMEDE', 'Grupo A', %L)$q$, :'tok_b')) like 'CB003:%', 'token de outro grupo não reconecta -> GRUPO_JA_ATIVO');
reset role;
select id as grupo_a from public.grupos where nome = 'Grupo A' \gset
select id as grupo_c from public.grupos where nome = 'Grupo C' \gset
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de(format($q$select public.liberar_reconexao(%L)$q$, :'grupo_a')) like '42501:%', 'anon não libera reconexão');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok(tst.erro_de($q$select id from public.grupos$q$) like '42501:%', 'facilitador também lê grupos só por RPC');
select tst.ok(public.liberar_reconexao(:'grupo_a') is not null, 'facilitador libera reconexão do Grupo A');
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.entrar_grupo('CBMEDE', 'Grupo A') as entrada_nova \gset
select tst.ok(length(:'entrada_nova'::jsonb ->> 'token') = 43
              and (:'entrada_nova'::jsonb -> 'estado_salvo' ->> 'versao') = '1',
              'computador novo com liberação: token novo e estado restaurado');
select :'entrada_nova'::jsonb ->> 'token' as tok_a2 \gset
select tst.ok(tst.erro_de(format($q$select public.obter_estado(%L)$q$, :'tok_a')) like 'CB004:%', 'token antigo deixa de valer');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', 'Grupo A')$q$) like 'CB003:%', 'liberação desliga sozinha depois do uso');
reset role;
update public.estado_jogo set atualizado_em = now() - interval '5 seconds';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.enviar_estado(:'tok_a2', 1, 440, 2, '{"pacientes":[1]}'::jsonb, 15, '{}'::jsonb) ->> 'versao') = '2', 'novo token continua o jogo');
reset role;

-- ---------------------------------------------------------------- pausa e relógio
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok((public.pausar(:'turma_id') ->> 'pausada')::boolean, 'pausar');
select tst.ok((public.pausar(:'turma_id') ->> 'pausada')::boolean, 'pausar de novo não dá erro');
select tst.ok(not (public.retomar(:'turma_id') ->> 'pausada')::boolean, 'retomar');
select tst.ok(not (public.retomar(:'turma_id') ->> 'pausada')::boolean, 'retomar de novo não dá erro');
select tst.ok((public.alternar_musica(:'turma_id') ->> 'musica_mudo')::boolean, 'alternar música (mudo)');
select tst.ok((public.liberar_full_capacity(:'turma_id', true) ->> 'full_capacity_liberado')::boolean, 'liberar full capacity');
reset role;
-- relógio: simula rodada iniciada há 100 s com 40 s de pausa -> minuto 480
update public.turmas set rodada_inicio = now() - interval '100 seconds', pausa_acumulada_ms = 40000 where id = :'turma_id';
select tst.ok((public.estado_turma('CBMEDE') ->> 'minuto')::int = 480, 'minuto = 420 + (100 s - 40 s)');
update public.turmas set rodada_inicio = now() - interval '2 hours' where id = :'turma_id';
select tst.ok((public.estado_turma('CBMEDE') ->> 'minuto')::int = 1140, 'minuto limitado a 1140');
update public.turmas set rodada_inicio = now() - interval '30 seconds', pausa_acumulada_ms = 0 where id = :'turma_id';

-- ---------------------------------------------------------------- série e eventos
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.registrar_serie(:'tok_a2', 1, 450, '{"ocupacao":0.8}') ->> 'registrado')::boolean, 'registrar_serie inclui');
select tst.ok(not (public.registrar_serie(:'tok_a2', 1, 450, '{"ocupacao":0.1}') ->> 'registrado')::boolean, 'registrar_serie não altera o ponto existente');
select tst.ok((public.registrar_eventos(:'tok_a2', 1, '[{"minuto":455,"tipo":"obito","mensagem":"Óbito no DE","chave":"e1"},{"minuto":460,"tipo":"surto","chave":"e2"}]') ->> 'inseridos')::int = 2, 'registrar_eventos inclui 2');
select tst.ok((public.registrar_eventos(:'tok_a2', 1, '[{"minuto":455,"tipo":"obito","mensagem":"Óbito no DE","chave":"e1"}]') ->> 'inseridos')::int = 0, 'reenvio com a mesma chave não duplica');
select tst.ok(tst.erro_de(format($q$select public.registrar_eventos(%L, 1, (select jsonb_agg(jsonb_build_object('minuto', 500, 'tipo', 'x')) from generate_series(1, 51)))$q$, :'tok_a2')) like 'CB013:LIMITE_EXCEDIDO%', '51 eventos numa chamada -> LIMITE_EXCEDIDO');
select tst.ok(tst.erro_de(format($q$select public.registrar_eventos(%L, 1, '[{"minuto":"abc","tipo":"x"}]')$q$, :'tok_a2')) like 'CB008:%', 'evento malformado -> DADOS_INVALIDOS');
select tst.ok(tst.erro_de(format($q$select public.registrar_eventos(%L, 1, '[{"minuto":500,"tipo":"<script>"}]')$q$, :'tok_a2')) like 'CB008:%', 'tipo de evento fora do padrão -> DADOS_INVALIDOS');
reset role;

-- ---------------------------------------------------------------- remover grupo
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok(public.remover_grupo(:'grupo_c') is not null, 'facilitador remove o Grupo C');
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de(format($q$select public.obter_estado(%L)$q$, :'tok_c')) like 'CB004:%', 'token do grupo removido deixa de valer');
select tst.ok(jsonb_array_length(public.estado_turma('CBMEDE') -> 'grupos') = 2, 'grupo removido some do estado público');
reset role;

-- ---------------------------------------------------------------- leituras do facilitador
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.painel_turma(:'turma_id') as painel \gset
select tst.ok(jsonb_array_length(:'painel'::jsonb -> 'grupos') = 3
              and (select bool_or((g ->> 'removido')::boolean) from jsonb_array_elements(:'painel'::jsonb -> 'grupos') g)
              and (select bool_and(g ? 'visto_em' and g ? 'reconexao_liberada') from jsonb_array_elements(:'painel'::jsonb -> 'grupos') g),
              'painel_turma: visão do facilitador com removido, visto_em e reconexao_liberada');
select tst.ok(tst.erro_de($q$select public.painel_turma(gen_random_uuid())$q$) like 'CB001:TURMA_NAO_ENCONTRADA%',
              'painel_turma de turma inexistente -> TURMA_NAO_ENCONTRADA');
select tst.ok(jsonb_array_length(public.series_turma(:'turma_id')) = 1
              and (public.series_turma(:'turma_id') -> 0 ->> 'nome') = 'Grupo A'
              and (public.series_turma(:'turma_id') -> 0 -> 'metricas' ->> 'ocupacao') = '0.8',
              'series_turma devolve os pontos com nome do grupo');
select tst.ok(jsonb_array_length(public.series_turma(:'turma_id', 2)) = 0, 'series_turma filtra por rodada');
select tst.ok(tst.erro_de(format($q$select public.series_turma(%L, 3)$q$, :'turma_id')) like 'CB008:%', 'series_turma com rodada 3 -> DADOS_INVALIDOS');
select tst.ok(jsonb_array_length(public.eventos_turma(:'turma_id')) = 2
              and (public.eventos_turma(:'turma_id') -> 0 ->> 'tipo') = 'surto',
              'eventos_turma devolve os mais recentes primeiro');
select tst.ok(jsonb_array_length(public.eventos_turma(:'turma_id', 458)) = 1, 'eventos_turma filtra desde o minuto');
select tst.ok(jsonb_array_length(public.eventos_turma(:'turma_id', null, 1, 1)) = 1, 'eventos_turma respeita o limite');
select tst.ok(tst.erro_de(format($q$select public.eventos_turma(%L, null, null, 501)$q$, :'turma_id')) like 'CB008:%', 'eventos_turma com limite 501 -> DADOS_INVALIDOS');
reset role;

-- ---------------------------------------------------------------- encerrar R1, tolerância, R2
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
reset role;
-- plantão completo (12 min) antes de encerrar, e o último envio de B foi há mais de 1 s
update public.turmas set rodada_inicio = now() - interval '13 minutes' where id = :'turma_id';
update public.estado_jogo set atualizado_em = now() - interval '5 seconds';
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok((public.mudar_status(:'turma_id', 'debrief') ->> 'status') = 'debrief', 'rodada1 -> debrief');
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.enviar_estado(:'tok_b', 1, 1140, 9, '{"fim":true}'::jsonb, 99, '{}'::jsonb) ->> 'versao') = '9', 'último envio aceito até 30 s depois de encerrar');
reset role;
update public.turmas set rodada_fim = now() - interval '1 minute' where id = :'turma_id';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 1140, 10, '{}'::jsonb, 1, '{}'::jsonb)$q$, :'tok_b')) like 'CB009:%', 'depois da tolerância -> RODADA_INVALIDA');
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', 'Grupo D')$q$) like 'CB002:%', 'grupo novo não entra no debrief sem liberação (todos jogam as duas rodadas)');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok(tst.erro_de(format($q$select public.mudar_status(%L, 'encerrada')$q$, :'turma_id')) like 'CB007:%', 'debrief -> encerrada recusado');
select tst.ok(tst.erro_de(format($q$select public.gerar_relatorio(%L)$q$, :'turma_id')) like 'CB007:%', 'relatório antes de encerrar recusado');
select tst.ok((public.mudar_status(:'turma_id', 'rodada2') ->> 'rodada') = '2', 'debrief -> rodada2');
reset role;
update public.turmas set rodada_inicio = now() - interval '90 seconds' where id = :'turma_id';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok((public.enviar_estado(:'tok_a2', 2, 500, 1, '{"r2":true}'::jsonb, 50, '{}'::jsonb) ->> 'versao') = '1', 'rodada 2 começa com versão própria');
select tst.ok(tst.erro_de(format($q$select public.enviar_estado(%L, 1, 500, 99, '{}'::jsonb, 50, '{}'::jsonb)$q$, :'tok_a2')) like 'CB009:%', 'envio para a rodada 1 durante a rodada 2 -> RODADA_INVALIDA');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok((public.mudar_status(:'turma_id', 'encerrada') ->> 'status') = 'encerrada', 'rodada2 -> encerrada');
select tst.ok(tst.erro_de(format($q$select public.mudar_status(%L, 'rodada1')$q$, :'turma_id')) like 'CB007:%', 'encerrada -> rodada1 recusado');
select tst.ok((select count(*) from public.estado_jogo) >= 3, 'facilitador lê estado_jogo');
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select tst.ok(tst.erro_de($q$select public.entrar_grupo('CBMEDE', 'Grupo E')$q$) like 'CB002:%', 'turma encerrada -> ENTRADA_FECHADA');
select tst.ok(tst.erro_de(format($q$select public.entrar_grupo('CBMEDE', 'Grupo A', %L)$q$, :'tok_a2')) like 'CB002:%', 'turma encerrada recusa até reconexão');
reset role;

-- ---------------------------------------------------------------- relatório
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.gerar_relatorio(:'turma_id', 'regras-2026.1') ->> 'slug' as slug \gset
select tst.ok(length(:'slug') >= 22, 'slug com 22+ caracteres');
select tst.ok((public.gerar_relatorio(:'turma_id') ->> 'slug') = :'slug', 'gerar_relatorio de novo devolve o mesmo slug');
reset role;
select tst.ok((select status from public.turmas where id = :'turma_id') = 'arquivada', 'encerrada -> arquivada');
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.obter_relatorio(:'slug') as rel \gset
select tst.ok(jsonb_array_length(:'rel'::jsonb -> 'dados' -> 'ranking' -> 'rodada1') = 2
              and jsonb_array_length(:'rel'::jsonb -> 'dados' -> 'ranking' -> 'rodada2') = 1
              and jsonb_array_length(:'rel'::jsonb -> 'dados' -> 'series') = 1
              and jsonb_array_length(:'rel'::jsonb -> 'dados' -> 'eventos') = 2
              and (:'rel'::jsonb -> 'dados' -> 'ranking' -> 'rodada1' -> 0 ->> 'nome') = 'Grupo B',
              'relatório congela ranking R1/R2, séries e eventos (sem o grupo removido)');
select tst.ok((:'rel'::jsonb -> 'dados' ->> 'facilitador') = 'Facilitador Teste'
              and (:'rel'::jsonb -> 'dados' ->> 'local') = 'Windsor Barra Hotel, Rio de Janeiro',
              'relatório grava o nome do facilitador e o local padrão');
select tst.ok(position('token' in :'rel') = 0, 'relatório não contém token nem hash');
select tst.ok(tst.erro_de($q$select public.obter_relatorio('abc')$q$) like 'CB012:RELATORIO_NAO_ENCONTRADO%', 'slug inválido -> RELATORIO_NAO_ENCONTRADO');
select tst.ok(tst.erro_de(format($q$select public.obter_relatorio(%L)$q$, left(:'slug', 23) || 'x')) like 'CB012:%', 'slug quase certo -> RELATORIO_NAO_ENCONTRADO');
select tst.ok((public.estado_turma('CBMEDE') ->> 'status') = 'arquivada', 'estado_turma ainda mostra a turma arquivada');
reset role;

-- ---------------------------------------------------------------- nova turma com o mesmo código
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_turma('CBMEDE', 'Ensaio 1') ->> 'id' as turma2 \gset
select public.abrir_turma('CBMEDE', 'Ensaio 2') ->> 'id' as turma3 \gset
reset role;
select tst.ok((select status from public.turmas where id = :'turma2') = 'arquivada', 'turma aberta sem grupos é arquivada pela nova');
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.entrar_grupo('CBMEDE', 'Grupo X') is not null as x \gset
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select tst.ok(tst.erro_de($q$select public.abrir_turma('CBMEDE', 'Ensaio 3')$q$) like 'CB011:CODIGO_EM_USO%', 'turma com grupos não é substituída sem confirmação');
select tst.ok((public.abrir_turma('CBMEDE', 'Ensaio 3', null, null, true) ->> 'status') = 'aberta', 'com p_substituir a anterior é arquivada');
reset role;
select tst.ok((select count(*) from public.grupos where turma_id = :'turma3') = 1, 'grupos da turma substituída continuam guardados');
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
reset role;

-- ---------------------------------------------------------------- ranking: desempate estável
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_turma('EMPATE', 'Turma do empate') ->> 'id' as turma_emp \gset
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.entrar_grupo('EMPATE', 'Primeiro') ->> 'token' as tok_p1 \gset
select public.entrar_grupo('EMPATE', 'Segundo') ->> 'token' as tok_p2 \gset
reset role;
update public.grupos set criado_em = now() - interval '1 minute' where nome = 'Primeiro';
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.mudar_status(:'turma_emp', 'rodada1') is not null as x \gset
reset role;
update public.turmas set rodada_inicio = now() - interval '60 seconds' where id = :'turma_emp';
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select public.enviar_estado(:'tok_p2', 1, 430, 1, '{}'::jsonb, 100, '{}'::jsonb) is not null as x \gset
select public.enviar_estado(:'tok_p1', 1, 430, 1, '{}'::jsonb, 100, '{}'::jsonb) is not null as x \gset
select tst.ok((public.ranking('EMPATE') -> 0 ->> 'nome') = 'Primeiro'
              and (public.ranking('EMPATE') -> 1 ->> 'nome') = 'Segundo',
              'empate no ranking: decide quem entrou antes, não quem enviou por último');
reset role;

-- ---------------------------------------------------------------- catálogo
select tst.ok(interno.normalizar_nome(' Ação   Já ') = 'Ação Já', 'nome com acentos é aceito e normalizado');
select tst.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef
                  and not ('search_path=""' = any(coalesce(p.proconfig, '{}')))) = 0,
              'toda função security definer de public tem search_path vazio');
select tst.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef) = 21, '21 RPCs security definer');
select tst.ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0,
              'RLS ligado em todas as tabelas de public');
select tst.ok((select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT') = 0,
              'nenhuma política de escrita');
select tst.ok(not has_function_privilege('anon', 'public.pausar(uuid)', 'execute')
              and has_function_privilege('authenticated', 'public.pausar(uuid)', 'execute')
              and has_function_privilege('anon', 'public.entrar_grupo(text,text,text)', 'execute'),
              'EXECUTE só para os papéis certos');
select tst.ok(not has_function_privilege('anon', 'public.painel_turma(uuid)', 'execute')
              and not has_function_privilege('anon', 'public.series_turma(uuid,integer)', 'execute')
              and not has_function_privilege('anon', 'public.eventos_turma(uuid,integer,integer,integer)', 'execute')
              and not has_function_privilege('anon', 'public.gerar_relatorio(uuid,text,text)', 'execute')
              and has_function_privilege('authenticated', 'public.eventos_turma(uuid,integer,integer,integer)', 'execute'),
              'leituras do facilitador: EXECUTE só para authenticated');
select tst.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'gerar_relatorio') = 1,
              'uma única gerar_relatorio (sem sobrecarga ambígua)');

select 'TODOS OS TESTES PASSARAM';
