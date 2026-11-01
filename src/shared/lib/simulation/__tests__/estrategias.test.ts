import { describe, it, expect } from 'vitest';
import { ESTRATEGIAS, foraDoPerfil, passivo, puxaFluxo, seguraNoPs, simularPartida } from '../estrategias';
import { criarEstadoInicial, MINUTO_FIM } from '../motor';
import type { Rodada } from '../types';

const SEMENTES = Array.from({ length: 20 }, (_, i) => i + 1);

function media(xs: number[]): number {
  return xs.reduce((a, x) => a + x, 0) / xs.length;
}

function desvio(xs: number[]): number {
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

const r1 = (x: number): number => Math.round(x * 10) / 10;

describe('robôs de decisão', () => {
  it('passivo nunca age', () => {
    expect(passivo(criarEstadoInicial(1, 1))).toBeNull();
  });

  it('puxaFluxo e foraDoPerfil começam internando quem está em boarding', () => {
    const e = criarEstadoInicial(1, 1);
    expect(puxaFluxo(e)).toMatchObject({ tipo: 'mover' });
    expect(foraDoPerfil(e)).toMatchObject({ tipo: 'mover' });
  });

  it('seguraNoPs só dá alta do DE ou interna quem está perto de deteriorar', () => {
    const a = seguraNoPs(criarEstadoInicial(1, 1));
    expect(a).toMatchObject({ tipo: 'mover', destino: 'alta' });
  });

  it('simularPartida joga 720 minutos e é reprodutível', () => {
    const a = simularPartida(puxaFluxo, 2, 7);
    expect(a.estado.minuto).toBe(MINUTO_FIM);
    expect(a.estado.versao).toBe(720 + a.acoes);
    expect(simularPartida(puxaFluxo, 2, 7).pontuacao).toBe(a.pontuacao);
  });

  it('20 sementes por estratégia por rodada (tabela para a sessão de pontuação)', () => {
    const linhas: Record<string, unknown>[] = [];
    const medias: Record<string, number> = {};
    for (const [nome, estrategia] of Object.entries(ESTRATEGIAS)) {
      for (const rodada of [1, 2] as Rodada[]) {
        const rs = SEMENTES.map(s => simularPartida(estrategia, rodada, s));
        const pts = rs.map(r => r.pontuacao);
        const col = (f: (m: (typeof rs)[number]['metricas']) => number): number => r1(media(rs.map(r => f(r.metricas))));
        medias[`${nome}-R${rodada}`] = media(pts);
        linhas.push({
          estrategia: nome,
          rodada: `R${rodada}`,
          pontos: r1(media(pts)),
          dp: r1(desvio(pts)),
          min: Math.min(...pts),
          max: Math.max(...pts),
          boardH: col(m => m.bH),
          det: col(m => m.det),
          obitos: col(m => m.dth),
          cxCanc: col(m => m.cxC),
          lwbs: col(m => m.lw),
          foraPerfil: col(m => m.off),
          social: col(m => m.soc),
          altaHosp: col(m => m.altaHosp),
          libDE: col(m => m.libDE),
          acoes: r1(media(rs.map(r => r.acoes))),
        });
      }
    }
    console.table(linhas);
    for (const v of Object.values(medias)) {
      expect(v).toBeGreaterThanOrEqual(50);
      expect(v).toBeLessThanOrEqual(5000);
    }
  }, 120_000);
});
