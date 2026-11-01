// Ações do facilitador: login (Supabase Auth) e RPCs que exigem login e cadastro
// em `facilitadores`. O servidor valida as transições da máquina de estados.
// Todas as RPCs do facilitador devolvem o estado da turma na visão do
// facilitador (grupos com `vistoEm`, `reconexaoLiberada`, `removido`).

import { z } from 'zod';
import {
  AbrirTurmaEntradaSchema,
  CodigoAcessoSchema,
  EstadoTurmaSchema,
  FiltroEventosSchema,
  GerarRelatorioEntradaSchema,
  IdSchema,
  LoginEntradaSchema,
  MudarStatusEntradaSchema,
  RelatorioGeradoSchema,
  RespostaEventosTurmaSchema,
  RespostaSeriesTurmaSchema,
  RodadaSchema,
  SessaoFacilitadorSchema,
  umaLinha,
  type AbrirTurmaEntrada,
  type EstadoTurma,
  type EventoTurma,
  type FiltroEventos,
  type GerarRelatorioEntrada,
  type PontoSerieTurma,
  type RelatorioGerado,
  type Rodada,
  type SessaoFacilitador,
  type StatusTurma,
} from '../schemas';
import { clienteComSessao } from '../lib/supabase';
import { NaoAutorizado, RespostaInvalida, SemConexao, mapearErroRpc } from './erros';
import { RPC, chamarEValidar, validarEntrada, type NomeRpc } from './rpc';

const RespostaTurmaSchema = z.preprocess(umaLinha, EstadoTurmaSchema);

const CodigoAcessoTelaoSchema = z.preprocess(umaLinha, z.object({ codigo_acesso: CodigoAcessoSchema }));

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
    let resposta: Awaited<ReturnType<ReturnType<typeof clienteComSessao>['auth']['signInWithPassword']>>;
    try {
      resposta = await clienteComSessao().auth.signInWithPassword({ email: entrada.email, password: entrada.senha });
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

  /**
   * Sessão salva neste navegador (Supabase Auth), para restaurar o painel ao
   * recarregar a página ou para o telão aberto pela janela do facilitador.
   * Devolve `null` sem sessão, com sessão inválida ou sem rede: quem chama
   * simplesmente pede o login de novo.
   */
  async sessaoAtual(): Promise<SessaoFacilitador | null> {
    try {
      const { data, error } = await clienteComSessao().auth.getSession();
      const usuario = data.session?.user;
      if (error || !usuario) return null;
      const r = SessaoFacilitadorSchema.safeParse({ userId: usuario.id, email: usuario.email ?? '' });
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  },

  /**
   * Avisa quando a sessão muda neste navegador (login, saída, renovação do token).
   * As leituras do facilitador recusadas por sessão expirada tentam de novo na hora.
   * Devolve o cancelamento.
   */
  aoMudarSessao(ouvinte: () => void): () => void {
    try {
      const { data } = clienteComSessao().auth.onAuthStateChange(() => ouvinte());
      return () => data.subscription.unsubscribe();
    } catch {
      return () => {};
    }
  },

  /** Encerra a sessão do facilitador neste navegador. */
  async sair(): Promise<void> {
    await clienteComSessao().auth.signOut();
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

  /**
   * Estado da turma na visão do facilitador (grupos com `vistoEm`,
   * `reconexaoLiberada`, `removido`). Usado na consulta periódica do painel.
   * @throws {TurmaNaoEncontrada} | {NaoAutorizado} | {SemConexao} | {RespostaInvalida}
   */
  async painelTurma(turmaId: string): Promise<EstadoTurma> {
    return acao(RPC.painelTurma, { p_turma_id: id(turmaId) });
  },

  /**
   * Código de acesso da turma, para o telão aberto pela janela logada do facilitador.
   * @throws {TurmaNaoEncontrada} | {NaoAutorizado} | {SemConexao} | {RespostaInvalida}
   */
  async codigoAcessoTelao(turmaId: string): Promise<string> {
    const r = await chamarEValidar(RPC.codigoAcessoTelao, { p_turma_id: id(turmaId) }, CodigoAcessoTelaoSchema);
    return r.codigo_acesso;
  },

  /**
   * Séries de métricas (um ponto a cada 30 min simulados) de todos os grupos ativos.
   * @throws {TurmaNaoEncontrada} | {NaoAutorizado} | {SemConexao} | {RespostaInvalida}
   */
  async seriesTurma(turmaId: string, rodada?: Rodada): Promise<PontoSerieTurma[]> {
    return chamarEValidar(
      RPC.seriesTurma,
      { p_turma_id: id(turmaId), p_rodada: rodada === undefined ? null : validarEntrada(RodadaSchema, rodada) },
      RespostaSeriesTurmaSchema,
    );
  },

  /**
   * Eventos recentes da turma (óbitos, surto, NIR...), mais recentes primeiro.
   * @throws {TurmaNaoEncontrada} | {NaoAutorizado} | {SemConexao} | {RespostaInvalida}
   */
  async eventosTurma(turmaId: string, filtro: FiltroEventos = {}): Promise<EventoTurma[]> {
    const f = validarEntrada(FiltroEventosSchema, filtro);
    return chamarEValidar(
      RPC.eventosTurma,
      {
        p_turma_id: id(turmaId),
        p_desde_minuto: f.desdeMinuto ?? null,
        p_rodada: f.rodada ?? null,
        p_limite: f.limite ?? 100,
      },
      RespostaEventosTurmaSchema,
    );
  },

  /**
   * Congela os dados da turma encerrada no relatório (com o nome do facilitador e
   * o local), passa-a para `arquivada` e devolve o slug e a turma. Chamar de novo
   * devolve o mesmo slug.
   * @throws {TransicaoInvalida} turma ainda não encerrada
   * @throws {DadosInvalidos} | {NaoAutorizado} | {SemConexao} | {RespostaInvalida}
   */
  async gerarRelatorio(turmaId: string, opcoes: GerarRelatorioEntrada = {}): Promise<RelatorioGerado> {
    const o = validarEntrada(GerarRelatorioEntradaSchema, opcoes);
    const params: Record<string, unknown> = { p_turma_id: id(turmaId), p_versao_regras: o.versaoRegras ?? null };
    // Sem local, o banco usa o padrão (Windsor Barra Hotel, Rio de Janeiro).
    if (o.local !== undefined) params.p_local = o.local;
    return chamarEValidar(RPC.gerarRelatorio, params, RelatorioGeradoSchema);
  },
};
