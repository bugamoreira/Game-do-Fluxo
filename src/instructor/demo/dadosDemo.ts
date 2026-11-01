// Métricas inventadas para o modo demonstração. Determinísticas (mesmo grupo,
// rodada e minuto ⇒ mesmos números), crescendo ao longo do plantão.
// Não usar fora de src/instructor/demo/.

const MIN_INICIO = 420;
const DURACAO = 720;

export function metricasDemo(indice: number, rodada: 1 | 2, minuto: number): Record<string, number> {
  const p = Math.min(1, Math.max(0, (minuto - MIN_INICIO) / DURACAO));
  const i = indice;
  const f = (n: number) => Math.floor(n * p);
  if (rodada === 1) {
    const decisoes = f(150 + i * 12);
    const reativas = Math.round(decisoes * (0.66 + i * 0.03));
    return {
      bH: Math.round(p * (22 + i * 5) * 10) / 10,
      det: f(3 + i * 0.8),
      dth: f(i >= 4 ? i - 3 : 0),
      cxC: f(1 + (i % 2)),
      dis: f(31 - i * 2),
      altaHosp: f(18 - i),
      lw: f(i % 4),
      leitoInadequado: f(2 + (i % 2)),
      slaPct: Math.round(64 - i * 4 - p * 6),
      boarding: Math.round(2 + i * 0.8 + p * 3),
      decisoes,
      decisoesReativas: reativas,
      decisoesProdutivas: decisoes - reativas,
      alertas: f(38 + i * 6),
      autoFluxista: 0,
      autoDischargeLounge: 0,
      autoFastTrack: 0,
      autoCirurgiasViabilizadas: 0,
    };
  }
  const decisoes = f(92 + i * 7);
  const reativas = Math.round(decisoes * (0.28 + i * 0.03));
  return {
    bH: Math.round(p * (8 + i * 2.5) * 10) / 10,
    det: f(1 + i * 0.4),
    dth: 0,
    cxC: f(i === 5 ? 1 : 0),
    dis: f(38 - i),
    altaHosp: f(24 - i),
    lw: 0,
    leitoInadequado: f(i % 2),
    slaPct: Math.round(88 - i * 2 - p * 2),
    boarding: Math.round(1 + i * 0.3),
    decisoes,
    decisoesReativas: reativas,
    decisoesProdutivas: decisoes - reativas,
    alertas: f(12 + i * 2),
    autoFluxista: f(30),
    autoDischargeLounge: f(9 + (i % 3)),
    autoFastTrack: f(14),
    autoCirurgiasViabilizadas: f(2),
  };
}

/** Mesma forma da pontuação do jogo (docs/fluxo.md), simplificada. */
export function pontuacaoDemo(m: Record<string, number>, rodada: 1 | 2): number {
  const v = (k: string) => m[k] ?? 0;
  let pts =
    1500 -
    10 * v('bH') -
    40 * v('det') -
    150 * v('dth') -
    80 * v('cxC') -
    40 * v('lw') -
    25 * v('leitoInadequado') +
    3 * v('altaHosp');
  if (v('dth') === 0) pts += 150;
  if (rodada === 2 && v('dth') === 0 && v('det') === 0 && v('cxC') === 0) pts += 300;
  return Math.max(50, Math.round(pts));
}
