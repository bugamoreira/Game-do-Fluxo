// Estado da turma e ranking do painel, por consulta periódica (sem Realtime).
// Usa os mesmos controladores dos hooks compartilhados, com a busca injetada
// pela porta de serviços (assim o modo demonstração usa o serviço falso).
// A consulta acha a turma pelo código (leitura pública) e, a partir daí, usa
// `painel_turma` (visão do facilitador: "visto há X s", removidos e reconexão
// liberada sempre corretos, mesmo sem nenhuma ação recente).

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { LojaObservavel } from '../shared/hooks/cicloPeriodico';
import {
  ControladorEstadoTurma,
  ControladorRanking,
  type InstantaneoRanking,
  type InstantaneoTurma,
} from '../shared/hooks/controladores';
import { useTentarAoVoltarRede } from '../shared/hooks/useTentarAoVoltarRede';
import type { EventoTurma, PontoSerieTurma, StatusTurma } from '../shared/schemas';
import { instanteEmMs, type EstadoTurma } from '../shared/schemas';
import { NaoAutorizado, TurmaNaoEncontrada } from '../shared/services/erros';
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

  /** Nova leitura da turma (pública ou, pelo `painel_turma`, já na visão do facilitador). */
  receberTurma(turma: EstadoTurma | null): void {
    if (turma === this.turma) return;
    this.turma = turma;
    if (turma && turma.grupos.some((g) => g.removido !== undefined)) this.visao = turma;
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

/** Turma acompanhada pelo painel: o id é descoberto pela leitura pública e confirmado pelas ações. */
export class AlvoPainel {
  id: string | null = null;
  /** `painel_turma` recusou (sessão expirada): segue só com a leitura pública. */
  semPainel = false;

  fixar(id: string): void {
    this.id = id;
  }
}

/**
 * Busca da consulta periódica: `painel_turma` quando já se sabe o id da turma;
 * a leitura pública pelo código para achar a turma, quando ela é arquivada (pode
 * haver outra com o mesmo código) ou se a sessão deixar de valer.
 */
export function criarBuscaPainel(servicos: ServicosFacilitador, alvo: AlvoPainel): (codigo: string) => Promise<EstadoTurma> {
  return async (codigo) => {
    if (alvo.id && !alvo.semPainel) {
      try {
        const t = await servicos.painelTurma(alvo.id);
        if (t.status === 'arquivada') alvo.id = null;
        return t;
      } catch (e) {
        if (e instanceof NaoAutorizado) alvo.semPainel = true;
        else if (!(e instanceof TurmaNaoEncontrada)) throw e;
        alvo.id = null;
      }
    }
    const t = await servicos.estado(codigo);
    alvo.id = t.id;
    return t;
  };
}

export function useTurmaFacilitador(servicos: ServicosFacilitador, codigo: string | null): TurmaFacilitador {
  const alvo = useMemo(() => (codigo ? new AlvoPainel() : null), [codigo]);
  const ctrlTurma = useMemo(
    () =>
      codigo && alvo
        ? new ControladorEstadoTurma(codigo, INTERVALO_TURMA_MS, { buscar: criarBuscaPainel(servicos, alvo) })
        : null,
    [codigo, servicos, alvo],
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
      if (t.codigo === codigo) alvo?.fixar(t.id);
      presenca.receberVisao(t);
      ctrlTurma?.tentarAgora();
      ctrlRanking?.tentarAgora();
    },
    [presenca, ctrlTurma, ctrlRanking, alvo, codigo],
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

// ── Séries e eventos (debrief e resultado) ───────────────────

export interface LeiturasFacilitador {
  series: PontoSerieTurma[];
  eventos: EventoTurma[];
}

/** Intervalo das leituras de séries e eventos: durante a rodada e fora dela. */
export const INTERVALO_LEITURAS_RODADA_MS = 10_000;
export const INTERVALO_LEITURAS_PARADA_MS = 30_000;

/**
 * Séries e eventos da turma, lidos de tempos em tempos (não precisam do ritmo
 * de 1 s do estado). Falha de leitura mantém o último resultado; sem nenhum
 * resultado, devolve `null` e as telas usam só o ranking.
 */
export function useLeiturasFacilitador(
  servicos: ServicosFacilitador,
  turmaId: string | null,
  status: StatusTurma | null,
): LeiturasFacilitador | null {
  const [dados, setDados] = useState<(LeiturasFacilitador & { turmaId: string }) | null>(null);
  const comDados = status !== null && status !== 'aberta';
  const emRodada = status === 'rodada1' || status === 'rodada2';

  useEffect(() => {
    if (!turmaId || !comDados) return;
    let vivo = true;
    const ler = async () => {
      try {
        const [series, eventos] = await Promise.all([
          servicos.seriesTurma(turmaId),
          servicos.eventosTurma(turmaId, { limite: 300 }),
        ]);
        if (vivo) setDados({ turmaId, series, eventos });
      } catch {
        /* mantém o último resultado; as telas seguem com o ranking */
      }
    };
    void ler();
    const id = setInterval(() => void ler(), emRodada ? INTERVALO_LEITURAS_RODADA_MS : INTERVALO_LEITURAS_PARADA_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [servicos, turmaId, comDados, emRodada, status]);

  return dados && dados.turmaId === turmaId ? { series: dados.series, eventos: dados.eventos } : null;
}
