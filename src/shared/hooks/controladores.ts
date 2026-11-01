// ============================================================
// Controladores por trás dos hooks de sincronização (docs/contratos.md §3).
// Sem React e sem importar o cliente Supabase: as funções de rede chegam por
// injeção, o que permite testar com fake timers e serviços falsos.
// ============================================================

import type { EstadoBaseSync, EstadoTurma, EventoJogo, ItemRanking, Rodada } from '../schemas';
import { RodadaInvalida, SemConexao, TurmaNaoEncontrada, VersaoAntiga, type ErroSimulador } from '../services/erros';
import { CicloPeriodico, LojaObservavel, type Conexao } from './cicloPeriodico';
import { RelogioServidor, minutoDaTurma } from './relogio';

/** Erro exposto às telas: o tipado, quando houver; senão o genérico. */
export type ErroExposto = ErroSimulador | Error | null;

function comoErro(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/** Intervalo do relógio local: bem abaixo de 1 s para não pular minutos na tela. */
export const TIQUE_RELOGIO_MS = 250;

// ── Estado da turma ───────────────────────────────────────────

export interface InstantaneoTurma {
  turma: EstadoTurma | null;
  conexao: Conexao;
  /** Minuto do plantão (420..1140) corrigido pela hora do servidor; `null` fora de rodada. */
  minutoServidor: number | null;
  erro: ErroExposto;
}

export interface DependenciasTurma {
  buscar: (codigo: string, token: string | null) => Promise<EstadoTurma>;
  /** Token do grupo: a consulta marca presença na sala ("conectado"). */
  token?: string | null;
  agora?: () => number;
}

export class ControladorEstadoTurma extends LojaObservavel<InstantaneoTurma> {
  private readonly ciclo: CicloPeriodico;
  private readonly relogio = new RelogioServidor();
  private tique: ReturnType<typeof setInterval> | null = null;
  private readonly agora: () => number;

  constructor(
    private readonly codigo: string,
    intervaloMs: number,
    private readonly deps: DependenciasTurma,
  ) {
    super({ turma: null, conexao: 'online', minutoServidor: null, erro: null });
    this.agora = deps.agora ?? Date.now;
    this.ciclo = new CicloPeriodico({
      intervaloMs,
      agora: this.agora,
      executar: () => this.consultar(),
      aoErro: (e) => this.aoErro(e),
      aoMudarConexao: (conexao) => this.atualizar({ conexao }),
    });
  }

  iniciar(): void {
    this.ciclo.iniciar();
    if (this.tique === null) this.tique = setInterval(() => this.recalcularMinuto(), TIQUE_RELOGIO_MS);
  }

  parar(): void {
    this.ciclo.parar();
    if (this.tique !== null) {
      clearInterval(this.tique);
      this.tique = null;
    }
  }

  tentarAgora(): void {
    this.ciclo.tentarAgora();
  }

  private async consultar(): Promise<void> {
    const turma = await this.deps.buscar(this.codigo, this.deps.token ?? null);
    this.relogio.registrar(turma.horaServidor, this.agora());
    this.atualizar({ turma, erro: null });
    this.recalcularMinuto();
  }

  private aoErro(e: unknown): void {
    // Falha de rede nunca apaga a turma conhecida: a tela segue com o último estado.
    if (e instanceof TurmaNaoEncontrada) this.atualizar({ turma: null, erro: e, minutoServidor: null });
    else this.atualizar({ erro: comoErro(e) });
  }

  /** Continua andando mesmo sem rede, com o último desvio medido. */
  private recalcularMinuto(): void {
    const { turma, minutoServidor: anterior } = this.instantaneo();
    if (!turma) return;
    const agoraServidor = this.relogio.agora(this.agora());
    if (agoraServidor === null) return;
    // Pausada sem `pausadaEm`: congela no último minuto conhecido.
    if (turma.pausada && !turma.pausadaEm && anterior !== null) return;
    this.atualizar({ minutoServidor: minutoDaTurma(turma, agoraServidor) });
  }
}

// ── Ranking ───────────────────────────────────────────────────

export interface InstantaneoRanking {
  itens: ItemRanking[];
  conexao: Conexao;
  erro: ErroExposto;
}

export class ControladorRanking extends LojaObservavel<InstantaneoRanking> {
  private readonly ciclo: CicloPeriodico;

  constructor(
    private readonly codigo: string,
    intervaloMs: number,
    private readonly buscar: (codigo: string) => Promise<ItemRanking[]>,
  ) {
    super({ itens: [], conexao: 'online', erro: null });
    this.ciclo = new CicloPeriodico({
      intervaloMs,
      executar: async () => {
        const itens = await this.buscar(this.codigo);
        this.atualizar({ itens, erro: null });
      },
      aoErro: (e) => this.atualizar({ erro: comoErro(e) }),
      aoMudarConexao: (conexao) => this.atualizar({ conexao }),
    });
  }

  iniciar(): void {
    this.ciclo.iniciar();
  }

  parar(): void {
    this.ciclo.parar();
  }

  tentarAgora(): void {
    this.ciclo.tentarAgora();
  }
}

// ── Sincronização do jogo do grupo ─────────────────────────────

/** Placar resumido; `metricas` é validado em tempo de execução pelo service (só números). */
export interface ResumoPlacarSync {
  pontuacao: number;
  metricas: object;
}

export interface InstantaneoSync {
  conexao: Conexao;
  ultimaSincronizacao: Date | null;
  erro: ErroExposto;
  /** Registros (série, eventos) aguardando envio. */
  pendentes: number;
}

export interface DependenciasSync {
  enviarEstado: (token: string, estado: EstadoBaseSync, resumo: ResumoPlacarSync) => Promise<void>;
  registrarSerie: (token: string, rodada: Rodada, minuto: number, metricas: object) => Promise<void>;
  registrarEventos: (token: string, rodada: Rodada, eventos: EventoJogo[]) => Promise<void>;
  /** Guarda a cópia local; falha do armazenamento não pode lançar. */
  salvarCopia: (token: string, estado: EstadoBaseSync) => void;
  agora?: () => number;
}

export const INTERVALO_ENVIO_MS = 2000;

/** Máximo de registros guardados na fila sem rede (o mais antigo sai primeiro). */
export const LIMITE_FILA = 500;

export class ControladorSincronizacao extends LojaObservavel<InstantaneoSync> {
  private readonly ciclo: CicloPeriodico;
  private readonly agora: () => number;
  private estado: EstadoBaseSync | null = null;
  private resumir: ((estado: EstadoBaseSync) => ResumoPlacarSync) | null = null;
  private versaoEnviada = -1;
  private rodadaEnviada: Rodada | null = null;
  private readonly fila: Array<() => Promise<void>> = [];

  constructor(
    private readonly token: string,
    private readonly deps: DependenciasSync,
    intervaloMs = INTERVALO_ENVIO_MS,
  ) {
    super({ conexao: 'online', ultimaSincronizacao: null, erro: null, pendentes: 0 });
    this.agora = deps.agora ?? Date.now;
    this.ciclo = new CicloPeriodico({
      intervaloMs,
      agora: this.agora,
      executar: () => this.sincronizar(),
      aoErro: (e) => this.atualizar({ erro: comoErro(e) }),
      aoMudarConexao: (conexao) => this.atualizar({ conexao }),
    });
  }

  iniciar(): void {
    this.ciclo.iniciar();
  }

  parar(): void {
    this.ciclo.parar();
  }

  tentarAgora(): void {
    this.ciclo.tentarAgora();
  }

  /** Novo estado do motor: guarda a cópia local já; o envio sai no próximo ciclo. */
  definirEstado(estado: EstadoBaseSync | null): void {
    if (!estado || estado === this.estado) return;
    this.estado = estado;
    this.deps.salvarCopia(this.token, estado);
  }

  definirResumir(resumir: (estado: EstadoBaseSync) => ResumoPlacarSync): void {
    this.resumir = resumir;
  }

  registrarSerie(rodada: Rodada, minuto: number, metricas: object): void {
    this.enfileirar(() => this.deps.registrarSerie(this.token, rodada, minuto, metricas));
  }

  registrarEventos(rodada: Rodada, eventos: EventoJogo[]): void {
    if (eventos.length === 0) return;
    this.enfileirar(() => this.deps.registrarEventos(this.token, rodada, eventos));
  }

  private enfileirar(op: () => Promise<void>): void {
    this.fila.push(op);
    if (this.fila.length > LIMITE_FILA) this.fila.shift();
    this.atualizar({ pendentes: this.fila.length });
  }

  private precisaEnviar(e: EstadoBaseSync): boolean {
    return e.rodada !== this.rodadaEnviada || e.versao > this.versaoEnviada;
  }

  private async sincronizar(): Promise<boolean> {
    let fez = false;
    const alvo = this.estado;
    if (alvo && this.resumir && this.precisaEnviar(alvo)) {
      try {
        await this.deps.enviarEstado(this.token, alvo, this.resumir(alvo));
      } catch (e) {
        // O servidor já tem versão igual ou mais nova, ou a rodada acabou (passados os 30 s
        // de tolerância): reenviar esta mesma versão não adianta; segue com as próximas.
        if (e instanceof VersaoAntiga || e instanceof RodadaInvalida) this.marcarEnviado(alvo);
        throw e;
      }
      this.marcarEnviado(alvo);
      this.atualizar({ ultimaSincronizacao: new Date(this.agora()), erro: null });
      fez = true;
    }
    while (this.fila.length > 0) {
      const op = this.fila[0]!;
      try {
        await op();
      } catch (e) {
        // Sem rede: fica na fila para a próxima tentativa. Recusa do servidor: descarta para não travar a fila.
        if (!(e instanceof SemConexao)) {
          this.fila.shift();
          this.atualizar({ pendentes: this.fila.length });
        }
        throw e;
      }
      this.fila.shift();
      this.atualizar({ pendentes: this.fila.length });
      fez = true;
    }
    return fez;
  }

  private marcarEnviado(e: EstadoBaseSync): void {
    this.versaoEnviada = e.versao;
    this.rodadaEnviada = e.rodada;
  }
}
