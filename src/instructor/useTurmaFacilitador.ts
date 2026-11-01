// Estado da turma e ranking do painel, por consulta periódica (sem Realtime).
// Usa os mesmos controladores dos hooks compartilhados, com a busca injetada
// pela porta de serviços (assim o modo demonstração usa o serviço falso).

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { LojaObservavel } from '../shared/hooks/cicloPeriodico';
import {
  ControladorEstadoTurma,
  ControladorRanking,
  type InstantaneoRanking,
  type InstantaneoTurma,
} from '../shared/hooks/controladores';
import { useTentarAoVoltarRede } from '../shared/hooks/useTentarAoVoltarRede';
import { instanteEmMs, type EstadoTurma } from '../shared/schemas';
import { montarGrupos, type GrupoPainel } from './logica/fases';
import type { ServicosFacilitador } from './servicos';

export const INTERVALO_TURMA_MS = 1000;
export const INTERVALO_RANKING_MS = 2000;

const TURMA_VAZIA: InstantaneoTurma = { turma: null, conexao: 'online', minutoServidor: null, erro: null };
const RANKING_VAZIO: InstantaneoRanking = { itens: [], conexao: 'online', erro: null };
const GRUPOS_VAZIO: GrupoPainel[] = [];
const assinarNada = () => () => {};

/**
 * Presença dos grupos na visão do facilitador: junta a consulta pública com a
 * resposta da última ação (vistoEm, reconexão liberada, removidos) e com a
 * última vez que este painel viu cada grupo conectado.
 */
export class PresencaGrupos extends LojaObservavel<{ grupos: GrupoPainel[] }> {
  private visao: EstadoTurma | null = null;
  private turma: EstadoTurma | null = null;
  private desvioServidorMs: number | null = null;
  private readonly ultimoVisto = new Map<string, number>();

  constructor(private readonly agora: () => number = Date.now) {
    super({ grupos: GRUPOS_VAZIO });
  }

  /** Nova leitura pública da turma. */
  receberTurma(turma: EstadoTurma | null): void {
    if (turma === this.turma) return;
    this.turma = turma;
    if (turma) {
      const local = this.agora();
      const servidor = instanteEmMs(turma.horaServidor);
      if (Number.isFinite(servidor)) this.desvioServidorMs = servidor - local;
      for (const g of turma.grupos) if (g.conectado) this.ultimoVisto.set(g.id, local);
    }
    this.recalcular();
  }

  /** Resposta de uma ação do facilitador. */
  receberVisao(visao: EstadoTurma): void {
    this.visao = visao;
    this.recalcular();
  }

  private recalcular(): void {
    const t = this.turma;
    if (!t) {
      this.atualizar({ grupos: GRUPOS_VAZIO });
      return;
    }
    const visao = this.visao && this.visao.id === t.id ? this.visao.grupos : null;
    const desvio = this.desvioServidorMs;
    const paraLocal = (instante: string) => {
      const ms = instanteEmMs(instante);
      return Number.isFinite(ms) && desvio !== null ? ms - desvio : null;
    };
    this.atualizar({ grupos: montarGrupos(t.grupos, visao, this.ultimoVisto, paraLocal, this.agora()) });
  }
}

export interface TurmaFacilitador extends InstantaneoTurma {
  ranking: InstantaneoRanking;
  grupos: GrupoPainel[];
  /** Guarda a resposta de uma ação (visão do facilitador) e antecipa a próxima consulta. */
  registrarAcao: (turma: EstadoTurma) => void;
  /** Antecipa a próxima consulta (ação que não devolve a turma, como gerar o relatório). */
  atualizarAgora: () => void;
}

export function useTurmaFacilitador(servicos: ServicosFacilitador, codigo: string | null): TurmaFacilitador {
  const ctrlTurma = useMemo(
    () =>
      codigo ? new ControladorEstadoTurma(codigo, INTERVALO_TURMA_MS, { buscar: (c) => servicos.estado(c) }) : null,
    [codigo, servicos],
  );
  const ctrlRanking = useMemo(
    () => (codigo ? new ControladorRanking(codigo, INTERVALO_RANKING_MS, (c) => servicos.ranking(c)) : null),
    [codigo, servicos],
  );
  // A presença sobrevive à troca de código (a visão é filtrada pelo id da turma).
  const presenca = useMemo(() => new PresencaGrupos(), []);

  useEffect(() => {
    if (!ctrlTurma) return;
    const repassar = () => presenca.receberTurma(ctrlTurma.instantaneo().turma);
    const cancelar = ctrlTurma.assinar(repassar);
    ctrlTurma.iniciar();
    ctrlRanking?.iniciar();
    return () => {
      cancelar();
      ctrlTurma.parar();
      ctrlRanking?.parar();
    };
  }, [ctrlTurma, ctrlRanking, presenca]);

  useTentarAoVoltarRede(ctrlTurma);
  useTentarAoVoltarRede(ctrlRanking);

  const turmaInst = useSyncExternalStore(
    ctrlTurma?.assinar ?? assinarNada,
    ctrlTurma?.instantaneo ?? (() => TURMA_VAZIA),
  );
  const rankingInst = useSyncExternalStore(
    ctrlRanking?.assinar ?? assinarNada,
    ctrlRanking?.instantaneo ?? (() => RANKING_VAZIO),
  );
  const { grupos } = useSyncExternalStore(presenca.assinar, presenca.instantaneo);

  const registrarAcao = useMemo(
    () => (t: EstadoTurma) => {
      presenca.receberVisao(t);
      ctrlTurma?.tentarAgora();
      ctrlRanking?.tentarAgora();
    },
    [presenca, ctrlTurma, ctrlRanking],
  );

  const atualizarAgora = useMemo(
    () => () => {
      ctrlTurma?.tentarAgora();
      ctrlRanking?.tentarAgora();
    },
    [ctrlTurma, ctrlRanking],
  );

  return { ...turmaInst, ranking: rankingInst, grupos, registrarAcao, atualizarAgora };
}
