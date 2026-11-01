import { describe, expect, it } from 'vitest';
import { calcScore } from '../../shared/lib/game-engine';
import { DadosRelatorioInvalidos, lerDadosRelatorio } from '../dados';
import { gerarDadosDemo } from '../demo/gerarDemo';
import { BONUS_SEM_OBITO, PONTUACAO, PONTUACAO_INICIAL, PONTUACAO_MINIMA } from '../regras';
import {
  alertasHorarios,
  dataPorExtenso,
  montarGrupos,
  montarRelatorio,
  ordenarRankingFinal,
  serieHoraria,
  variacaoPct,
} from '../transformar';

const G1 = 'g1';
const G2 = 'g2';
const G3 = 'g3';

function dadosBase(extra: Record<string, unknown> = {}) {
  return {
    turma: { id: 't', codigo: 'CBMEDE', nome: 'Turma A', evento: 'CBMEDE 2026', data: '2026-11-25' },
    gerado_em: '2026-11-25T18:00:00Z',
    versao_regras: null,
    grupos: [
      { id: G1, nome: 'Alfa', cor: '#2563EB', rodada_entrada: 1 },
      { id: G2, nome: 'Beta', cor: '#7C3AED', rodada_entrada: 1 },
      { id: G3, nome: 'Gama', cor: '#DB2777', rodada_entrada: 1 },
    ],
    ranking: {
      rodada1: [
        { posicao: 1, grupo_id: G1, nome: 'Alfa', cor: '#2563EB', rodada: 1, pontuacao: 900, minuto: 1140, metricas: { bH: 20, det: 3, dth: 1, decisoes: 60, decisoesReativas: 12, alertas: 24 } },
        { posicao: 2, grupo_id: G2, nome: 'Beta', cor: '#7C3AED', rodada: 1, pontuacao: 700, minuto: 1140, metricas: { bH: 30, det: 5, dth: 2, decisoes: 48, decisoesReativas: 24, alertas: 36 } },
        { posicao: 3, grupo_id: G3, nome: 'Gama', cor: '#DB2777', rodada: 1, pontuacao: 500, minuto: 1140, metricas: { bH: 40, det: 6, dth: 2 } },
      ],
      rodada2: [
        { posicao: 1, grupo_id: G2, nome: 'Beta', cor: '#7C3AED', rodada: 2, pontuacao: 1400, minuto: 1140, metricas: { bH: 5, det: 0, dth: 0, decisoes: 36, decisoesReativas: 0, alertas: 6, autoFluxista: 4 } },
        { posicao: 2, grupo_id: G1, nome: 'Alfa', cor: '#2563EB', rodada: 2, pontuacao: 1300, minuto: 1140, metricas: { bH: 10, det: 1, dth: 0, decisoes: 36, decisoesReativas: 6, alertas: 6, autoFluxista: 2 } },
      ],
    },
    placar: [],
    series: [],
    eventos: [],
    ...extra,
  };
}

describe('lerDadosRelatorio', () => {
  it('aceita o formato gravado por gerar_relatorio', () => {
    const d = lerDadosRelatorio(dadosBase());
    expect(d.grupos).toHaveLength(3);
    expect(d.ranking?.rodada2).toHaveLength(2);
  });

  it('descarta itens malformados e métricas não numéricas sem derrubar o relatório', () => {
    const d = lerDadosRelatorio(
      dadosBase({
        placar: [{ grupo_id: G1, rodada: 3, pontuacao: 1 }, { foo: 'bar' }],
        series: [{ grupo_id: G1, rodada: 1, minuto: 420, metricas: { deOcc: 8, nota: 'x', nan: Number.NaN } }],
      }),
    );
    expect(d.placar).toHaveLength(0);
    expect(d.series[0]!.metricas).toEqual({ deOcc: 8 });
  });

  it('recusa quando falta a estrutura mínima', () => {
    expect(() => lerDadosRelatorio({ grupos: [] })).toThrow(DadosRelatorioInvalidos);
    expect(() => lerDadosRelatorio(null)).toThrow(DadosRelatorioInvalidos);
  });
});

describe('ranking final', () => {
  it('ordena pela pontuação do Plantão Lean e põe quem não jogou a R2 no fim', () => {
    const grupos = montarGrupos(lerDadosRelatorio(dadosBase()));
    expect(grupos.map(g => g.nome)).toEqual(['Beta', 'Alfa', 'Gama']);
    expect(grupos.map(g => g.posicao)).toEqual([1, 2, 3]);
    expect(grupos[0]!.evolucao).toBe(700);
    expect(grupos[2]!.r2).toBeNull();
    expect(grupos[2]!.evolucao).toBeNull();
  });

  it('desempata pela soma das duas rodadas e depois pelo nome', () => {
    const r = (p: number) => ({ pontuacao: p, metricas: {} });
    const ordem = ordenarRankingFinal([
      { nome: 'B', r1: r(500), r2: r(1000) },
      { nome: 'A', r1: r(800), r2: r(1000) },
      { nome: 'C', r1: r(500), r2: r(1000) },
    ]);
    expect(ordem.map(g => g.nome)).toEqual(['A', 'B', 'C']);
  });

  it('usa o placar quando o ranking congelado não tem o grupo', () => {
    const grupos = montarGrupos(
      lerDadosRelatorio(
        dadosBase({ placar: [{ grupo_id: G3, rodada: 2, minuto: 1140, pontuacao: 1500, metricas: { bH: 1 } }] }),
      ),
    );
    expect(grupos[0]!.nome).toBe('Gama');
    expect(grupos[0]!.r2?.metricas.bH).toBe(1);
  });
});

describe('resumo das rodadas e carga do gestor', () => {
  it('soma métricas, calcula decisões e alertas por hora e a fração reativa', () => {
    const v = montarRelatorio(lerDadosRelatorio(dadosBase()));
    expect(v.rodadas[1].grupos).toBe(3);
    expect(v.rodadas[1].totais.bH).toBe(90);
    expect(v.rodadas[1].pontuacaoMedia).toBe(700);
    // decisões: (60 + 48) / 3 grupos / 12 h
    expect(v.rodadas[1].decisoesPorHora).toBeCloseTo(3);
    expect(v.rodadas[1].fracaoReativas).toBeCloseTo(36 / 108);
    expect(v.rodadas[2].alertasPorHora).toBeCloseTo(12 / 2 / 12);
    expect(v.rodadas[2].totais.autoFluxista).toBe(6);
  });

  it('gera mensagens-chave com os números da turma', () => {
    const v = montarRelatorio(lerDadosRelatorio(dadosBase()));
    const texto = v.mensagens.join(' ');
    expect(texto).toContain('subiu');
    expect(texto).toContain('90 h para 15 h');
    expect(texto).toContain('Maior evolução da turma: Beta');
  });

  it('avisa quando falta uma das rodadas', () => {
    const v = montarRelatorio(lerDadosRelatorio(dadosBase({ ranking: { rodada1: [], rodada2: [] } })));
    expect(v.mensagens[0]).toContain('não tem resultado das duas rodadas');
  });
});

describe('séries por hora', () => {
  const series = [
    { grupo_id: G1, rodada: 1 as const, minuto: 420, metricas: { boarding: 2 } },
    { grupo_id: G1, rodada: 1 as const, minuto: 450, metricas: { boarding: 4 } },
    { grupo_id: G1, rodada: 1 as const, minuto: 480, metricas: { boarding: 6 } },
    { grupo_id: G2, rodada: 1 as const, minuto: 420, metricas: { boarding: 0 } },
    { grupo_id: G2, rodada: 1 as const, minuto: 510, metricas: { boarding: 10 } },
    { grupo_id: G1, rodada: 2 as const, minuto: 420, metricas: { boarding: 1 } },
  ];

  it('usa o último ponto de cada grupo até o horário e tira a média da turma', () => {
    const h = serieHoraria(series, m => m.boarding);
    expect(h).toHaveLength(13);
    expect(h[0]).toEqual({ hora: 7, r1: 1, r2: 1 });
    // 8h: G1 = 6 (480), G2 = 0 (420; o de 510 é depois)
    expect(h[1]).toEqual({ hora: 8, r1: 3, r2: 1 });
    // 9h: G1 = 6, G2 = 10
    expect(h[2]!.r1).toBe(8);
  });

  it('devolve null quando não há dado', () => {
    const h = serieHoraria([], m => m.boarding);
    expect(h.every(p => p.r1 === null && p.r2 === null)).toBe(true);
  });

  it('conta alertas por hora por grupo, só dos tipos de alerta', () => {
    const eventos = [
      { grupo_id: G1, rodada: 1 as const, minuto: 425, tipo: 'deterioracao' },
      { grupo_id: G2, rodada: 1 as const, minuto: 470, tipo: 'cirurgia_cancelada' },
      { grupo_id: G2, rodada: 1 as const, minuto: 1140, tipo: 'obito' },
      { grupo_id: G1, rodada: 2 as const, minuto: 430, tipo: 'surto' },
    ];
    const a = alertasHorarios(eventos, { 1: 2, 2: 2 });
    expect(a).toHaveLength(12);
    expect(a[0]).toEqual({ hora: 7, r1: 1, r2: 0 });
    expect(a[11]!.r1).toBe(0.5); // 19h entra na última barra (18h)
    expect(alertasHorarios([], { 1: 2, 2: 2 })).toEqual([]);
  });
});

describe('utilitários', () => {
  it('variação percentual e data por extenso', () => {
    expect(variacaoPct(40, 10)).toBe(-75);
    expect(variacaoPct(0, 3)).toBeNull();
    expect(dataPorExtenso('2026-11-25')).toBe('25 de novembro de 2026');
    expect(dataPorExtenso('2026-03-01T00:00:00Z')).toBe('1 de março de 2026');
    expect(dataPorExtenso('ontem')).toBeNull();
  });
});

describe('modo demonstração', () => {
  const vista = montarRelatorio(lerDadosRelatorio(gerarDadosDemo()));

  it('tem seis grupos com as duas rodadas e séries completas', () => {
    expect(vista.grupos).toHaveLength(6);
    expect(vista.grupos.every(g => g.r1 && g.r2)).toBe(true);
    expect(vista.temSeries).toBe(true);
    expect(vista.ocupacaoDe.every(p => p.r1 !== null && p.r2 !== null)).toBe(true);
    expect(vista.alertasPorHora.length).toBe(12);
  });

  it('mostra o efeito do Lean: menos boarding e mais pontos na média', () => {
    const { 1: r1, 2: r2 } = vista.rodadas;
    expect(r2.totais.bH!).toBeLessThan(r1.totais.bH!);
    expect(r2.pontuacaoMedia!).toBeGreaterThan(r1.pontuacaoMedia!);
  });
});

describe('tabela de pontuação das regras', () => {
  const zero = { boardHrs: 0, dets: 0, deaths: 0, cxCan: 0, lwbs: 0, offS: 0, socB: 0, altaHosp: 0, atendidosNoAlvo: 0 };

  it('confere com calcScore (se o motor mudar, o texto das regras precisa mudar)', () => {
    // Base com 2 óbitos: sem o bônus de zero óbito, cada item mexe só no seu peso.
    const base = { ...zero, deaths: 2 };
    const ref = calcScore(base);
    expect(calcScore(zero)).toBe(PONTUACAO_INICIAL + BONUS_SEM_OBITO);
    for (const p of PONTUACAO) {
      const s = { ...base, [p.campo]: base[p.campo] + 1 };
      expect(calcScore(s) - ref, p.item).toBe(p.pontos);
    }
    expect(calcScore({ ...zero, deaths: 100 })).toBe(PONTUACAO_MINIMA);
    // Caso social não penaliza (evento aleatório).
    expect(calcScore({ ...base, socB: 3 })).toBe(ref);
  });
});
