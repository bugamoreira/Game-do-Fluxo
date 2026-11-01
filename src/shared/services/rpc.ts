// ============================================================
// Chamada de RPC com tempo limite, mapeamento de erro e validação Zod.
// Único ponto que toca `.rpc` dos clientes. Nomes e parâmetros: docs/schema.md.
// RPC do facilitador vai pelo cliente com sessão; todas as outras (grupo,
// telão anônimo, relatório) pelo cliente sem sessão, que não usa a trava de
// sessão do auth-js (src/shared/lib/supabase.ts).
// ============================================================

import type { z } from 'zod';
import { clienteComSessao, clienteSemSessao } from '../lib/supabase';
import { DadosInvalidos, RespostaInvalida, SemConexao, mapearErroRpc } from './erros';

/** Sem resposta neste prazo, a chamada é abortada e vira `SemConexao` (evita consulta presa). */
export const TEMPO_LIMITE_MS = 8000;

/** Nomes das RPCs em um só lugar (docs/schema.md, seção RPCs). */
export const RPC = {
  estadoTurma: 'estado_turma',
  ranking: 'ranking',
  obterRelatorio: 'obter_relatorio',
  entrarGrupo: 'entrar_grupo',
  enviarEstado: 'enviar_estado',
  obterEstado: 'obter_estado',
  registrarSerie: 'registrar_serie',
  registrarEventos: 'registrar_eventos',
  abrirTurma: 'abrir_turma',
  mudarStatus: 'mudar_status',
  pausar: 'pausar',
  retomar: 'retomar',
  liberarEntrada: 'liberar_entrada',
  liberarReconexao: 'liberar_reconexao',
  liberarFullCapacity: 'liberar_full_capacity',
  alternarMusica: 'alternar_musica',
  removerGrupo: 'remover_grupo',
  gerarRelatorio: 'gerar_relatorio',
  painelTurma: 'painel_turma',
  seriesTurma: 'series_turma',
  eventosTurma: 'eventos_turma',
  codigoAcessoTelao: 'codigo_acesso_telao',
} as const;

export type NomeRpc = (typeof RPC)[keyof typeof RPC];

/** RPCs que exigem o login do facilitador (`auth.uid()` no servidor). */
export const RPC_COM_SESSAO: ReadonlySet<NomeRpc> = new Set<NomeRpc>([
  RPC.abrirTurma,
  RPC.mudarStatus,
  RPC.pausar,
  RPC.retomar,
  RPC.liberarEntrada,
  RPC.liberarReconexao,
  RPC.liberarFullCapacity,
  RPC.alternarMusica,
  RPC.removerGrupo,
  RPC.gerarRelatorio,
  RPC.painelTurma,
  RPC.seriesTurma,
  RPC.eventosTurma,
  RPC.codigoAcessoTelao,
]);

/** Cliente certo para a RPC: com sessão só para o facilitador. */
function clientePara(nome: NomeRpc) {
  return RPC_COM_SESSAO.has(nome) ? clienteComSessao() : clienteSemSessao();
}

/**
 * Chama a RPC e devolve o `data` cru.
 * @throws {SemConexao} rede, proxy ou tempo limite
 * @throws {ErroSimulador} erro de negócio mapeado (ver `mapearErroRpc`)
 */
export async function chamarRpc(nome: NomeRpc, params: Record<string, unknown>): Promise<unknown> {
  let resposta: Awaited<ReturnType<ReturnType<typeof clienteSemSessao>['rpc']>>;
  try {
    resposta = await clientePara(nome).rpc(nome, params).abortSignal(AbortSignal.timeout(TEMPO_LIMITE_MS));
  } catch (e) {
    throw new SemConexao(undefined, e);
  }
  const { data, error, status } = resposta;
  if (error) throw mapearErroRpc(error, status);
  return data;
}

/**
 * Valida a resposta com o schema.
 * @throws {RespostaInvalida} se o formato não bate
 */
export function validar<S extends z.ZodType>(schema: S, dados: unknown, operacao: string): z.output<S> {
  const r = schema.safeParse(dados);
  if (!r.success) throw new RespostaInvalida(operacao, r.error);
  return r.data;
}

/**
 * Valida a entrada antes de chamar o servidor.
 * @throws {DadosInvalidos} com a primeira mensagem do schema
 */
export function validarEntrada<S extends z.ZodType>(schema: S, dados: unknown): z.output<S> {
  const r = schema.safeParse(dados);
  if (!r.success) throw new DadosInvalidos(r.error.issues[0]?.message ?? 'Dados inválidos.', r.error);
  return r.data;
}

/** Chama a RPC e valida a resposta. */
export async function chamarEValidar<S extends z.ZodType>(
  nome: NomeRpc,
  params: Record<string, unknown>,
  schema: S,
): Promise<z.output<S>> {
  const dados = await chamarRpc(nome, params);
  return validar(schema, dados, nome);
}
