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
  pontuacao,
  type Acao,
  type EstadoSimulacao,
  type Ocorrencia,
  type ResultadoPasso,
  type Rodada,
} from '../../shared/lib/simulation';
import type { Sector } from '../../shared/types/game';
import { PASSOS_LOTE, type ResumoRodada } from './sincronia';

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
  limparAviso: () => void;
  descartar: () => void;
  assinarOcorrencias: (ouvinte: OuvinteOcorrencias) => () => void;
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
  let proximoAviso = 1;

  return createStore<EstadoStoreJogo & AcoesStoreJogo>()((set, get) => {
    function emitir(ocorrencias: Ocorrencia[], emLote: boolean, rodada: Rodada): void {
      if (ocorrencias.length === 0) return;
      for (const o of ouvintes) o({ ocorrencias, emLote, rodada });
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
        if (minutoSala != null && minutoSala > estado.minuto) {
          const r = avancarAte(estado, minutoSala);
          atual = r.estado;
          ocorrencias = r.ocorrencias;
        }
        set({ estado: atual, selecionadoId: null, confirmacao: null, aviso: null, resumos });
        set({ resumos: guardarResumoSeAcabou(atual) });
        emitir(ocorrencias, true, atual.rodada);
      },

      avancarPara(minuto) {
        const { estado } = get();
        if (!estado || minuto <= estado.minuto) return 0;
        const r = avancarAte(estado, minuto);
        const passos = r.estado.minuto - estado.minuto;
        if (passos === 0) return 0;
        set({
          estado: r.estado,
          selecionadoId: selecaoValida(r.estado, get().selecionadoId),
          resumos: guardarResumoSeAcabou(r.estado),
        });
        emitir(r.ocorrencias, passos > PASSOS_LOTE, r.estado.rodada);
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

      limparAviso() {
        set({ aviso: null });
      },

      descartar() {
        set({ estado: null, selecionadoId: null, aviso: null, confirmacao: null });
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
