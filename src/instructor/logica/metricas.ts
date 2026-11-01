// ============================================================
// Leitura das métricas do ranking para a discussão (F2–F5).
// As métricas vêm do motor (`metricas(estado)`), enviadas pelo grupo e
// devolvidas pela RPC `ranking`. Aqui só se lê, com padrão 0 para chave ausente.
// ============================================================

import type { ItemRanking, Rodada } from '../../shared/schemas';
import { MINUTO_INICIO } from '../../shared/hooks/relogio';

export function metrica(item: ItemRanking | undefined, chave: string): number {
  const v = item?.metricas[chave];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function itensDaRodada(ranking: ItemRanking[], rodada: Rodada): ItemRanking[] {
  return ranking.filter((i) => i.rodada === rodada).sort((a, b) => b.pontuacao - a.pontuacao);
}

/** Horas de plantão já jogadas pelo grupo (mínimo de 1 minuto, para não dividir por zero). */
export function horasJogadas(item: ItemRanking): number {
  return Math.max(1, item.minuto - MINUTO_INICIO) / 60;
}

/** Carga do gestor (design.md §9): quanto o grupo precisou decidir e apagar incêndio. */
export interface CargaGestor {
  decisoes: number;
  decisoesPorHora: number;
  reativas: number;
  produtivas: number;
  /** Fração de decisões reativas, 0..100; 0 sem decisões. */
  pctReativas: number;
  alertas: number;
  alertasPorHora: number;
  /** Trabalho feito pelas ferramentas automáticas do Lean. */
  automatico: number;
}

export function cargaDoGestor(item: ItemRanking): CargaGestor {
  const h = horasJogadas(item);
  const decisoes = metrica(item, 'decisoes');
  const reativas = metrica(item, 'decisoesReativas');
  const produtivas = metrica(item, 'decisoesProdutivas');
  const alertas = metrica(item, 'alertas');
  const classificadas = reativas + produtivas;
  return {
    decisoes,
    decisoesPorHora: decisoes / h,
    reativas,
    produtivas,
    pctReativas: classificadas > 0 ? (reativas / classificadas) * 100 : 0,
    alertas,
    alertasPorHora: alertas / h,
    automatico:
      metrica(item, 'autoFluxista') +
      metrica(item, 'autoDischargeLounge') +
      metrica(item, 'autoFastTrack') +
      metrica(item, 'autoCirurgiasViabilizadas'),
  };
}

/** Indicadores da turma numa rodada (somas e médias entre os grupos). */
export interface ResumoRodada {
  grupos: number;
  pontuacaoMedia: number;
  boardingHoras: number;
  deterioracoes: number;
  obitos: number;
  cancelamentos: number;
  altas: number;
  lwbs: number;
  /** Média do % de pacientes no tempo-alvo de Manchester. */
  slaMedio: number;
  decisoesPorHora: number;
  pctReativas: number;
  alertasPorHora: number;
  automatico: number;
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

export function resumoRodada(itens: ItemRanking[]): ResumoRodada {
  const cargas = itens.map(cargaDoGestor);
  const reativas = soma(cargas.map((c) => c.reativas));
  const classificadas = reativas + soma(cargas.map((c) => c.produtivas));
  return {
    grupos: itens.length,
    pontuacaoMedia: media(itens.map((i) => i.pontuacao)),
    boardingHoras: soma(itens.map((i) => metrica(i, 'bH'))),
    deterioracoes: soma(itens.map((i) => metrica(i, 'det'))),
    obitos: soma(itens.map((i) => metrica(i, 'dth'))),
    cancelamentos: soma(itens.map((i) => metrica(i, 'cxC'))),
    altas: soma(itens.map((i) => metrica(i, 'dis'))),
    lwbs: soma(itens.map((i) => metrica(i, 'lw'))),
    slaMedio: media(itens.map((i) => metrica(i, 'slaPct'))),
    decisoesPorHora: media(cargas.map((c) => c.decisoesPorHora)),
    pctReativas: classificadas > 0 ? (reativas / classificadas) * 100 : 0,
    alertasPorHora: media(cargas.map((c) => c.alertasPorHora)),
    automatico: soma(cargas.map((c) => c.automatico)),
  };
}

/** Uma linha do comparativo R1 × R2 por grupo. */
export interface LinhaComparativa {
  grupoId: string;
  nome: string;
  cor: string;
  r1: ItemRanking | undefined;
  r2: ItemRanking | undefined;
  /** Pontuação R2 − R1, quando o grupo jogou as duas. */
  ganho: number | null;
}

/** Ordena pela pontuação da R2 (e, sem R2, pela R1). */
export function comparativo(ranking: ItemRanking[]): LinhaComparativa[] {
  const porGrupo = new Map<string, LinhaComparativa>();
  for (const item of ranking) {
    const linha = porGrupo.get(item.grupoId) ?? {
      grupoId: item.grupoId,
      nome: item.nome,
      cor: item.cor,
      r1: undefined,
      r2: undefined,
      ganho: null,
    };
    if (item.rodada === 1) linha.r1 = item;
    else linha.r2 = item;
    porGrupo.set(item.grupoId, linha);
  }
  const linhas = [...porGrupo.values()].map((l) => ({
    ...l,
    ganho: l.r1 && l.r2 ? l.r2.pontuacao - l.r1.pontuacao : null,
  }));
  // Ranking final: melhora do Travado para o Lean; empate pela pontuação do Lean.
  return linhas.sort(
    (a, b) =>
      (b.ganho ?? -Infinity) - (a.ganho ?? -Infinity) ||
      (b.r2?.pontuacao ?? -Infinity) - (a.r2?.pontuacao ?? -Infinity),
  );
}

/**
 * Frases da mensagem do Lean a partir dos números reais da turma
 * (design.md §9: menos sobrecarga do gestor). Só afirma o que os dados mostram.
 */
export function mensagensLean(r1: ResumoRodada, r2: ResumoRodada): string[] {
  if (r1.grupos === 0 || r2.grupos === 0) return [];
  const frases: string[] = [];
  const queda = (a: number, b: number) => (a > 0 ? Math.round(((a - b) / a) * 100) : 0);

  const qDec = queda(r1.decisoesPorHora, r2.decisoesPorHora);
  if (qDec > 0) frases.push(`Os grupos precisaram decidir ${qDec}% menos por hora no Lean.`);
  if (r2.pctReativas < r1.pctReativas)
    frases.push(
      `As decisões reativas (apagar incêndio) caíram de ${Math.round(r1.pctReativas)}% para ${Math.round(r2.pctReativas)}% do total.`,
    );
  const qAlertas = queda(r1.alertasPorHora, r2.alertasPorHora);
  if (qAlertas > 0) frases.push(`Os alertas e crises por hora caíram ${qAlertas}%.`);
  if (r2.automatico > 0)
    frases.push(`As ferramentas automáticas fizeram ${r2.automatico} tarefas que, no Travado, dependiam do gestor.`);
  const qBoarding = queda(r1.boardingHoras, r2.boardingHoras);
  if (qBoarding > 0) frases.push(`O boarding total da turma caiu ${qBoarding}%.`);
  if (r1.obitos > r2.obitos) frases.push(`Óbitos evitáveis: ${r1.obitos} no Travado, ${r2.obitos} no Lean.`);
  return frases;
}
