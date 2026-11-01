import { describe, expect, it } from 'vitest';
import type { ItemRanking } from '../../shared/schemas';
import { comSinal, horas, listaNatural, porcento, tempoDecorrido } from '../logica/formato';
import { cargaDoGestor, comparativo, itensDaRodada, mensagensLean, resumoRodada } from '../logica/metricas';
import { acrescentar, variacaoUmaHora } from '../logica/tendencias';

const item = (
  grupoId: string,
  rodada: 1 | 2,
  pontuacao: number,
  metricas: Record<string, number>,
  minuto = 1140,
): ItemRanking => ({
  grupoId,
  nome: `Grupo ${grupoId}`,
  cor: '#2563EB',
  rodada,
  pontuacao,
  minuto,
  metricas,
});

describe('carga do gestor', () => {
  it('calcula decisões e alertas por hora jogada', () => {
    const c = cargaDoGestor(
      item('a', 1, 900, { decisoes: 120, decisoesReativas: 90, decisoesProdutivas: 30, alertas: 48 }),
    );
    expect(c.decisoesPorHora).toBe(10);
    expect(c.pctReativas).toBe(75);
    expect(c.alertasPorHora).toBe(4);
  });

  it('tolera métricas ausentes (placar antigo)', () => {
    const c = cargaDoGestor(item('a', 1, 900, {}, 420));
    expect(c.decisoes).toBe(0);
    expect(c.pctReativas).toBe(0);
    expect(Number.isFinite(c.decisoesPorHora)).toBe(true);
  });
});

describe('comparativo R1 × R2', () => {
  const ranking = [
    item('a', 1, 800, { bH: 30 }),
    item('b', 1, 900, { bH: 20 }),
    item('a', 2, 1500, { bH: 8 }),
    item('b', 2, 1300, { bH: 6 }),
    item('c', 1, 700, {}),
  ];

  it('separa por rodada e ordena pela pontuação', () => {
    expect(itensDaRodada(ranking, 1).map((i) => i.grupoId)).toEqual(['b', 'a', 'c']);
  });

  it('cruza as rodadas por grupo e calcula o ganho', () => {
    const linhas = comparativo(ranking);
    expect(linhas.map((l) => [l.grupoId, l.ganho])).toEqual([
      ['a', 700],
      ['b', 400],
      ['c', null],
    ]);
  });

  it('resume a turma e escreve a mensagem do Lean só com o que os dados mostram', () => {
    const r1 = resumoRodada([
      item('a', 1, 800, { bH: 30, decisoes: 144, decisoesReativas: 100, decisoesProdutivas: 44, alertas: 60, dth: 2 }),
    ]);
    const r2 = resumoRodada([
      item('a', 2, 1500, {
        bH: 9,
        decisoes: 72,
        decisoesReativas: 20,
        decisoesProdutivas: 52,
        alertas: 24,
        dth: 0,
        autoFluxista: 30,
      }),
    ]);
    const frases = mensagensLean(r1, r2);
    expect(frases).toContain('Os grupos precisaram decidir 50% menos por hora no Lean.');
    expect(frases.some((f) => f.includes('69% para 28%'))).toBe(true);
    expect(frases).toContain('O boarding total da turma caiu 70%.');
    expect(frases).toContain('Óbitos evitáveis: 2 no Travado, 0 no Lean.');
    expect(mensagensLean(r1, resumoRodada([]))).toEqual([]);
  });
});

describe('tendência da pontuação', () => {
  it('guarda um ponto a cada ~30 min e calcula a variação em 1 h', () => {
    let h = acrescentar(new Map(), [item('a', 1, 1500, {}, 420)]);
    for (let m = 421; m <= 540; m++) h = acrescentar(h, [item('a', 1, 1500 - (m - 420), {}, m)]);
    const pontos = h.get('a')!;
    expect(pontos.length).toBeGreaterThanOrEqual(4);
    expect(pontos[pontos.length - 1]).toEqual({ minuto: 540, pontuacao: 1380 });
    expect(variacaoUmaHora(pontos)).toBeLessThan(0);
  });

  it('devolve o mesmo histórico quando nada mudou', () => {
    const h = acrescentar(new Map(), [item('a', 1, 1500, {}, 600)]);
    expect(acrescentar(h, [item('a', 1, 1500, {}, 600)])).toBe(h);
  });
});

describe('formato', () => {
  it('usa a norma pt-BR', () => {
    expect(horas(12.5)).toBe('12,5 h');
    expect(porcento(82.4)).toBe('82%');
    expect(comSinal(-3)).toBe('−3');
    expect(comSinal(12)).toBe('+12');
    expect(listaNatural(['A', 'B', 'C'])).toBe('A, B e C');
    expect(tempoDecorrido(48)).toBe('48 s');
  });
});
