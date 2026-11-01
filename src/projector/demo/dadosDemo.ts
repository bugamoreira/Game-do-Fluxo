// Dados FALSOS para o modo demonstração do telão (projetor.html?demo=1).
// Nunca usar fora de src/projector/demo/.

import type { EstadoTurma, ItemRanking, Metricas, PontoSerieTurma, Rodada, StatusTurma } from '../../shared/schemas';

export type FaseDemo = 'aberta' | 'rodada1' | 'debrief' | 'rodada2' | 'encerrada';

export const FASES_DEMO: FaseDemo[] = ['aberta', 'rodada1', 'debrief', 'rodada2', 'encerrada'];

export function lerFaseDemo(valor: string | null): FaseDemo {
  return FASES_DEMO.includes(valor as FaseDemo) ? (valor as FaseDemo) : 'rodada1';
}

interface GrupoDemo {
  id: string;
  nome: string;
  cor: string;
  /** Quanto o grupo sofre no plantão (1 = médio). */
  dificuldade: number;
}

const GRUPOS: GrupoDemo[] = [
  { id: 'g1', nome: 'Copacabana', cor: '#2563EB', dificuldade: 0.7 },
  { id: 'g2', nome: 'Ipanema', cor: '#7C3AED', dificuldade: 0.95 },
  { id: 'g3', nome: 'Leblon', cor: '#DB2777', dificuldade: 1.1 },
  { id: 'g4', nome: 'Urca', cor: '#0E7490', dificuldade: 0.85 },
  { id: 'g5', nome: 'Botafogo', cor: '#0F766E', dificuldade: 1.25 },
  { id: 'g6', nome: 'Santa Teresa', cor: '#8B5E3C', dificuldade: 1.0 },
  { id: 'g7', nome: 'Barra', cor: '#A21CAF', dificuldade: 0.8 },
];

/** Minuto em que cada rodada de demonstração começa a contar (10:30). */
export const MINUTO_INICIAL_DEMO = 630;

function metricasDemo(g: GrupoDemo, rodada: Rodada, minuto: number): { pontuacao: number; metricas: Metricas } {
  const f = Math.max(0, Math.min(1, (minuto - 420) / 720));
  const k = g.dificuldade;
  if (rodada === 1) {
    const dth = Math.floor(f * f * 3.2 * k);
    const det = Math.floor(f * 7 * k);
    const cxC = Math.floor(f * 3.6 * k);
    const lw = Math.floor(f * 2.5 * k);
    const bH = Math.round(f * f * 42 * k * 10) / 10;
    const boarding = Math.min(12, Math.round(2 + f * 8 * k));
    const pontuacao = Math.max(0, Math.round(1000 - dth * 80 - det * 18 - cxC * 30 - lw * 15 - bH * 4 + f * 160));
    return {
      pontuacao,
      metricas: {
        dis: Math.round(f * 18), det, dth, cxC, lw, bH, boarding,
        deOcc: Math.min(15, Math.round(8 + f * 7 * k)), corredor: Math.max(0, Math.round((f - 0.4) * 6 * k)),
        altaHosp: Math.round(f * 20 / k), decisoes: Math.round(f * 150 * k), decisoesReativas: Math.round(f * 104 * k),
        decisoesProdutivas: Math.round(f * 46 * k), alertas: Math.round(f * 60 * k),
        autoFluxista: 0, autoDischargeLounge: 0, autoCirurgiasViabilizadas: 0,
      },
    };
  }
  const k2 = 0.35 + k * 0.4;
  const dth = Math.floor(f * 1.4 * k2);
  const det = Math.floor(f * 3 * k2);
  const cxC = Math.floor(f * 1.2 * k2);
  const bH = Math.round(f * 11 * k2 * 10) / 10;
  const pontuacao = Math.max(0, Math.round(1000 - dth * 120 - det * 25 - cxC * 40 - bH * 6 + f * 520 / k2));
  return {
    pontuacao,
    metricas: {
      dis: Math.round(f * 26), det, dth, cxC, lw: 0, bH, boarding: Math.round(1 + f * 2 * k2),
      deOcc: Math.round(7 + f * 3 * k2), corredor: 0, altaHosp: Math.round(f * 30),
      decisoes: Math.round(f * 70 * k2), decisoesReativas: Math.round(f * 18 * k2), decisoesProdutivas: Math.round(f * 52 * k2),
      alertas: Math.round(f * 18 * k2), autoFluxista: Math.floor(f * (36 + k * 10)), autoDischargeLounge: Math.floor(f * (20 + k * 8)),
      autoCirurgiasViabilizadas: Math.floor(f * (5 + k * 4)),
    },
  };
}

function item(g: GrupoDemo, rodada: Rodada, minuto: number): ItemRanking {
  return { grupoId: g.id, nome: g.nome, cor: g.cor, rodada, minuto, ...metricasDemo(g, rodada, minuto) };
}

export function turmaDemo(fase: FaseDemo, minuto: number, agora: number): EstadoTurma {
  const status: StatusTurma = fase;
  const rodada: Rodada | null = fase === 'rodada1' || fase === 'debrief' ? 1 : fase === 'aberta' ? null : 2;
  const emRodada = fase === 'rodada1' || fase === 'rodada2';
  const grupos = (fase === 'aberta' ? GRUPOS.slice(0, 6) : GRUPOS).map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, conectado: true }));
  return {
    id: 'turma-demo',
    codigo: 'CBMEDE',
    nome: 'Turma de demonstração',
    evento: 'CBMEDE 2026',
    status,
    rodada,
    rodadaInicio: emRodada ? new Date(agora - (minuto - 420) * 1000).toISOString() : null,
    pausada: false,
    pausaAcumuladaMs: 0,
    minuto: emRodada ? minuto : null,
    horaServidor: new Date(agora).toISOString(),
    entradaLiberada: fase === 'aberta',
    fullCapacityLiberado: false,
    musicaMudo: false,
    grupos,
  };
}

export function rankingDemo(fase: FaseDemo, minuto: number): ItemRanking[] {
  if (fase === 'aberta') return [];
  const r1Minuto = fase === 'rodada1' ? minuto : 1140;
  const lista = GRUPOS.map((g) => item(g, 1, r1Minuto));
  if (fase === 'rodada2' || fase === 'encerrada') {
    const r2Minuto = fase === 'rodada2' ? minuto : 1140;
    lista.push(...GRUPOS.map((g) => item(g, 2, r2Minuto)));
  }
  return lista;
}

/** Séries falsas (um ponto a cada 30 min) das rodadas já jogadas na fase pedida. */
export function seriesDemo(fase: FaseDemo, minuto: number): PontoSerieTurma[] {
  const rodadas: { rodada: Rodada; ate: number }[] = [];
  if (fase === 'rodada1') rodadas.push({ rodada: 1, ate: minuto });
  if (fase === 'debrief' || fase === 'rodada2' || fase === 'encerrada') rodadas.push({ rodada: 1, ate: 1140 });
  if (fase === 'rodada2') rodadas.push({ rodada: 2, ate: minuto });
  if (fase === 'encerrada') rodadas.push({ rodada: 2, ate: 1140 });
  const pontos: PontoSerieTurma[] = [];
  for (const g of GRUPOS) {
    for (const { rodada, ate } of rodadas) {
      for (let m = 420; m <= ate; m += 30) {
        pontos.push({ grupoId: g.id, nome: g.nome, cor: g.cor, rodada, minuto: m, metricas: metricasDemo(g, rodada, m).metricas });
      }
    }
  }
  return pontos;
}
