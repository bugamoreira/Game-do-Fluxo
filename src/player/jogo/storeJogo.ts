// ============================================================
// Store do jogo (Zustand, sem React aqui): segura o estado do motor, a seleção
// do paciente e os avisos. Toda regra do jogo é do motor; o store só chama
// `avancarAte`/`aplicarAcao` e repassa as ocorrências aos ouvintes (som,
// avisos na tela, eventos enviados ao servidor).
// ============================================================

import { createStore } from 'zustand/vanilla';
import {
  aplicarAcao,
  avancarAte,
  destinosPossiveis,
  ehErro,
  encerrado,
  liberarFullCapacity,
  metricas,
  revogarFullCapacity,
  pontuacao,
  MINUTO_FIM,
  type Acao,
  type EstadoSimulacao,
  type Metricas,
  type Ocorrencia,
  type ResultadoPasso,
  type Rodada,
} from '../../shared/lib/simulation';
import type { Sector } from '../../shared/types/game';
import { INTERVALO_SERIE_MIN, PASSOS_LOTE, marcoDaSerie, type ResumoRodada } from './sincronia';

export interface AvisoJogo {
  id: number;
  texto: string;
}

export interface ConfirmacaoLeito {
  pacienteId: number;
  texto: string;
}

export interface LoteOcorrencias {
  ocorrencias: Ocorrencia[];
  /** Recuperação de vários minutos de uma vez (reconexão): sem sons nem flash. */
  emLote: boolean;
  rodada: Rodada;
}

export type OuvinteOcorrencias = (lote: LoteOcorrencias) => void;

/** Ponto da série de métricas (um a cada 30 min simulados), com as métricas daquele minuto. */
export interface PontoSerie {
  rodada: Rodada;
  minuto: number;
  metricas: Metricas;
}

export type OuvinteSerie = (ponto: PontoSerie) => void;

/**
 * Avança o motor até `alvo` parando em cada marco da série (múltiplo de 30 min):
 * mesmo numa recuperação de muitos minutos, cada marco sai com as métricas do
 * próprio minuto (o motor é determinístico: avançar em trechos dá o mesmo estado).
 */
export function avancarComMarcos(estado: EstadoSimulacao, alvo: number): ResultadoPasso & { pontos: PontoSerie[] } {
  const fim = Math.min(alvo, MINUTO_FIM);
  let atual = estado;
  const ocorrencias: Ocorrencia[] = [];
  const pontos: PontoSerie[] = [];
  while (atual.minuto < fim) {
    const proximoMarco = marcoDaSerie(atual.minuto) + INTERVALO_SERIE_MIN;
    const r = avancarAte(atual, Math.min(fim, proximoMarco));
    if (r.estado.minuto === atual.minuto) break;
    atual = r.estado;
    ocorrencias.push(...r.ocorrencias);
    if (atual.minuto === proximoMarco) pontos.push({ rodada: atual.rodada, minuto: atual.minuto, metricas: metricas(atual) });
  }
  return { estado: atual, ocorrencias, pontos };
}

export interface EstadoStoreJogo {
  estado: EstadoSimulacao | null;
  selecionadoId: number | null;
  aviso: AvisoJogo | null;
  confirmacao: ConfirmacaoLeito | null;
  /** Resultado final de cada rodada jogada neste computador (comparativo). */
  resumos: Partial<Record<Rodada, ResumoRodada>>;
}

export interface AcoesStoreJogo {
  /** Começa ou restaura uma rodada (já avançada até o minuto da sala, se for o caso). */
  carregar: (estado: EstadoSimulacao, minutoSala?: number | null) => void;
  /** Avança o motor até o minuto pedido (nunca volta). Devolve quantos minutos andou. */
  avancarPara: (minuto: number) => number;
  selecionar: (pacienteId: number | null) => void;
  mover: (destino: Sector) => void;
  confirmarLeitoInadequado: () => void;
  cancelarConfirmacao: () => void;
  usarNir: () => void;
  usarFullCapacity: () => void;
  /** Facilitador autorizou o PCP (Full Capacity). */
  liberarFullCapacity: () => void;
  /** Facilitador revogou o PCP: quem já está no corredor da enfermaria fica. */
  revogarFullCapacity: () => void;
  limparAviso: () => void;
  descartar: () => void;
  assinarOcorrencias: (ouvinte: OuvinteOcorrencias) => () => void;
  /** Pontos da série de métricas, inclusive os marcos atravessados numa recuperação. */
  assinarSerie: (ouvinte: OuvinteSerie) => () => void;
}

export type StoreJogo = ReturnType<typeof criarStoreJogo>;

export function resumoDe(estado: EstadoSimulacao): ResumoRodada {
  return { pontuacao: pontuacao(estado), metricas: metricas(estado) };
}

function selecaoValida(estado: EstadoSimulacao, id: number | null): number | null {
  if (id === null) return null;
  const p = estado.pacientes.find(x => x.id === id);
  if (!p || p.dead || p.sector === 'alta' || p.sector === 'obito') return null;
  return id;
}

export function criarStoreJogo() {
  const ouvintes = new Set<OuvinteOcorrencias>();
  const ouvintesSerie = new Set<OuvinteSerie>();
  let proximoAviso = 1;

  return createStore<EstadoStoreJogo & AcoesStoreJogo>()((set, get) => {
    function emitir(ocorrencias: Ocorrencia[], emLote: boolean, rodada: Rodada): void {
      if (ocorrencias.length === 0) return;
      for (const o of ouvintes) o({ ocorrencias, emLote, rodada });
    }

    function emitirSerie(pontos: PontoSerie[]): void {
      for (const p of pontos) for (const o of ouvintesSerie) o(p);
    }

    function guardarResumoSeAcabou(estado: EstadoSimulacao): Partial<Record<Rodada, ResumoRodada>> {
      const { resumos } = get();
      return encerrado(estado) ? { ...resumos, [estado.rodada]: resumoDe(estado) } : resumos;
    }

    function aplicarResultado(r: ResultadoPasso, extra: Partial<EstadoStoreJogo> = {}): void {
      set({
        estado: r.estado,
        selecionadoId: selecaoValida(r.estado, extra.selecionadoId !== undefined ? extra.selecionadoId : get().selecionadoId),
        resumos: guardarResumoSeAcabou(r.estado),
        ...extra,
      });
      emitir(r.ocorrencias, false, r.estado.rodada);
    }

    function avisar(texto: string): void {
      set({ aviso: { id: proximoAviso++, texto } });
    }

    function agir(acao: Acao): void {
      const { estado } = get();
      if (!estado) return;
      const r = aplicarAcao(estado, acao);
      if (ehErro(r)) {
        if (r.codigo === 'confirmar_leito_inadequado') set({ confirmacao: { pacienteId: acao.pacienteId, texto: r.erro } });
        else avisar(r.erro);
        return;
      }
      aplicarResultado(r, { selecionadoId: null, confirmacao: null });
    }

    return {
      estado: null,
      selecionadoId: null,
      aviso: null,
      confirmacao: null,
      resumos: {},

      carregar(estado, minutoSala) {
        const anterior = get().estado;
        let resumos = get().resumos;
        if (anterior && anterior.rodada !== estado.rodada) resumos = { ...resumos, [anterior.rodada]: resumoDe(anterior) };
        let atual = estado;
        let ocorrencias: Ocorrencia[] = [];
        // O marco em que o estado já está (ex.: 7h de um jogo novo); reenvio não duplica no servidor.
        const pontos: PontoSerie[] =
          estado.minuto === marcoDaSerie(estado.minuto) ? [{ rodada: estado.rodada, minuto: estado.minuto, metricas: metricas(estado) }] : [];
        if (minutoSala != null && minutoSala > estado.minuto) {
          const r = avancarComMarcos(estado, minutoSala);
          atual = r.estado;
          ocorrencias = r.ocorrencias;
          pontos.push(...r.pontos);
        }
        set({ estado: atual, selecionadoId: null, confirmacao: null, aviso: null, resumos });
        set({ resumos: guardarResumoSeAcabou(atual) });
        emitir(ocorrencias, true, atual.rodada);
        emitirSerie(pontos);
      },

      avancarPara(minuto) {
        const { estado } = get();
        if (!estado || minuto <= estado.minuto) return 0;
        const r = avancarComMarcos(estado, minuto);
        const passos = r.estado.minuto - estado.minuto;
        if (passos === 0) return 0;
        set({
          estado: r.estado,
          selecionadoId: selecaoValida(r.estado, get().selecionadoId),
          resumos: guardarResumoSeAcabou(r.estado),
        });
        emitir(r.ocorrencias, passos > PASSOS_LOTE, r.estado.rodada);
        emitirSerie(r.pontos);
        return passos;
      },

      selecionar(pacienteId) {
        const { estado, selecionadoId } = get();
        if (!estado) return;
        const id = pacienteId === selecionadoId ? null : selecaoValida(estado, pacienteId);
        set({ selecionadoId: id, confirmacao: null });
      },

      mover(destino) {
        const id = get().selecionadoId;
        if (id !== null) agir({ tipo: 'mover', pacienteId: id, destino });
      },

      confirmarLeitoInadequado() {
        const c = get().confirmacao;
        if (c) agir({ tipo: 'confirmarLeitoInadequado', pacienteId: c.pacienteId });
      },

      cancelarConfirmacao() {
        set({ confirmacao: null });
      },

      usarNir() {
        const id = get().selecionadoId;
        if (id !== null) agir({ tipo: 'nir', pacienteId: id });
      },

      usarFullCapacity() {
        const id = get().selecionadoId;
        if (id !== null) agir({ tipo: 'fullCapacity', pacienteId: id });
      },

      liberarFullCapacity() {
        const { estado } = get();
        if (!estado || estado.ferramentas.fcLiberado || estado.rodada !== 2) return;
        aplicarResultado(liberarFullCapacity(estado));
      },

      revogarFullCapacity() {
        const { estado } = get();
        if (!estado || !estado.ferramentas.fcLiberado || estado.rodada !== 2) return;
        aplicarResultado(revogarFullCapacity(estado));
      },

      limparAviso() {
        set({ aviso: null });
      },

      descartar() {
        set({ estado: null, selecionadoId: null, aviso: null, confirmacao: null });
      },

      assinarSerie(ouvinte) {
        ouvintesSerie.add(ouvinte);
        return () => {
          ouvintesSerie.delete(ouvinte);
        };
      },

      assinarOcorrencias(ouvinte) {
        ouvintes.add(ouvinte);
        return () => {
          ouvintes.delete(ouvinte);
        };
      },
    };
  });
}

/** Destinos do paciente selecionado (vazio sem seleção). */
export function destinosDaSelecao(s: Pick<EstadoStoreJogo, 'estado' | 'selecionadoId'>): Sector[] {
  return s.estado && s.selecionadoId !== null ? destinosPossiveis(s.estado, s.selecionadoId) : [];
}
