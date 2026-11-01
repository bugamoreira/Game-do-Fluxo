import { describe, expect, it } from 'vitest';
import type { ItemRanking, Metricas } from '../../shared/schemas';
import {
  MemoriaEventos,
  classificacaoFinal,
  comparativoTurma,
  detectarEventos,
  faseDoTelao,
  itensDaRodada,
  rodadaEmFoco,
  tensaoDaTurma,
} from '../derivar';
import { rankingDemo, turmaDemo } from '../demo/dadosDemo';

function item(grupoId: string, rodada: 1 | 2, pontuacao: number, metricas: Metricas = {}, minuto = 700): ItemRanking {
  return { grupoId, nome: `Grupo ${grupoId}`, cor: '#2563EB', rodada, pontuacao, metricas, minuto };
}

describe('fase e rodada do telão', () => {
  it('segue o status da turma', () => {
    expect(faseDoTelao(null)).toBe('aguardando');
    expect(faseDoTelao(turmaDemo('aberta', 420, 0))).toBe('aberta');
    expect(faseDoTelao(turmaDemo('rodada2', 700, 0))).toBe('rodada');
    expect(faseDoTelao(turmaDemo('debrief', 420, 0))).toBe('debrief');
    expect(faseDoTelao({ ...turmaDemo('encerrada', 420, 0), status: 'arquivada' })).toBe('final');
    expect(rodadaEmFoco(turmaDemo('debrief', 420, 0))).toBe(1);
    expect(rodadaEmFoco(turmaDemo('encerrada', 420, 0))).toBe(2);
  });
});

describe('ranking', () => {
  it('filtra a rodada e ordena pelo placar', () => {
    const lista = itensDaRodada([item('a', 1, 500), item('b', 1, 900), item('c', 2, 2000)], 1);
    expect(lista.map((i) => i.grupoId)).toEqual(['b', 'a']);
  });

  it('pódio usa a rodada 2 e, se faltar, a 1', () => {
    const c = classificacaoFinal([item('a', 1, 900), item('a', 2, 1200), item('b', 1, 1100)]);
    expect(c.map((g) => [g.grupoId, g.final])).toEqual([['a', 1200], ['b', 1100]]);
  });
});

describe('tensão da turma', () => {
  it('zero sem grupos; sobe com boarding e óbito', () => {
    expect(tensaoDaTurma([], 1)).toBe(0);
    const calmo = tensaoDaTurma([item('a', 1, 0, { boarding: 1 })], 1);
    const ruim = tensaoDaTurma([item('a', 1, 0, { boarding: 8, deOcc: 15, dth: 1 })], 1);
    expect(ruim).toBeGreaterThan(calmo);
    expect(ruim).toBeGreaterThanOrEqual(0.85);
  });
});

describe('eventos marcantes', () => {
  it('não anuncia a primeira leitura e detecta a variação seguinte', () => {
    const anterior = new Map<string, Metricas>();
    expect(detectarEventos(anterior, [item('a', 1, 0, { dth: 1, det: 2 })], 1).novos).toHaveLength(0);
    const r = detectarEventos(anterior, [item('a', 1, 0, { dth: 2, det: 4 })], 1);
    expect(r.novos.map((e) => e.texto)).toEqual(['Óbito no plantão', '2 pacientes deterioraram']);
    expect(r.som).toBe('death');
  });

  it('ferramentas automáticas só contam no Lean', () => {
    const anterior = new Map<string, Metricas>([['a', { autoFluxista: 0 }]]);
    expect(detectarEventos(anterior, [item('a', 1, 0, { autoFluxista: 1 })], 1).novos).toHaveLength(0);
    anterior.set('a', { autoFluxista: 0 });
    const r = detectarEventos(anterior, [item('a', 2, 0, { autoFluxista: 1 })], 2);
    expect(r.novos[0]?.problema).toBe(false);
    expect(r.som).toBe('fluxista');
  });

  it('a memória guarda os últimos e zera na troca de rodada', () => {
    const mem = new MemoriaEventos(2);
    mem.registrar([item('a', 1, 0, { det: 0 })], 1);
    for (let d = 1; d <= 3; d++) mem.registrar([item('a', 1, 0, { det: d })], 1);
    expect(mem.eventos()).toHaveLength(2);
    mem.registrar([item('a', 2, 0, { det: 9 })], 2);
    expect(mem.eventos()).toHaveLength(0);
  });
});

describe('comparativo R1 × R2', () => {
  it('mostra a carga do gestor quando o motor manda os dados', () => {
    const linhas = comparativoTurma(rankingDemo('encerrada', 1140));
    expect(linhas.map((l) => l.rotulo)).toContain('Decisões por hora');
    const obitos = linhas.find((l) => l.rotulo === 'Óbitos (turma)')!;
    expect(obitos.r2!).toBeLessThan(obitos.r1!);
  });

  it('sem métricas de carga, não inventa linha', () => {
    const linhas = comparativoTurma([item('a', 1, 900, { dth: 1 }), item('a', 2, 1100, {})]);
    expect(linhas.map((l) => l.rotulo)).not.toContain('Alertas por hora');
  });
});
