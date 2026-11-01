import { describe, it, expect } from 'vitest';
import { ESTRATEGIAS, leitoInadequado, passivo, puxaFluxo, seguraNoPs, simularPartida, type ResultadoPartida } from '../estrategias';
import { criarEstadoInicial, MINUTO_FIM } from '../motor';
import type { Rodada } from '../types';

const SEMENTES = Array.from({ length: 30 }, (_, i) => i + 1);

function media(xs: number[]): number {
  return xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN;
}

function desvio(xs: number[]): number {
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

const um = (x: number): number => Math.round(x * 10) / 10;
const hora = (m: number): string => (Number.isNaN(m) ? '—' : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`);

export function resumir(rs: ResultadoPartida[]): Record<string, unknown> {
  const pts = rs.map(r => r.pontuacao);
  const lotou = rs.filter(r => r.deLotadoEm !== null).map(r => r.deLotadoEm!);
  const col = (f: (r: ResultadoPartida) => number): number => um(media(rs.map(f)));
  return {
    pontos: um(media(pts)),
    dp: um(desvio(pts)),
    deLotaEm: hora(media(lotou)),
    pctLota: Math.round((lotou.length / rs.length) * 100),
    lota10a13: Math.round((lotou.filter(m => m >= 600 && m <= 780).length / rs.length) * 100),
    picoBoard: col(r => r.picoBoarding),
    boardH: col(r => r.metricas.bH),
    det: col(r => r.metricas.det),
    obitos: col(r => r.metricas.dth),
    cxCanc: col(r => r.metricas.cxC),
    lwbs: col(r => r.metricas.lw),
    slaPct: col(r => r.metricas.slaPct),
    altas12h: col(r => r.altasAteMeioDia),
    altaHosp: col(r => r.metricas.altaHosp),
    leitoInad: col(r => r.metricas.leitoInadequado),
    decH: col(r => r.metricas.decisoes / 12),
    reativas: col(r => r.metricas.decisoesReativas),
    alertas: col(r => r.metricas.alertas),
    autoFlux: col(r => r.metricas.autoFluxista),
    autoLounge: col(r => r.metricas.autoDischargeLounge),
    autoFT: col(r => r.metricas.autoFastTrack),
    autoCx: col(r => r.metricas.autoCirurgiasViabilizadas),
    nir: col(r => r.estado.ferramentas.nirUsos),
    emerg: col(r => r.metricas.emergencias),
    emergSemSala: col(r => r.metricas.emergenciasSemSala),
  };
}

describe('robôs de decisão', () => {
  it('passivo nunca age', () => {
    expect(passivo(criarEstadoInicial(1, 1))).toBeNull();
  });

  it('puxaFluxo e leitoInadequado começam internando quem está em boarding', () => {
    const e = criarEstadoInicial(1, 1);
    expect(puxaFluxo(e)).toMatchObject({ tipo: 'mover' });
    expect(leitoInadequado(e)).toMatchObject({ tipo: 'mover' });
  });

  it('seguraNoPs começa dando alta do DE', () => {
    expect(seguraNoPs(criarEstadoInicial(1, 1))).toMatchObject({ tipo: 'mover', destino: 'alta' });
  });

  it('simularPartida joga 720 minutos e é reprodutível', () => {
    const a = simularPartida(puxaFluxo, 2, 7);
    expect(a.estado.minuto).toBe(MINUTO_FIM);
    expect(a.estado.versao).toBe(720 + a.acoes);
    expect(simularPartida(puxaFluxo, 2, 7).pontuacao).toBe(a.pontuacao);
  });

  it('calibração: 30 sementes por estratégia por rodada', () => {
    const linhas: Record<string, unknown>[] = [];
    const pontos: Record<string, number> = {};
    for (const [nome, estrategia] of Object.entries(ESTRATEGIAS)) {
      for (const rodada of [1, 2] as Rodada[]) {
        const rs = SEMENTES.map(s => simularPartida(estrategia, rodada, s));
        const resumo = resumir(rs);
        const linha = { estrategia: nome, rodada: `R${rodada}`, ...resumo };
        pontos[`${nome}-R${rodada}`] = resumo.pontos as number;
        linhas.push(linha);
      }
    }
    console.table(linhas);
    // Alvos pedagógicos (Portão 2): jogar bem compensa, e a R2 bem jogada supera a R1 bem jogada
    expect(pontos['puxaFluxo-R2']!).toBeGreaterThan(pontos['puxaFluxo-R1']!);
    expect(pontos['puxaFluxo-R1']!).toBeGreaterThan(pontos['passivo-R1']!);
    expect(pontos['puxaFluxo-R2']!).toBeGreaterThan(pontos['passivo-R2']!);
  }, 180_000);
});
