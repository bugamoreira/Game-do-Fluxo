-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 9: código de acesso de 4 dígitos para entrar na turma.
--
--   turmas.codigo_acesso         4 dígitos aleatórios, gerado ao abrir a turma;
--                                nunca sai em leitura pública (estado_turma).
--   entrar_grupo(..., p_acesso)  grupo NOVO e reconexão LIBERADA exigem o código;
--                                reconexão com o próprio token não exige.
--                                Código ausente ou malformado: CODIGO_ACESSO_INVALIDO
--                                (CB014). Código errado: a resposta é
--                                {erro: 'CODIGO_ACESSO_INVALIDO', detalhe} (HTTP 200),
--                                para a contagem de tentativas não ser desfeita
--                                pela exceção; 20 erros em 1 minuto bloqueiam a
--                                turma por 1 minuto (LIMITE_EXCEDIDO).
--   painel_turma e ações do facilitador devolvem codigo_acesso.
--   codigo_acesso_telao(p_turma_id)  só para facilitador logado (telão aberto pela
--                                janela dele).
-- =============================================================================

create or replace function interno.novo_codigo_acesso()
returns text
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.lpad(
           ((pg_catalog.get_byte(b, 0) * 65536 + pg_catalog.get_byte(b, 1) * 256 + pg_catalog.get_byte(b, 2)) % 10000)::text,
           4, '0')
    from (select extensions.gen_random_bytes(3) as b) x
$$;
revoke all on function interno.novo_codigo_acesso() from public, anon, authenticated;

alter table public.turmas
  add column codigo_acesso text,
  add column acesso_erros integer not null default 0,
  add column acesso_janela timestamptz,
  add column acesso_bloqueado_ate timestamptz;
update public.turmas set codigo_acesso = interno.novo_codigo_acesso() where codigo_acesso is null;
alter table public.turmas
  alter column codigo_acesso set default interno.novo_codigo_acesso(),
  alter column codigo_acesso set not null,
  add constraint turmas_codigo_acesso_formato check (codigo_acesso ~ '^[0-9]{4}$');

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
    when 'CODIGO_ACESSO_INVALIDO'   then 'CB014'
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

create or replace function interno.json_turma(t public.turmas, p_facilitador boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_facilitador
           then pg_catalog.jsonb_build_object('codigo_acesso', t.codigo_acesso)
           else '{}'::jsonb end
      || pg_catalog.jsonb_build_object(
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


-- Telão aberto pela janela logada do facilitador: só o código, para mostrar grande.
create or replace function public.codigo_acesso_telao(p_turma_id uuid)
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
  return pg_catalog.jsonb_build_object('codigo_acesso', t.codigo_acesso);
end
$$;

-- A assinatura antiga de entrar_grupo sai (sem sobrecarga ambígua no PostgREST).
drop function public.entrar_grupo(text, text, text);

create or replace function public.entrar_grupo(
  p_codigo text,
  p_nome   text,
  p_token  text default null,
  p_acesso text default null
)
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
  v_por_token  boolean := false;
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

  v_por_token := found
    and p_token is not null
    and p_token ~ '^[A-Za-z0-9_-]{43}$'
    and g.token_hash = interno.hash_token(p_token);

  -- Grupo novo e reconexão liberada exigem o código de acesso (só quem está na
  -- sala vê no telão). Reconexão com o próprio token não exige.
  if not v_por_token then
    if t.acesso_bloqueado_ate is not null and t.acesso_bloqueado_ate > now() then
      perform interno.erro('LIMITE_EXCEDIDO',
        'Muitas tentativas com código de acesso errado. Aguarde 1 minuto e tente de novo.');
    end if;
    if p_acesso is null or p_acesso !~ '^[0-9]{4}$' then
      perform interno.erro('CODIGO_ACESSO_INVALIDO', 'Código de acesso incorreto. Confira no telão.');
    end if;
    if p_acesso <> t.codigo_acesso then
      -- Conta o erro sem levantar exceção (uma exceção desfaria a contagem):
      -- 20 erros em 1 minuto bloqueiam novas tentativas por 1 minuto.
      update public.turmas
         set acesso_erros = case when acesso_janela is null or acesso_janela < now() - interval '1 minute'
                                 then 1 else acesso_erros + 1 end,
             acesso_janela = case when acesso_janela is null or acesso_janela < now() - interval '1 minute'
                                  then now() else acesso_janela end
       where id = t.id
      returning * into t;
      if t.acesso_erros >= 20 then
        update public.turmas
           set acesso_bloqueado_ate = now() + interval '1 minute', acesso_erros = 0, acesso_janela = null
         where id = t.id;
      end if;
      return pg_catalog.jsonb_build_object(
        'erro', 'CODIGO_ACESSO_INVALIDO',
        'detalhe', 'Código de acesso incorreto. Confira no telão.');
    end if;
  end if;

  if g.id is not null then
    if v_por_token then
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
    -- Regra do Gustavo: todo grupo joga as duas rodadas. Depois que o Travado
    -- começa (inclusive no debrief), grupo novo só entra com liberação do facilitador.
    if t.status in ('rodada1', 'debrief', 'rodada2') and not t.entrada_liberada then
      perform interno.erro('ENTRADA_FECHADA', 'O jogo já começou. Fale com o facilitador.');
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


revoke all on function public.entrar_grupo(text, text, text, text), public.codigo_acesso_telao(uuid) from public, anon, authenticated;
grant execute on function public.entrar_grupo(text, text, text, text) to anon, authenticated;
grant execute on function public.codigo_acesso_telao(uuid) to authenticated;
