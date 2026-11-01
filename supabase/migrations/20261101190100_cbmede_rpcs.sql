-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 2/2: RPCs (security definer, search_path vazio, nomes qualificados).
--
-- Erros: message = código estável, detail = frase para a tela, hint = código,
-- errcode = SQLSTATE próprio (classe CB). Tabela em docs/schema.md.
-- =============================================================================

-- =============================================================================
-- Auxiliares (schema interno, sem acesso para anon/authenticated)
-- =============================================================================

create or replace function interno.erro(p_codigo text, p_detalhe text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sqlstate text := case p_codigo
    when 'TURMA_NAO_ENCONTRADA'     then 'CB001'
    when 'ENTRADA_FECHADA'          then 'CB002'
    when 'GRUPO_JA_ATIVO'           then 'CB003'
    when 'TOKEN_INVALIDO'           then 'CB004'
    when 'VERSAO_ANTIGA'            then 'CB005'
    when 'NAO_AUTORIZADO'           then 'CB006'
    when 'TRANSICAO_INVALIDA'       then 'CB007'
    when 'DADOS_INVALIDOS'          then 'CB008'
    when 'RODADA_INVALIDA'          then 'CB009'
    when 'TURMA_CHEIA'              then 'CB010'
    when 'CODIGO_EM_USO'            then 'CB011'
    when 'RELATORIO_NAO_ENCONTRADO' then 'CB012'
    when 'LIMITE_EXCEDIDO'          then 'CB013'
    else 'CB000'
  end;
begin
  raise exception using
    errcode = v_sqlstate,
    message = p_codigo,
    detail  = p_detalhe,
    hint    = p_codigo;
end
$$;

-- sha256 do token (pg_catalog.sha256 existe desde o Postgres 11).
create or replace function interno.hash_token(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))
$$;

-- Segredo aleatório em base64url sem padding: 32 bytes -> 43 chars, 18 bytes -> 24 chars.
create or replace function interno.novo_segredo(p_bytes integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.translate(
           pg_catalog.encode(extensions.gen_random_bytes(p_bytes), 'base64'),
           E'+/=\n', '-_')
$$;

-- Facilitador logado e cadastrado, ou NAO_AUTORIZADO.
create or replace function interno.exigir_facilitador()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not exists (select 1 from public.facilitadores f where f.user_id = v_uid) then
    perform interno.erro('NAO_AUTORIZADO', 'Entre com a conta do facilitador.');
  end if;
  return v_uid;
end
$$;

-- Turma pelo código digitado: a ativa (não arquivada) ou, se não houver, a mais recente.
create or replace function interno.turma_por_codigo(p_codigo text)
returns public.turmas
language plpgsql
stable
set search_path = ''
as $$
declare
  t public.turmas;
begin
  if p_codigo is null or char_length(p_codigo) > 32 then
    perform interno.erro('TURMA_NAO_ENCONTRADA', 'Sala não encontrada. Confira o código.');
  end if;
  select * into t
    from public.turmas
   where codigo = pg_catalog.upper(pg_catalog.btrim(p_codigo))
   order by (status <> 'arquivada') desc, criada_em desc
   limit 1;
  if not found then
    perform interno.erro('TURMA_NAO_ENCONTRADA', 'Sala não encontrada. Confira o código.');
  end if;
  return t;
end
$$;

-- Turma por id, travada para alteração (RPCs do facilitador).
create or replace function interno.turma_travada(p_turma_id uuid)
returns public.turmas
language plpgsql
volatile
set search_path = ''
as $$
declare
  t public.turmas;
begin
  select * into t from public.turmas where id = p_turma_id for update;
  if not found then
    perform interno.erro('TURMA_NAO_ENCONTRADA', 'Turma não encontrada.');
  end if;
  return t;
end
$$;

-- Grupo dono do token, ou TOKEN_INVALIDO.
create or replace function interno.grupo_do_token(p_token text)
returns public.grupos
language plpgsql
stable
set search_path = ''
as $$
declare
  g public.grupos;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    perform interno.erro('TOKEN_INVALIDO', 'Sessão do grupo não reconhecida. Entre de novo pela tela inicial.');
  end if;
  select * into g
    from public.grupos
   where token_hash = interno.hash_token(p_token)
     and removido_em is null;
  if not found then
    perform interno.erro('TOKEN_INVALIDO', 'Sessão do grupo não reconhecida. Entre de novo pela tela inicial.');
  end if;
  return g;
end
$$;

-- Nome do grupo: espaços normalizados, 2 a 30 caracteres, sem caractere de controle.
create or replace function interno.normalizar_nome(p_nome text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_nome is null or char_length(p_nome) > 200 then
    perform interno.erro('DADOS_INVALIDOS', 'O nome do grupo precisa ter de 2 a 30 caracteres.');
  end if;
  v := pg_catalog.regexp_replace(pg_catalog.btrim(p_nome), '\s+', ' ', 'g');
  if char_length(v) not between 2 and 30 or v ~ '[[:cntrl:]]' then
    perform interno.erro('DADOS_INVALIDOS', 'O nome do grupo precisa ter de 2 a 30 caracteres.');
  end if;
  return v;
end
$$;

-- Minuto do plantão = 420 + floor((ref - rodada_inicio - pausa_acumulada) / 1000 ms), em [420, 1140].
-- ref = início da pausa em curso, ou fim da rodada, ou agora.
create or replace function interno.minuto_plantao(t public.turmas)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when t.rodada_inicio is null then null
    else least(1140, greatest(420,
           420 + pg_catalog.floor(
             (extract(epoch from (coalesce(t.pausada_em, t.rodada_fim, now()) - t.rodada_inicio)) * 1000
              - t.pausa_acumulada_ms) / 1000
           )::integer))
  end
$$;

-- A rodada informada pelo grupo é a atual? Aceita até 30 s depois do "Encerrar",
-- para o último envio (minuto 1140) não se perder na corrida com o facilitador.
create or replace function interno.aceita_rodada(t public.turmas, p_rodada integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select t.rodada is not null
     and t.rodada = p_rodada
     and (
          t.status in ('rodada1', 'rodada2')
       or (t.status in ('debrief', 'encerrada') and t.rodada_fim > now() - interval '30 seconds')
     )
$$;

-- Estado da turma em JSON (formato documentado em docs/schema.md).
-- p_facilitador = true inclui reconexao_liberada e grupos removidos.
create or replace function interno.json_turma(t public.turmas, p_facilitador boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'nome', t.nome,
    'evento', t.evento,
    'data', t.data,
    'status', t.status,
    'rodada', t.rodada,
    'rodada_inicio', t.rodada_inicio,
    'rodada_fim', t.rodada_fim,
    'pausada', t.pausada_em is not null,
    'pausada_em', t.pausada_em,
    'pausa_acumulada_ms', t.pausa_acumulada_ms,
    'minuto', interno.minuto_plantao(t),
    'hora_servidor', now(),
    'entrada_liberada', t.entrada_liberada,
    'full_capacity_liberado', t.full_capacity_liberado,
    'musica_mudo', t.musica_mudo,
    'grupos', coalesce((
      select pg_catalog.jsonb_agg(
               case when p_facilitador then
                 pg_catalog.jsonb_build_object(
                   'id', g.id, 'nome', g.nome, 'cor', g.cor,
                   'conectado', coalesce(g.visto_em > now() - interval '15 seconds', false),
                   'visto_em', g.visto_em,
                   'reconexao_liberada', g.reconexao_liberada,
                   'removido', g.removido_em is not null)
               else
                 pg_catalog.jsonb_build_object(
                   'id', g.id, 'nome', g.nome, 'cor', g.cor,
                   'conectado', coalesce(g.visto_em > now() - interval '15 seconds', false))
               end
               order by g.criado_em)
        from public.grupos g
       where g.turma_id = t.id
         and (p_facilitador or g.removido_em is null)
    ), '[]'::jsonb)
  )
$$;

-- Ranking de uma rodada (grupos ativos), já com posição.
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
      select pg_catalog.row_number() over (order by p.pontuacao desc, p.atualizado_em asc) as posicao,
             g.id as grupo_id, g.nome, g.cor, p.rodada, p.pontuacao, p.minuto, p.metricas
        from public.placar p
        join public.grupos g on g.id = p.grupo_id
       where g.turma_id = p_turma_id
         and g.removido_em is null
         and p.rodada = p_rodada
    ) r
$$;

-- =============================================================================
-- RPCs públicas
-- =============================================================================

-- estado_turma(codigo[, token]): status, rodada, relógio, hora do servidor, flags, grupos.
-- O token é opcional: se vier e for válido para esta turma, marca o grupo como
-- "visto agora" (presença na sala de espera) e devolve token_valido.
create or replace function public.estado_turma(p_codigo text, p_token text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.turmas;
  v_grupo_id uuid;
  v_json jsonb;
begin
  t := interno.turma_por_codigo(p_codigo);
  v_json := interno.json_turma(t, false);
  if p_token is not null then
    if p_token ~ '^[A-Za-z0-9_-]{43}$' then
      select g.id into v_grupo_id
        from public.grupos g
       where g.token_hash = interno.hash_token(p_token)
         and g.turma_id = t.id
         and g.removido_em is null;
    end if;
    if v_grupo_id is not null then
      update public.grupos
         set visto_em = now()
       where id = v_grupo_id
         and (visto_em is null or visto_em < now() - interval '2 seconds');
    end if;
    v_json := v_json || pg_catalog.jsonb_build_object('token_valido', v_grupo_id is not null);
  end if;
  return v_json;
end
$$;

-- ranking(codigo): as duas rodadas, em ordem de rodada e posição.
create or replace function public.ranking(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.turmas;
begin
  t := interno.turma_por_codigo(p_codigo);
  return interno.ranking_rodada(t.id, 1) || interno.ranking_rodada(t.id, 2);
end
$$;

-- obter_relatorio(slug): dados congelados. Sem o slug exato não há como ler.
create or replace function public.obter_relatorio(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.relatorios;
begin
  if p_slug is null or p_slug !~ '^[A-Za-z0-9_-]{22,64}$' then
    perform interno.erro('RELATORIO_NAO_ENCONTRADO', 'Relatório não encontrado. Confira o link.');
  end if;
  select * into r from public.relatorios where slug = p_slug;
  if not found then
    perform interno.erro('RELATORIO_NAO_ENCONTRADO', 'Relatório não encontrado. Confira o link.');
  end if;
  return pg_catalog.jsonb_build_object(
    'slug', r.slug,
    'criado_em', r.criado_em,
    'versao_regras', r.versao_regras,
    'dados', r.dados);
end
$$;

-- =============================================================================
-- RPCs do grupo
-- =============================================================================

-- entrar_grupo(codigo, nome[, token]): regras de entrada de docs/schema.md.
-- Devolve { turma_id, status, rodada, grupo{id,nome,cor}, token, reconectado, estado_salvo }.
-- `token` só vem preenchido quando um token novo foi gerado (devolvido UMA vez).
create or replace function public.entrar_grupo(p_codigo text, p_nome text, p_token text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- 8 cores fixas de time, nenhuma igual às de Manchester (docs/design.md).
  v_paleta     text[] := array['#1E88E5', '#8E24AA', '#00897B', '#D81B60',
                               '#3949AB', '#6D4C41', '#00ACC1', '#546E7A'];
  t            public.turmas;
  g            public.grupos;
  v_nome       text;
  v_token      text;
  v_cor        text;
  v_ativos     integer;
  v_reconectou boolean := false;
  v_estado     jsonb;
begin
  t := interno.turma_por_codigo(p_codigo);
  -- trava a turma: entradas da mesma turma ficam em fila (cor e limite sem corrida)
  t := interno.turma_travada(t.id);

  if t.status in ('encerrada', 'arquivada') then
    perform interno.erro('ENTRADA_FECHADA', 'Esta turma já foi encerrada.');
  end if;

  v_nome := interno.normalizar_nome(p_nome);

  select * into g
    from public.grupos
   where turma_id = t.id
     and nome_chave = pg_catalog.lower(v_nome)
     and removido_em is null;

  if found then
    if p_token is not null
       and p_token ~ '^[A-Za-z0-9_-]{43}$'
       and g.token_hash = interno.hash_token(p_token) then
      -- mesmo computador: reconecta sem trocar o token
      update public.grupos set visto_em = now() where id = g.id returning * into g;
      v_reconectou := true;
    elsif g.reconexao_liberada then
      -- computador novo, autorizado pelo facilitador: token novo, liberação desligada
      v_token := interno.novo_segredo(32);
      update public.grupos
         set token_hash = interno.hash_token(v_token),
             reconexao_liberada = false,
             visto_em = now()
       where id = g.id
      returning * into g;
      v_reconectou := true;
    else
      perform interno.erro('GRUPO_JA_ATIVO',
        'Esse grupo já está no jogo. Se é o seu, peça ao facilitador para liberar a reconexão.');
    end if;
  else
    if t.status in ('rodada1', 'rodada2') and not t.entrada_liberada then
      perform interno.erro('ENTRADA_FECHADA', 'A rodada já começou. Fale com o facilitador.');
    end if;

    select count(*) into v_ativos
      from public.grupos
     where turma_id = t.id and removido_em is null;
    if v_ativos >= t.max_grupos then
      perform interno.erro('TURMA_CHEIA', 'A sala já está com o número máximo de grupos. Fale com o facilitador.');
    end if;

    select c into v_cor
      from pg_catalog.unnest(v_paleta) with ordinality as p(c, i)
     where c not in (select cor from public.grupos where turma_id = t.id and removido_em is null)
     order by i
     limit 1;
    v_cor := coalesce(v_cor, v_paleta[1 + (v_ativos % pg_catalog.array_length(v_paleta, 1))]);

    v_token := interno.novo_segredo(32);
    insert into public.grupos (turma_id, nome, cor, token_hash, rodada_entrada, visto_em)
    values (t.id, v_nome, v_cor, interno.hash_token(v_token),
            case when t.status in ('rodada1', 'rodada2') then t.rodada end, now())
    returning * into g;
  end if;

  if v_reconectou and t.rodada is not null then
    select pg_catalog.jsonb_build_object(
             'rodada', e.rodada, 'minuto', e.minuto, 'versao', e.versao,
             'estado', e.estado, 'atualizado_em', e.atualizado_em)
      into v_estado
      from public.estado_jogo e
     where e.grupo_id = g.id and e.rodada = t.rodada;
  end if;

  return pg_catalog.jsonb_build_object(
    'turma_id', t.id,
    'status', t.status,
    'rodada', t.rodada,
    'grupo', pg_catalog.jsonb_build_object('id', g.id, 'nome', g.nome, 'cor', g.cor),
    'token', v_token,
    'reconectado', v_reconectou,
    'estado_salvo', v_estado,
    'hora_servidor', now());
end
$$;

-- enviar_estado: grava estado completo + placar. Recusa versão <= guardada
-- (VERSAO_ANTIGA) e rodada que não é a atual (RODADA_INVALIDA).
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
  g    public.grupos;
  t    public.turmas;
  v_n  integer;
begin
  g := interno.grupo_do_token(p_token);
  select * into t from public.turmas where id = g.turma_id;

  if p_rodada is null or p_rodada not in (1, 2)
     or p_minuto is null or p_minuto not between 420 and 1140
     or p_versao is null or p_versao < 0
     or p_estado is null or pg_catalog.jsonb_typeof(p_estado) <> 'object'
     or pg_catalog.octet_length(p_estado::text) > 524288
     or p_pontuacao is null or abs(p_pontuacao) >= 1000000000
     or (p_metricas is not null and (pg_catalog.jsonb_typeof(p_metricas) <> 'object'
                                     or pg_catalog.octet_length(p_metricas::text) > 16384)) then
    perform interno.erro('DADOS_INVALIDOS', 'Dados do jogo fora do formato esperado.');
  end if;

  if not interno.aceita_rodada(t, p_rodada) then
    perform interno.erro('RODADA_INVALIDA', 'Esta rodada não está em andamento.');
  end if;

  insert into public.estado_jogo as e (grupo_id, rodada, minuto, versao, estado, atualizado_em)
  values (g.id, p_rodada, p_minuto, p_versao, p_estado, now())
  on conflict (grupo_id, rodada) do update
     set minuto = excluded.minuto,
         versao = excluded.versao,
         estado = excluded.estado,
         atualizado_em = excluded.atualizado_em
   where e.versao < excluded.versao;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    perform interno.erro('VERSAO_ANTIGA', 'O servidor já tem uma versão mais nova deste jogo.');
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

-- obter_estado(token[, rodada]): último estado salvo do próprio grupo (ou null).
create or replace function public.obter_estado(p_token text, p_rodada integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g        public.grupos;
  t        public.turmas;
  v_rodada integer;
  v_estado jsonb;
begin
  g := interno.grupo_do_token(p_token);
  select * into t from public.turmas where id = g.turma_id;
  v_rodada := coalesce(p_rodada, t.rodada);
  if v_rodada is null then
    return null;
  end if;
  if v_rodada not in (1, 2) then
    perform interno.erro('DADOS_INVALIDOS', 'Rodada inválida.');
  end if;

  update public.grupos
     set visto_em = now()
   where id = g.id
     and (visto_em is null or visto_em < now() - interval '2 seconds');

  select pg_catalog.jsonb_build_object(
           'rodada', e.rodada, 'minuto', e.minuto, 'versao', e.versao,
           'estado', e.estado, 'atualizado_em', e.atualizado_em)
    into v_estado
    from public.estado_jogo e
   where e.grupo_id = g.id and e.rodada = v_rodada;
  return v_estado;
end
$$;

-- registrar_serie: um ponto da série por (grupo, rodada, minuto). Reenvio não duplica.
create or replace function public.registrar_serie(
  p_token    text,
  p_rodada   integer,
  p_minuto   integer,
  p_metricas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g   public.grupos;
  t   public.turmas;
  v_n integer;
begin
  g := interno.grupo_do_token(p_token);
  select * into t from public.turmas where id = g.turma_id;

  if p_rodada is null or p_rodada not in (1, 2)
     or p_minuto is null or p_minuto not between 420 and 1140
     or p_metricas is null or pg_catalog.jsonb_typeof(p_metricas) <> 'object'
     or pg_catalog.octet_length(p_metricas::text) > 16384 then
    perform interno.erro('DADOS_INVALIDOS', 'Métricas fora do formato esperado.');
  end if;
  if not interno.aceita_rodada(t, p_rodada) then
    perform interno.erro('RODADA_INVALIDA', 'Esta rodada não está em andamento.');
  end if;

  insert into public.serie_metricas (grupo_id, rodada, minuto, metricas)
  values (g.id, p_rodada, p_minuto, p_metricas)
  on conflict (grupo_id, rodada, minuto) do nothing;
  get diagnostics v_n = row_count;

  return pg_catalog.jsonb_build_object('registrado', v_n = 1);
end
$$;

-- registrar_eventos: até 50 por chamada, até 3000 por grupo e rodada.
-- Cada item: { minuto: 420..1140, tipo: [A-Za-z0-9_.-]{1,40}, mensagem?: <=300, chave?: id p/ idempotência }.
create or replace function public.registrar_eventos(
  p_token   text,
  p_rodada  integer,
  p_eventos jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g        public.grupos;
  t        public.turmas;
  v_qtd    integer;
  v_atual  integer;
  v_item   jsonb;
  v_n      integer := 0;
  v_parcial integer;
begin
  g := interno.grupo_do_token(p_token);
  select * into t from public.turmas where id = g.turma_id;

  if p_rodada is null or p_rodada not in (1, 2)
     or p_eventos is null or pg_catalog.jsonb_typeof(p_eventos) <> 'array' then
    perform interno.erro('DADOS_INVALIDOS', 'Eventos fora do formato esperado.');
  end if;
  v_qtd := pg_catalog.jsonb_array_length(p_eventos);
  if v_qtd = 0 then
    return pg_catalog.jsonb_build_object('inseridos', 0);
  end if;
  if v_qtd > 50 then
    perform interno.erro('LIMITE_EXCEDIDO', 'No máximo 50 eventos por envio.');
  end if;
  if not interno.aceita_rodada(t, p_rodada) then
    perform interno.erro('RODADA_INVALIDA', 'Esta rodada não está em andamento.');
  end if;

  select count(*) into v_atual
    from public.eventos_jogo
   where grupo_id = g.id and rodada = p_rodada;
  if v_atual + v_qtd > 3000 then
    perform interno.erro('LIMITE_EXCEDIDO', 'Limite de eventos da rodada atingido.');
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_eventos) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.jsonb_typeof(v_item -> 'minuto') is distinct from 'number'
       or (v_item ->> 'minuto') !~ '^[0-9]{3,4}$'
       or (v_item ->> 'minuto')::integer not between 420 and 1140
       or coalesce(v_item ->> 'tipo', '') !~ '^[A-Za-z0-9_.-]{1,40}$'
       or char_length(coalesce(v_item ->> 'mensagem', '')) > 300
       or ((v_item ? 'chave') and coalesce(v_item ->> 'chave', '') !~ '^[A-Za-z0-9_.:-]{1,64}$') then
      perform interno.erro('DADOS_INVALIDOS', 'Evento fora do formato esperado.');
    end if;

    insert into public.eventos_jogo (grupo_id, rodada, minuto, tipo, mensagem, chave)
    values (g.id, p_rodada, (v_item ->> 'minuto')::integer, v_item ->> 'tipo',
            coalesce(v_item ->> 'mensagem', ''), v_item ->> 'chave')
    on conflict (grupo_id, rodada, chave) do nothing;
    get diagnostics v_parcial = row_count;
    v_n := v_n + v_parcial;
  end loop;

  return pg_catalog.jsonb_build_object('inseridos', v_n);
end
$$;

-- =============================================================================
-- RPCs do facilitador (login + cadastro em public.facilitadores)
-- Todas devolvem o estado da turma no formato de estado_turma (visão do facilitador).
-- =============================================================================

-- abrir_turma: cria a turma do evento. Se já existe turma ativa com o mesmo código:
--   * encerrada, ou aberta sem grupos -> a antiga vai para 'arquivada' automaticamente;
--   * qualquer outro caso -> CODIGO_EM_USO, a menos que p_substituir = true.
-- Nada é apagado: a turma antiga e seus dados ficam guardados.
create or replace function public.abrir_turma(
  p_codigo     text,
  p_nome       text,
  p_evento     text default null,
  p_data       date default null,
  p_substituir boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid;
  v_codigo text;
  v_nome   text;
  ant      public.turmas;
  v_grupos integer;
  t        public.turmas;
begin
  v_uid := interno.exigir_facilitador();

  v_codigo := pg_catalog.upper(pg_catalog.btrim(coalesce(p_codigo, '')));
  v_nome := pg_catalog.btrim(coalesce(p_nome, ''));
  if v_codigo !~ '^[A-Z0-9]{3,16}$'
     or char_length(v_nome) not between 2 and 80
     or (p_evento is not null and char_length(p_evento) > 120) then
    perform interno.erro('DADOS_INVALIDOS', 'Código (3 a 16 letras ou números) ou nome inválido.');
  end if;

  select * into ant
    from public.turmas
   where codigo = v_codigo and status <> 'arquivada'
   for update;
  if found then
    select count(*) into v_grupos
      from public.grupos where turma_id = ant.id and removido_em is null;
    if not (ant.status = 'encerrada' or (ant.status = 'aberta' and v_grupos = 0) or p_substituir) then
      perform interno.erro('CODIGO_EM_USO',
        pg_catalog.format('Já existe uma turma %s em andamento (%s, %s grupos). Confirme para substituir.',
                          v_codigo, ant.status, v_grupos));
    end if;
    update public.turmas
       set status = 'arquivada', pausada_em = null, atualizada_em = now()
     where id = ant.id;
  end if;

  insert into public.turmas (codigo, nome, evento, data, facilitador_id)
  values (v_codigo, v_nome, nullif(pg_catalog.btrim(p_evento), ''), coalesce(p_data, current_date), v_uid)
  returning * into t;

  return interno.json_turma(t, true);
end
$$;

-- mudar_status: só as transições do diagrama.
--   aberta -> rodada1 -> debrief -> rodada2 -> encerrada
-- (encerrada -> arquivada só por gerar_relatorio; nova turma arquiva a anterior.)
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

-- pausar: só em rodada. Já pausada = não faz nada (clique duplo não dá erro).
create or replace function public.pausar(p_turma_id uuid)
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
  if t.status not in ('rodada1', 'rodada2') then
    perform interno.erro('TRANSICAO_INVALIDA', 'Só é possível pausar durante uma rodada.');
  end if;
  if t.pausada_em is null then
    update public.turmas set pausada_em = now(), atualizada_em = now()
     where id = t.id returning * into t;
  end if;
  return interno.json_turma(t, true);
end
$$;

-- retomar: soma a pausa em pausa_acumulada_ms. Não pausada = não faz nada.
create or replace function public.retomar(p_turma_id uuid)
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
  if t.status not in ('rodada1', 'rodada2') then
    perform interno.erro('TRANSICAO_INVALIDA', 'Só é possível retomar durante uma rodada.');
  end if;
  if t.pausada_em is not null then
    update public.turmas
       set pausa_acumulada_ms = pausa_acumulada_ms
             + pg_catalog.floor(extract(epoch from (now() - pausada_em)) * 1000)::bigint,
           pausada_em = null,
           atualizada_em = now()
     where id = t.id
    returning * into t;
  end if;
  return interno.json_turma(t, true);
end
$$;

create or replace function public.liberar_entrada(p_turma_id uuid, p_liberada boolean default true)
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
  update public.turmas
     set entrada_liberada = coalesce(p_liberada, true), atualizada_em = now()
   where id = t.id returning * into t;
  return interno.json_turma(t, true);
end
$$;

-- liberar_reconexao(grupo): o próximo computador que entrar com esse nome recebe
-- token novo e o estado salvo; a liberação desliga sozinha depois do uso.
create or replace function public.liberar_reconexao(p_grupo_id uuid, p_liberada boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.grupos;
  t public.turmas;
begin
  perform interno.exigir_facilitador();
  select * into g from public.grupos where id = p_grupo_id and removido_em is null for update;
  if not found then
    perform interno.erro('DADOS_INVALIDOS', 'Grupo não encontrado.');
  end if;
  update public.grupos set reconexao_liberada = coalesce(p_liberada, true) where id = g.id;
  select * into t from public.turmas where id = g.turma_id;
  return interno.json_turma(t, true);
end
$$;

create or replace function public.liberar_full_capacity(p_turma_id uuid, p_liberado boolean default true)
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
  update public.turmas
     set full_capacity_liberado = coalesce(p_liberado, true), atualizada_em = now()
   where id = t.id returning * into t;
  return interno.json_turma(t, true);
end
$$;

-- alternar_musica: p_mudo null inverte; true/false define.
create or replace function public.alternar_musica(p_turma_id uuid, p_mudo boolean default null)
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
  update public.turmas
     set musica_mudo = coalesce(p_mudo, not musica_mudo), atualizada_em = now()
   where id = t.id returning * into t;
  return interno.json_turma(t, true);
end
$$;

-- remover_grupo: remoção lógica. O token deixa de valer e o nome fica livre;
-- os dados continuam guardados (fora do ranking e do relatório).
create or replace function public.remover_grupo(p_grupo_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.grupos;
  t public.turmas;
begin
  perform interno.exigir_facilitador();
  update public.grupos
     set removido_em = now(), reconexao_liberada = false
   where id = p_grupo_id and removido_em is null
  returning * into g;
  if not found then
    perform interno.erro('DADOS_INVALIDOS', 'Grupo não encontrado.');
  end if;
  select * into t from public.turmas where id = g.turma_id;
  return interno.json_turma(t, true);
end
$$;

-- gerar_relatorio: congela ranking R1/R2, placar, séries e eventos em relatorios.dados,
-- com slug aleatório de 24 caracteres. encerrada -> arquivada. Chamar de novo devolve
-- o mesmo slug (idempotente).
create or replace function public.gerar_relatorio(p_turma_id uuid, p_versao_regras text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t       public.turmas;
  v_slug  text;
  v_dados jsonb;
begin
  perform interno.exigir_facilitador();
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

  v_dados := pg_catalog.jsonb_build_object(
    'turma', pg_catalog.jsonb_build_object(
      'id', t.id, 'codigo', t.codigo, 'nome', t.nome, 'evento', t.evento, 'data', t.data),
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
-- Privilégios de EXECUTE
-- O Postgres dá EXECUTE a PUBLIC em função nova e o Supabase dá a anon/authenticated
-- por default privileges. Revoga tudo e concede só o necessário.
-- =============================================================================

-- Auxiliares internas: ninguém além do dono.
revoke all on function
  interno.erro(text, text),
  interno.hash_token(text),
  interno.novo_segredo(integer),
  interno.exigir_facilitador(),
  interno.turma_por_codigo(text),
  interno.turma_travada(uuid),
  interno.grupo_do_token(text),
  interno.normalizar_nome(text),
  interno.minuto_plantao(public.turmas),
  interno.aceita_rodada(public.turmas, integer),
  interno.json_turma(public.turmas, boolean),
  interno.ranking_rodada(uuid, integer)
from public, anon, authenticated;

revoke all on function
  public.estado_turma(text, text),
  public.ranking(text),
  public.obter_relatorio(text),
  public.entrar_grupo(text, text, text),
  public.enviar_estado(text, integer, integer, bigint, jsonb, numeric, jsonb),
  public.obter_estado(text, integer),
  public.registrar_serie(text, integer, integer, jsonb),
  public.registrar_eventos(text, integer, jsonb),
  public.abrir_turma(text, text, text, date, boolean),
  public.mudar_status(uuid, text),
  public.pausar(uuid),
  public.retomar(uuid),
  public.liberar_entrada(uuid, boolean),
  public.liberar_reconexao(uuid, boolean),
  public.liberar_full_capacity(uuid, boolean),
  public.alternar_musica(uuid, boolean),
  public.remover_grupo(uuid),
  public.gerar_relatorio(uuid, text)
from public, anon, authenticated;

-- Públicas e do grupo: anon e authenticated.
grant execute on function
  public.estado_turma(text, text),
  public.ranking(text),
  public.obter_relatorio(text),
  public.entrar_grupo(text, text, text),
  public.enviar_estado(text, integer, integer, bigint, jsonb, numeric, jsonb),
  public.obter_estado(text, integer),
  public.registrar_serie(text, integer, integer, jsonb),
  public.registrar_eventos(text, integer, jsonb)
to anon, authenticated;

-- Do facilitador: só authenticated (e cada uma confere facilitadores por dentro).
grant execute on function
  public.abrir_turma(text, text, text, date, boolean),
  public.mudar_status(uuid, text),
  public.pausar(uuid),
  public.retomar(uuid),
  public.liberar_entrada(uuid, boolean),
  public.liberar_reconexao(uuid, boolean),
  public.liberar_full_capacity(uuid, boolean),
  public.alternar_musica(uuid, boolean),
  public.remover_grupo(uuid),
  public.gerar_relatorio(uuid, text)
to authenticated;
