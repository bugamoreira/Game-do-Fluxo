// ============================================================
// Transformação dos dados congelados em tudo o que a página mostra.
// Funções puras (testadas em __tests__/transformar.test.ts).
// ============================================================

import { CAP } from '../shared/lib/constants';
import type { DadosRelatorio, EventoRelatorio, PontoSerie } from './dados';

export type Rodada = 1 | 2;

export type ChaveMetrica =
  | 'bH' | 'det' | 'dth' | 'cxC' | 'lw' | 'dis' | 'slaPct' | 'leitoInadequado'
  | 'decisoes' | 'decisoesProdutivas' | 'decisoesReativas' | 'alertas'
  | 'autoFluxista' | 'autoDischargeLounge' | 'autoFastTrack' | 'autoCirurgiasViabilizadas';

export interface DefMetrica {
  chave: ChaveMetrica | 'pontuacao';
  rotulo: string;
  /** Subir é bom (pontuação, altas) ou ruim (boarding, óbitos). */
  sentidoBom: 'subir' | 'descer' | 'neutro';
  unidade?: 'h' | '%';
}

/** Métricas por grupo, na ordem da tabela R1 × R2 (design.md §8, item 4). */
export const METRICAS_GRUPO: DefMetrica[] = [
  { chave: 'pontuacao', rotulo: 'Pontuação', sentidoBom: 'subir' },
  { chave: 'bH', rotulo: 'Horas de boarding', sentidoBom: 'descer', unidade: 'h' },
  { chave: 'det', rotulo: 'Deteriorações', sentidoBom: 'descer' },
  { chave: 'dth', rotulo: 'Óbitos evitáveis', sentidoBom: 'descer' },
  { chave: 'cxC', rotulo: 'Cirurgias canceladas', sentidoBom: 'descer' },
  { chave: 'lw', rotulo: 'Saídas sem atendimento (LWBS)', sentidoBom: 'descer' },
  { chave: 'leitoInadequado', rotulo: 'Internações em leito inadequado', sentidoBom: 'descer' },
  { chave: 'dis', rotulo: 'Altas', sentidoBom: 'subir' },
  { chave: 'slaPct', rotulo: 'Atendidos no tempo-alvo', sentidoBom: 'subir', unidade: '%' },
];

export type Metricas = Partial<Record<ChaveMetrica, number>>;

export interface Resultado {
  pontuacao: number;
  metricas: Metricas;
}

export interface GrupoVista {
  id: string;
  nome: string;
  cor: string;
  r1: Resultado | null;
  r2: Resultado | null;
  /** Posição no ranking final (1 = primeiro). */
  posicao: number;
  /** Pontuação R2 − R1 (null se faltar uma das rodadas). */
  evolucao: number | null;
}

export interface PontoHora {
  hora: number;
  /** Média da turma; null quando nenhum grupo tem dado nesse horário. */
  r1: number | null;
  r2: number | null;
}

export interface ResumoRodada {
  grupos: number;
  pontuacaoMedia: number | null;
  /** Somas da turma (média por grupo para slaPct). */
  totais: Metricas;
  decisoesPorHora: number | null;
  /** Fração das decisões que foram reativas (0–1). */
  fracaoReativas: number | null;
  alertasPorHora: number | null;
}

export interface RelatorioVista {
  turma: { codigo: string; nome: string; evento: string | null; data: string | null };
  facilitador: string | null;
  /** Local do evento; relatórios antigos, sem o campo, usam `LOCAL_PADRAO`. */
  local: string;
  geradoEm: string | null;
  versaoRegras: string | null;
  /** Grupos na ordem do ranking final. */
  grupos: GrupoVista[];
  rodadas: Record<Rodada, ResumoRodada>;
  ocupacaoDe: PontoHora[];
  boarding: PontoHora[];
  alertasPorHora: PontoHora[];
  /** Tem séries por horário (gráficos de evolução)? */
  temSeries: boolean;
  mensagens: string[];
}

/** Local do CBMEDE 2026: vale para relatórios gerados antes de o banco gravar `dados.local`. */
export const LOCAL_PADRAO = 'Windsor Barra Hotel, Rio de Janeiro';

/** Duração de uma rodada em horas simuladas (7h → 19h). */
export const HORAS_PLANTAO = 12;
export const HORAS = Array.from({ length: HORAS_PLANTAO + 1 }, (_, i) => 7 + i);

/** Ocorrências que contam como alerta ou crise (design.md §9). */
export const TIPOS_ALERTA = new Set([
  'deterioracao', 'deterioracao_espera', 'deterioracao_leito_inadequado',
  'obito', 'obito_espera', 'emergencia_obito',
  'cirurgia_cancelada', 'de_lotado', 'corredor', 'lwbs',
]);

const CHAVES_SOMA: ChaveMetrica[] = [
  'bH', 'det', 'dth', 'cxC', 'lw', 'dis', 'leitoInadequado',
  'decisoes', 'decisoesProdutivas', 'decisoesReativas', 'alertas',
  'autoFluxista', 'autoDischargeLounge', 'autoFastTrack', 'autoCirurgiasViabilizadas',
];

function metricasDe(rec: Record<string, number>): Metricas {
  const m: Metricas = {};
  for (const k of [...CHAVES_SOMA, 'slaPct'] as ChaveMetrica[]) {
    const v = rec[k];
    if (v !== undefined) m[k] = v;
  }
  return m;
}

function media(valores: number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((a, v) => a + v, 0) / valores.length;
}

/** Resultado final de cada grupo por rodada: ranking congelado e, se faltar, o placar. */
function resultados(dados: DadosRelatorio): Map<string, Partial<Record<Rodada, Resultado>>> {
  const mapa = new Map<string, Partial<Record<Rodada, Resultado>>>();
  const guardar = (grupoId: string, rodada: Rodada, r: Resultado, sobrescrever: boolean) => {
    const atual = mapa.get(grupoId) ?? {};
    if (sobrescrever || !atual[rodada]) atual[rodada] = r;
    mapa.set(grupoId, atual);
  };
  for (const p of dados.placar) guardar(p.grupo_id, p.rodada, { pontuacao: p.pontuacao, metricas: metricasDe(p.metricas) }, false);
  const ranking = [...(dados.ranking?.rodada1 ?? []), ...(dados.ranking?.rodada2 ?? [])];
  for (const i of ranking) guardar(i.grupo_id, i.rodada, { pontuacao: i.pontuacao, metricas: metricasDe(i.metricas) }, true);
  return mapa;
}

/**
 * Critério do ranking final (decisão do Gustavo): a melhora do Plantão Travado
 * para o Plantão Lean (R2 − R1); empate pela pontuação do Lean. Grupo sem as
 * duas rodadas fica depois, pela pontuação que tiver.
 */
export function ordenarRankingFinal<T extends { r1: Resultado | null; r2: Resultado | null; nome: string }>(grupos: T[]): T[] {
  const chave = (g: T) => [g.r1 && g.r2 ? 1 : 0, g.r1 && g.r2 ? g.r2.pontuacao - g.r1.pontuacao : 0, g.r2?.pontuacao ?? g.r1?.pontuacao ?? 0];
  return [...grupos].sort((a, b) => {
    const ca = chave(a);
    const cb = chave(b);
    for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) return cb[i]! - ca[i]!;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

export function montarGrupos(dados: DadosRelatorio): GrupoVista[] {
  const res = resultados(dados);
  const conhecidos = new Map(dados.grupos.map(g => [g.id, g]));
  // Grupo que aparece só no ranking (lista de grupos vazia) também entra.
  for (const i of [...(dados.ranking?.rodada1 ?? []), ...(dados.ranking?.rodada2 ?? [])]) {
    if (!conhecidos.has(i.grupo_id) && i.nome && i.cor) {
      conhecidos.set(i.grupo_id, { id: i.grupo_id, nome: i.nome, cor: i.cor, rodada_entrada: null });
    }
  }
  const base = [...conhecidos.values()].map(g => {
    const r = res.get(g.id) ?? {};
    const r1 = r[1] ?? null;
    const r2 = r[2] ?? null;
    return { id: g.id, nome: g.nome, cor: g.cor, r1, r2, evolucao: r1 && r2 ? r2.pontuacao - r1.pontuacao : null };
  });
  return ordenarRankingFinal(base).map((g, i) => ({ ...g, posicao: i + 1 }));
}

export function resumirRodada(grupos: GrupoVista[], rodada: Rodada, eventos: EventoRelatorio[]): ResumoRodada {
  const rs = grupos.map(g => (rodada === 1 ? g.r1 : g.r2)).filter((r): r is Resultado => r !== null);
  const totais: Metricas = {};
  for (const k of CHAVES_SOMA) {
    const vals = rs.map(r => r.metricas[k]).filter((v): v is number => v !== undefined);
    if (vals.length > 0) totais[k] = vals.reduce((a, v) => a + v, 0);
  }
  const sla = media(rs.map(r => r.metricas.slaPct).filter((v): v is number => v !== undefined));
  if (sla !== null) totais.slaPct = sla;

  const n = rs.length;
  const decisoes = totais.decisoes;
  const alertasEventos = eventos.filter(e => e.rodada === rodada && TIPOS_ALERTA.has(e.tipo)).length;
  const alertas = totais.alertas ?? (alertasEventos > 0 ? alertasEventos : undefined);
  return {
    grupos: n,
    pontuacaoMedia: media(rs.map(r => r.pontuacao)),
    totais,
    decisoesPorHora: n > 0 && decisoes !== undefined ? decisoes / n / HORAS_PLANTAO : null,
    fracaoReativas:
      decisoes && totais.decisoesReativas !== undefined ? totais.decisoesReativas / decisoes : null,
    alertasPorHora: n > 0 && alertas !== undefined ? alertas / n / HORAS_PLANTAO : null,
  };
}

/**
 * Média da turma, hora a hora, de uma métrica da série. Para cada grupo, vale o
 * último ponto registrado até aquele horário (a série é gravada a cada 30 min).
 */
export function serieHoraria(
  series: PontoSerie[],
  valor: (m: Record<string, number>) => number | undefined,
): PontoHora[] {
  const porGrupoRodada = new Map<string, PontoSerie[]>();
  for (const p of series) {
    const k = `${p.rodada}|${p.grupo_id}`;
    const l = porGrupoRodada.get(k) ?? [];
    l.push(p);
    porGrupoRodada.set(k, l);
  }
  for (const l of porGrupoRodada.values()) l.sort((a, b) => a.minuto - b.minuto);

  const valorEm = (rodada: Rodada, hora: number): number | null => {
    const vals: number[] = [];
    for (const [k, pontos] of porGrupoRodada) {
      if (!k.startsWith(`${rodada}|`)) continue;
      let escolhido: PontoSerie | undefined;
      for (const p of pontos) {
        if (p.minuto <= hora * 60) escolhido = p;
        else break;
      }
      // 7h sem ponto exato: usa o primeiro registrado na primeira meia hora.
      if (!escolhido && pontos[0] && pontos[0].minuto <= hora * 60 + 30) escolhido = pontos[0];
      const v = escolhido ? valor(escolhido.metricas) : undefined;
      if (v !== undefined && Number.isFinite(v)) vals.push(v);
    }
    return media(vals);
  };
  return HORAS.map(hora => ({ hora, r1: valorEm(1, hora), r2: valorEm(2, hora) }));
}

/** Alertas e crises por hora (média por grupo), a partir de `eventos_jogo`. Uma barra por hora, 7h…18h. */
export function alertasHorarios(eventos: EventoRelatorio[], gruposPorRodada: Record<Rodada, number>): PontoHora[] {
  const contagem: Record<Rodada, number[]> = { 1: Array(HORAS_PLANTAO).fill(0), 2: Array(HORAS_PLANTAO).fill(0) };
  let algum = false;
  for (const e of eventos) {
    if (!TIPOS_ALERTA.has(e.tipo)) continue;
    const i = Math.min(HORAS_PLANTAO - 1, Math.max(0, Math.floor(e.minuto / 60) - 7));
    contagem[e.rodada][i]! += 1;
    algum = true;
  }
  if (!algum) return [];
  return HORAS.slice(0, HORAS_PLANTAO).map((hora, i) => ({
    hora,
    r1: gruposPorRodada[1] > 0 ? contagem[1][i]! / gruposPorRodada[1] : null,
    r2: gruposPorRodada[2] > 0 ? contagem[2][i]! / gruposPorRodada[2] : null,
  }));
}

/** Variação relativa em %, arredondada; null se a base for zero. */
export function variacaoPct(antes: number, depois: number): number | null {
  if (antes === 0) return null;
  return Math.round(((depois - antes) / antes) * 100);
}

const fmt1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const fmt0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatarNumero(v: number, casas: 0 | 1 = 0): string {
  return (casas === 1 ? fmt1 : fmt0).format(v);
}

function contagem(n: number, singular: string, plural: string): string {
  return `${formatarNumero(n)} ${n === 1 ? singular : plural}`;
}

/** Mensagens-chave para o debrief, escritas a partir dos números da turma. */
export function gerarMensagens(r1: ResumoRodada, r2: ResumoRodada, grupos: GrupoVista[]): string[] {
  const msgs: string[] = [];
  if (r1.grupos === 0 || r2.grupos === 0) {
    msgs.push('A turma não tem resultado das duas rodadas; a comparação entre o Plantão Travado e o Plantão Lean fica incompleta.');
    return msgs;
  }
  const t1 = r1.totais;
  const t2 = r2.totais;

  if (r1.pontuacaoMedia !== null && r2.pontuacaoMedia !== null) {
    const d = Math.round(r2.pontuacaoMedia - r1.pontuacaoMedia);
    msgs.push(
      d >= 0
        ? `A pontuação média da turma subiu ${formatarNumero(d)} pontos do Plantão Travado para o Plantão Lean, com a mesma demanda de pacientes nas duas rodadas.`
        : `A pontuação média caiu ${formatarNumero(-d)} pontos no Plantão Lean. Vale discutir o que impediu as ferramentas de fluxo de funcionar.`,
    );
  }
  if (t1.bH !== undefined && t2.bH !== undefined) {
    const p = variacaoPct(t1.bH, t2.bH);
    msgs.push(
      `O boarding somado caiu de ${formatarNumero(t1.bH, 1)} h para ${formatarNumero(t2.bH, 1)} h` +
        (p !== null && p < 0 ? ` (${formatarNumero(-p)}% a menos).` : '.') +
        ' Quando a saída do hospital anda, o departamento de emergência esvazia sem que ninguém precise correr mais.',
    );
  }
  if (t1.dth !== undefined && t2.dth !== undefined && t1.det !== undefined && t2.det !== undefined) {
    msgs.push(
      `Deteriorações: ${formatarNumero(t1.det)} → ${formatarNumero(t2.det)}; óbitos evitáveis: ${formatarNumero(t1.dth)} → ${formatarNumero(t2.dth)}. ` +
        'Tempo de espera é risco clínico, não só desconforto.',
    );
  }
  if (t1.cxC !== undefined && t2.cxC !== undefined && t1.cxC > t2.cxC) {
    msgs.push(
      `As cirurgias canceladas caíram de ${formatarNumero(t1.cxC)} para ${formatarNumero(t2.cxC)}: alta cedo e agenda cirúrgica distribuída protegem o centro cirúrgico.`,
    );
  }
  if (r1.alertasPorHora !== null && r2.alertasPorHora !== null) {
    const alertas = `os alertas caíram de ${formatarNumero(r1.alertasPorHora, 1)} para ${formatarNumero(r2.alertasPorHora, 1)} por hora em cada grupo`;
    const caiuAlerta = r2.alertasPorHora < r1.alertasPorHora;
    let texto: string;
    if (r1.decisoesPorHora !== null && r2.decisoesPorHora !== null && r2.decisoesPorHora < r1.decisoesPorHora) {
      texto = `Carga do gestor: as decisões caíram de ${formatarNumero(r1.decisoesPorHora, 1)} para ${formatarNumero(r2.decisoesPorHora, 1)} por hora` +
        (caiuAlerta ? ` e ${alertas}.` : '.') + ' No Lean, o sistema faz o trabalho repetitivo, e o gestor decide menos e melhor.';
    } else if (r1.fracaoReativas !== null && r2.fracaoReativas !== null && caiuAlerta) {
      texto = `Carga do gestor: ${alertas}, e a parte das decisões tomada para apagar incêndio passou de ` +
        `${formatarNumero(r1.fracaoReativas * 100)}% para ${formatarNumero(r2.fracaoReativas * 100)}%. O grupo decide tanto quanto antes, mas para puxar o fluxo, não para correr atrás do problema.`;
    } else if (caiuAlerta) {
      texto = `Carga do gestor: ${alertas}. Menos crise significa mais tempo para decidir com calma.`;
    } else {
      texto = 'Carga do gestor: os alertas não diminuíram no Lean. Vale discutir onde o fluxo continuou travando.';
    }
    msgs.push(texto);
  }
  const auto = (t2.autoFluxista ?? 0) + (t2.autoDischargeLounge ?? 0) + (t2.autoFastTrack ?? 0);
  if (auto > 0) {
    msgs.push(
      `As ferramentas automáticas trabalharam por todos: ${contagem(t2.autoFluxista ?? 0, 'alta do Fluxista', 'altas do Fluxista')}, ` +
        `${contagem(t2.autoDischargeLounge ?? 0, 'leito liberado', 'leitos liberados')} pelo Discharge Lounge e ` +
        `${contagem(t2.autoFastTrack ?? 0, 'paciente verde atendido', 'pacientes verdes atendidos')} no Fast Track.`,
    );
  }
  const melhor = grupos.filter(g => g.evolucao !== null).sort((a, b) => b.evolucao! - a.evolucao!)[0];
  if (melhor && melhor.evolucao! > 0) {
    msgs.push(`Maior evolução da turma: ${melhor.nome}, com ${formatarNumero(melhor.evolucao!)} pontos a mais no Plantão Lean. O que esse grupo mudou na forma de decidir?`);
  }
  msgs.push('Pergunta para fechar: qual dessas ferramentas já existe no seu hospital, e qual delas daria para começar na segunda-feira?');
  return msgs;
}

export function montarRelatorio(dados: DadosRelatorio): RelatorioVista {
  const grupos = montarGrupos(dados);
  const r1 = resumirRodada(grupos, 1, dados.eventos);
  const r2 = resumirRodada(grupos, 2, dados.eventos);
  const ocupacaoDe = serieHoraria(dados.series, m => (m.deOcc === undefined ? undefined : (m.deOcc / CAP.de) * 100));
  const boarding = serieHoraria(dados.series, m => m.boarding);
  const temSeries = ocupacaoDe.some(p => p.r1 !== null || p.r2 !== null);
  return {
    turma: {
      codigo: dados.turma.codigo ?? '',
      nome: dados.turma.nome ?? 'Turma',
      evento: dados.turma.evento ?? null,
      data: dados.turma.data ?? null,
    },
    facilitador: dados.facilitador?.trim() || null,
    local: dados.local?.trim() || LOCAL_PADRAO,
    geradoEm: dados.gerado_em ?? null,
    versaoRegras: dados.versao_regras ?? null,
    grupos,
    rodadas: { 1: r1, 2: r2 },
    ocupacaoDe,
    boarding,
    alertasPorHora: alertasHorarios(dados.eventos, { 1: r1.grupos, 2: r2.grupos }),
    temSeries,
    mensagens: gerarMensagens(r1, r2, grupos),
  };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-11-25" → "25 de novembro de 2026" (sem passar por fuso horário). */
export function dataPorExtenso(data: string | null): string | null {
  if (!data) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (!m) return null;
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return null;
  return `${Number(m[3])} de ${mes} de ${m[1]}`;
}
