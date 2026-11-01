// Ações do facilitador: login (Supabase Auth) e RPCs que exigem login e cadastro
// em `facilitadores`. O servidor valida as transições da máquina de estados.
// Todas as RPCs do facilitador devolvem o estado da turma na visão do
// facilitador (grupos com `vistoEm`, `reconexaoLiberada`, `removido`).

import { z } from 'zod';
import {
  AbrirTurmaEntradaSchema,
  EstadoTurmaSchema,
  IdSchema,
  LoginEntradaSchema,
  MudarStatusEntradaSchema,
  SessaoFacilitadorSchema,
  umaLinha,
  type AbrirTurmaEntrada,
  type EstadoTurma,
  type SessaoFacilitador,
  type StatusTurma,
} from '../schemas';
import { sb } from '../lib/supabase';
import { NaoAutorizado, RespostaInvalida, SemConexao, mapearErroRpc } from './erros';
import { RPC, chamarEValidar, validarEntrada, type NomeRpc } from './rpc';

const RespostaTurmaSchema = z.preprocess(umaLinha, EstadoTurmaSchema);

const id = (valor: string) => validarEntrada(IdSchema, valor);
const booleano = (valor: boolean) => validarEntrada(z.boolean(), valor);

function acao(nome: NomeRpc, params: Record<string, unknown>): Promise<EstadoTurma> {
  return chamarEValidar(nome, params, RespostaTurmaSchema);
}

export const facilitadorService = {
  /**
   * Login com e-mail e senha (Supabase Auth). A sessão fica salva no navegador.
   * @throws {DadosInvalidos} e-mail ou senha em formato inválido
   * @throws {NaoAutorizado} credenciais recusadas
   * @throws {SemConexao} rede
   */
  async login(email: string, senha: string): Promise<SessaoFacilitador> {
    const entrada = validarEntrada(LoginEntradaSchema, { email, senha });
    let resposta: Awaited<ReturnType<typeof sb.auth.signInWithPassword>>;
    try {
      resposta = await sb.auth.signInWithPassword({ email: entrada.email, password: entrada.senha });
    } catch (e) {
      throw new SemConexao(undefined, e);
    }
    const { data, error } = resposta;
    if (error) {
      const mapeado = mapearErroRpc(error, error.status);
      if (mapeado instanceof SemConexao) throw mapeado;
      throw new NaoAutorizado('E-mail ou senha incorretos.', error);
    }
    const r = SessaoFacilitadorSchema.safeParse({ userId: data.user?.id, email: data.user?.email ?? entrada.email });
    if (!r.success) throw new RespostaInvalida('login', r.error);
    return r.data;
  },

  /** Encerra a sessão do facilitador neste navegador. */
  async sair(): Promise<void> {
    await sb.auth.signOut();
  },

  /**
   * Abre uma turma nova (status `aberta`). Turma anterior de mesmo código encerrada,
   * ou aberta sem grupos, é arquivada sozinha; nos outros casos o servidor recusa com
   * `CodigoEmUso` e é preciso confirmar e chamar de novo com `substituir: true`.
   * @throws {DadosInvalidos} | {CodigoEmUso} | {NaoAutorizado} | {SemConexao}
   */
  async abrirTurma(entrada: AbrirTurmaEntrada): Promise<EstadoTurma> {
    const t = validarEntrada(AbrirTurmaEntradaSchema, entrada);
    return acao(RPC.abrirTurma, {
      p_codigo: t.codigo,
      p_nome: t.nome,
      p_evento: t.evento ?? null,
      p_data: t.data ?? null,
      p_substituir: t.substituir ?? false,
    });
  },

  /**
   * Muda o status da turma (Iniciar Travado, Encerrar, Iniciar Lean, ...).
   * @throws {TransicaoInvalida} transição fora do diagrama
   * @throws {NaoAutorizado} | {SemConexao}
   */
  async mudarStatus(turmaId: string, status: StatusTurma): Promise<EstadoTurma> {
    const e = validarEntrada(MudarStatusEntradaSchema, { turmaId, status });
    return acao(RPC.mudarStatus, { p_turma_id: e.turmaId, p_status: e.status });
  },

  /** Pausa o relógio da rodada (pausar já pausada não faz nada). @throws {TransicaoInvalida} fora de rodada */
  async pausar(turmaId: string): Promise<EstadoTurma> {
    return acao(RPC.pausar, { p_turma_id: id(turmaId) });
  },

  /** Retoma o relógio da rodada (acumula a pausa em `pausaAcumuladaMs`). */
  async retomar(turmaId: string): Promise<EstadoTurma> {
    return acao(RPC.retomar, { p_turma_id: id(turmaId) });
  },

  /** Abre (ou fecha) a entrada de grupos novos durante a rodada. */
  async liberarEntrada(turmaId: string, liberada = true): Promise<EstadoTurma> {
    return acao(RPC.liberarEntrada, { p_turma_id: id(turmaId), p_liberada: booleano(liberada) });
  },

  /** Permite (ou revoga) que um grupo reassuma o time em outro computador, sem o token. */
  async liberarReconexao(grupoId: string, liberada = true): Promise<EstadoTurma> {
    return acao(RPC.liberarReconexao, { p_grupo_id: id(grupoId), p_liberada: booleano(liberada) });
  },

  /** Autoriza (ou revoga) o Full Capacity na rodada Lean. */
  async liberarFullCapacity(turmaId: string, liberado = true): Promise<EstadoTurma> {
    return acao(RPC.liberarFullCapacity, { p_turma_id: id(turmaId), p_liberado: booleano(liberado) });
  },

  /** Liga/desliga a música da turma. Sem `mudo`, inverte o estado atual. */
  async alternarMusica(turmaId: string, mudo?: boolean): Promise<EstadoTurma> {
    return acao(RPC.alternarMusica, { p_turma_id: id(turmaId), p_mudo: mudo === undefined ? null : booleano(mudo) });
  },

  /** Remove um grupo (lógico: o token deixa de valer, o nome fica livre, os dados ficam guardados). */
  async removerGrupo(grupoId: string): Promise<EstadoTurma> {
    return acao(RPC.removerGrupo, { p_grupo_id: id(grupoId) });
  },
};
