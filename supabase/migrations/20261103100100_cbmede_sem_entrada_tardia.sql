-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 11: sem grupos novos depois que a dinâmica começa (decisão do Gustavo).
--
-- Grupo novo só entra com a turma em `aberta`. Em rodada1, debrief, rodada2 e
-- encerrada, entrar_grupo recusa grupo novo sempre (ENTRADA_FECHADA). A
-- exceção "Liberar entrada" sai: a RPC liberar_entrada é removida e a coluna
-- turmas.entrada_liberada fica sem uso (sempre falsa; continua no JSON da
-- turma só por compatibilidade). A reconexão de um grupo que já existe
-- (mesmo nome + código de acesso, liberada pelo facilitador) continua igual.
-- =============================================================================

update public.turmas set entrada_liberada = false where entrada_liberada;

drop function if exists public.liberar_entrada(uuid, boolean);

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
    -- Regra do Gustavo: grupo novo só entra com a turma aberta, sem exceção. A sala
    -- só começa com todos conectados; quem já estava volta pela reconexão liberada.
    if t.status <> 'aberta' then
      perform interno.erro('ENTRADA_FECHADA',
        'O jogo já começou e grupos novos não entram mais. Se o seu grupo já estava na sala, peça ao facilitador para liberar a reconexão.');
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
            null, now())
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

revoke all on function public.entrar_grupo(text, text, text, text) from public, anon, authenticated;
grant execute on function public.entrar_grupo(text, text, text, text) to anon, authenticated;
