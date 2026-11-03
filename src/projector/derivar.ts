// Regras puras do telão: tudo o que a projeção mostra sai daqui, a partir dos
// dados públicos (`estado_turma` e `ranking`) e, quando o telão é aberto pela
// janela logada do facilitador, de `eventos_turma` e `series_turma`. Sem React,
// sem rede.

import type { EstadoTurma, ItemRanking, Metricas, Rodada } from '../shared/schemas';
import { tensaoDoPlacar, type SomEfeito } from '../shared/lib/music';
import { descreverEvento, type EventoBasico } from '../shared/lib/evolucao';

export type FaseTelao = 'aguardando' | 'aberta' | 'rodada' | 'debrief' | 'final';

/** Endereço que os grupos digitam (docs/design.md §5, P1). */
export const ENDERECO_JOGO = 'plantaocbmede26.netlify.app';
export const SALA_PADRAO = 'CBMEDE';
/** Horas de plantão por rodada (07:00 → 19:00). */
export const HORAS_PLANTAO = 12;

export function faseDoTelao(turma: EstadoTurma | null): FaseTelao {
  if (!turma) return 'aguardando';
  switch (turma.status) {
    case 'aberta':
      return 'aberta';
    case 'rodada1':
    case 'rodada2':
      return 'rodada';
    case 'debrief':
      return 'debrief';
    case 'encerrada':
    case 'arquivada':
      return 'final';
  }
}

/** Rodada em foco no telão: a da turma; no debrief é a 1; no fim, a 2. */
export function rodadaEmFoco(turma: EstadoTurma | null): Rodada {
  if (!turma) return 1;
  if (turma.status === 'rodada2' || turma.status === 'encerrada' || turma.status === 'arquivada') return 2;
  return 1;
}

/** Valor de uma métrica (ausente = 0). */
export function m(metricas: Metricas | undefined, chave: string): number {
  const v = metricas?.[chave];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Itens da rodada, do maior para o menor placar (empate: nome). */
export function itensDaRodada(itens: ItemRanking[], rodada: Rodada): ItemRanking[] {
  return itens
    .filter((i) => i.rodada === rodada)
    .sort((a, b) => b.pontuacao - a.pontuacao || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Tensão da turma para a música do telão (0..1): mistura a média com o pior
 * grupo, para um plantão em colapso ser ouvido mesmo com os outros bem.
 */
export function tensaoDaTurma(itensRodada: ItemRanking[], rodada: Rodada): number {
  if (itensRodada.length === 0) return 0;
  const valores = itensRodada.map((i) =>
    tensaoDoPlacar(
      { boarding: m(i.metricas, 'boarding'), deOcc: m(i.metricas, 'deOcc'), corredor: m(i.metricas, 'corredor'), dth: m(i.metricas, 'dth') },
      rodada,
    ),
  );
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const pior = Math.max(...valores);
  return Math.min(1, 0.6 * media + 0.4 * pior);
}

export interface ResumoAoVivo {
  obitos: number;
  boardingAgora: number;
  altas: number;
  cancelamentos: number;
  /** Trabalho das ferramentas automáticas (só faz sentido no Lean). */
  automatico: number;
}

export function resumoAoVivo(itensRodada: ItemRanking[]): ResumoAoVivo {
  const soma = (chave: string) => itensRodada.reduce((a, i) => a + m(i.metricas, chave), 0);
  return {
    obitos: soma('dth'),
    boardingAgora: soma('boarding'),
    altas: soma('altaHosp'),
    cancelamentos: soma('cxC'),
    automatico: soma('autoFluxista') + soma('autoDischargeLounge') + soma('autoCirurgiasViabilizadas'),
  };
}

// ------------------------------------------------------------
// Eventos marcantes (derivados da variação do placar entre consultas)
// ------------------------------------------------------------

export type TipoEvento =
  | 'obito'
  | 'deterioracao'
  | 'cancelamento'
  | 'evasao'
  | 'fluxista'
  | 'lounge'
  | 'cirurgiaProtegida'
  /** Evento gravado pelo jogo e lido por `eventos_turma` (surto, NIR, DE lotado...). */
  | 'jogo';

export interface EventoTelao {
  id: string;
  grupoId: string;
  nome: string;
  cor: string;
  minuto: number;
  tipo: TipoEvento;
  texto: string;
  /** Problema (true) ou trabalho do sistema (false). */
  problema: boolean;
}

interface RegraEvento {
  chave: string;
  tipo: TipoEvento;
  problema: boolean;
  som: SomEfeito;
  /** Só na rodada indicada (as ferramentas automáticas existem só no Lean). */
  rodada?: Rodada;
  texto: (n: number) => string;
}

// Ordem = prioridade (o primeiro com som vence quando chegam vários juntos).
const REGRAS: RegraEvento[] = [
  { chave: 'dth', tipo: 'obito', problema: true, som: 'death', texto: (n) => (n > 1 ? `${n} óbitos` : 'Óbito no plantão') },
  { chave: 'cxC', tipo: 'cancelamento', problema: true, som: 'cascade', texto: (n) => (n > 1 ? `${n} cirurgias canceladas` : 'Cirurgia cancelada') },
  { chave: 'det', tipo: 'deterioracao', problema: true, som: 'det', texto: (n) => (n > 1 ? `${n} pacientes deterioraram` : 'Paciente deteriorou') },
  { chave: 'lw', tipo: 'evasao', problema: true, som: 'det', texto: (n) => (n > 1 ? `${n} pacientes saíram sem atendimento` : 'Paciente saiu sem atendimento') },
  { chave: 'autoFluxista', tipo: 'fluxista', problema: false, som: 'fluxista', rodada: 2, texto: (n) => (n > 1 ? `Fluxista efetivou ${n} altas` : 'Fluxista efetivou uma alta') },
  { chave: 'autoDischargeLounge', tipo: 'lounge', problema: false, som: 'alta', rodada: 2, texto: (n) => (n > 1 ? `Discharge Lounge liberou ${n} leitos` : 'Discharge Lounge liberou um leito') },
  { chave: 'autoCirurgiasViabilizadas', tipo: 'cirurgiaProtegida', problema: false, som: 'nir', rodada: 2, texto: (n) => (n > 1 ? `${n} cirurgias protegidas` : 'Cirurgia protegida') },
];

/**
 * Eventos gravados pelos grupos (`eventos_turma`, só com a sessão do facilitador
 * no navegador) no formato do quadro "Agora no plantão". Mantém a ordem
 * recebida (mais recentes primeiro), só os tipos conhecidos, até `limite`.
 */
export function eventosDoServidor(eventos: readonly EventoBasico[], limite = 5): EventoTelao[] {
  const saida: EventoTelao[] = [];
  for (const e of eventos) {
    const d = descreverEvento(e.tipo);
    if (!d) continue;
    saida.push({
      id: `srv-${e.rodada}-${e.id}`,
      grupoId: e.grupoId,
      nome: e.nome,
      cor: e.cor,
      minuto: e.minuto,
      tipo: 'jogo',
      texto: d.rotulo,
      problema: d.problema,
    });
    if (saida.length >= limite) break;
  }
  return saida;
}

export interface ResultadoEventos {
  novos: EventoTelao[];
  /** Som do evento mais importante desta leva (no máximo um por consulta). */
  som: SomEfeito | null;
}

/**
 * Compara o placar anterior de cada grupo com o atual. Na primeira vez que vê
 * um grupo, só guarda a referência (não anuncia o que já tinha acontecido).
 */
export function detectarEventos(
  anterior: Map<string, Metricas>,
  itensRodada: ItemRanking[],
  rodada: Rodada,
): ResultadoEventos {
  const novos: EventoTelao[] = [];
  let som: SomEfeito | null = null;
  let prioridadeSom = Number.POSITIVE_INFINITY;
  for (const item of itensRodada) {
    const antes = anterior.get(item.grupoId);
    anterior.set(item.grupoId, item.metricas);
    if (!antes) continue;
    REGRAS.forEach((r, prioridade) => {
      if (r.rodada && r.rodada !== rodada) return;
      const delta = m(item.metricas, r.chave) - m(antes, r.chave);
      if (delta <= 0) return;
      novos.push({
        id: `${item.grupoId}-${r.chave}-${m(item.metricas, r.chave)}`,
        grupoId: item.grupoId,
        nome: item.nome,
        cor: item.cor,
        minuto: item.minuto,
        tipo: r.tipo,
        texto: r.texto(delta),
        problema: r.problema,
      });
      if (prioridade < prioridadeSom) {
        prioridadeSom = prioridade;
        som = r.som;
      }
    });
  }
  return { novos, som };
}

/** Guarda os últimos eventos da rodada e avisa a tela (para `useSyncExternalStore`). */
export class MemoriaEventos {
  private anterior = new Map<string, Metricas>();
  private rodada: Rodada | null = null;
  private lista: EventoTelao[] = [];
  private ouvintes = new Set<() => void>();

  constructor(private readonly limite = 5) {}

  /** Registra uma consulta; devolve o som a tocar (ou null). */
  registrar(itensRodada: ItemRanking[], rodada: Rodada): SomEfeito | null {
    if (this.rodada !== rodada) {
      this.rodada = rodada;
      this.anterior = new Map();
      this.atualizar([]);
    }
    const { novos, som } = detectarEventos(this.anterior, itensRodada, rodada);
    if (novos.length > 0) {
      const vistos = new Set(this.lista.map((e) => e.id));
      const unicos = novos.filter((e) => !vistos.has(e.id)).reverse();
      this.atualizar([...unicos, ...this.lista].slice(0, this.limite));
    }
    return som;
  }

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  eventos = (): EventoTelao[] => this.lista;

  private atualizar(lista: EventoTelao[]): void {
    this.lista = lista;
    this.ouvintes.forEach((o) => o());
  }
}

// ------------------------------------------------------------
// Debrief e resultado final
// ------------------------------------------------------------

export interface IndicadorDebrief {
  chave: 'pontos' | 'boarding' | 'obitos' | 'cancelamentos';
  titulo: string;
  /** Menor é melhor (boarding, óbitos, cancelamentos). */
  menorMelhor: boolean;
  formatar: (v: number) => string;
  valor: (i: ItemRanking) => number;
}

export const INDICADORES_DEBRIEF: IndicadorDebrief[] = [
  { chave: 'pontos', titulo: 'Pontuação', menorMelhor: false, valor: (i) => i.pontuacao, formatar: (v) => formatarInteiro(v) },
  { chave: 'boarding', titulo: 'Horas de boarding', menorMelhor: true, valor: (i) => m(i.metricas, 'bH'), formatar: (v) => `${formatarDecimal(v)} h` },
  { chave: 'obitos', titulo: 'Óbitos', menorMelhor: true, valor: (i) => m(i.metricas, 'dth'), formatar: (v) => formatarInteiro(v) },
  { chave: 'cancelamentos', titulo: 'Cirurgias canceladas', menorMelhor: true, valor: (i) => m(i.metricas, 'cxC'), formatar: (v) => formatarInteiro(v) },
];

export function formatarInteiro(v: number): string {
  return Math.round(v).toLocaleString('pt-BR');
}

export function formatarDecimal(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/** Carga do gestor numa rodada (docs/design.md §9), média por grupo. */
export interface CargaGestor {
  decisoesPorHora: number;
  alertasPorHora: number;
  /** 0..1; null se o motor não mandou a divisão. */
  fracaoReativa: number | null;
  /** Ações feitas pelas ferramentas automáticas (Lean), média por grupo. */
  automatico: number;
  temDados: boolean;
}

export function cargaDoGestor(itensRodada: ItemRanking[]): CargaGestor {
  const n = itensRodada.length;
  const temDados = n > 0 && itensRodada.some((i) => i.metricas.decisoes !== undefined || i.metricas.alertas !== undefined);
  if (n === 0) return { decisoesPorHora: 0, alertasPorHora: 0, fracaoReativa: null, automatico: 0, temDados: false };
  const soma = (chave: string) => itensRodada.reduce((a, i) => a + m(i.metricas, chave), 0);
  const decisoes = soma('decisoes');
  const reativas = soma('decisoesReativas');
  const produtivas = soma('decisoesProdutivas');
  return {
    decisoesPorHora: decisoes / n / HORAS_PLANTAO,
    alertasPorHora: soma('alertas') / n / HORAS_PLANTAO,
    fracaoReativa: reativas + produtivas > 0 ? reativas / (reativas + produtivas) : null,
    automatico: (soma('autoFluxista') + soma('autoDischargeLounge') + soma('autoCirurgiasViabilizadas')) / n,
    temDados,
  };
}

export interface LinhaComparativo {
  rotulo: string;
  r1: number | null;
  r2: number | null;
  menorMelhor: boolean;
  formatar: (v: number) => string;
}

function media(itens: ItemRanking[], valor: (i: ItemRanking) => number): number | null {
  if (itens.length === 0) return null;
  return itens.reduce((a, i) => a + valor(i), 0) / itens.length;
}

function total(itens: ItemRanking[], chave: string): number | null {
  if (itens.length === 0) return null;
  return itens.reduce((a, i) => a + m(i.metricas, chave), 0);
}

/** Comparativo da turma R1 × R2 (médias por grupo; óbitos e cancelamentos em total). */
export function comparativoTurma(itens: ItemRanking[]): LinhaComparativo[] {
  const r1 = itensDaRodada(itens, 1);
  const r2 = itensDaRodada(itens, 2);
  const c1 = cargaDoGestor(r1);
  const c2 = cargaDoGestor(r2);
  const linhas: LinhaComparativo[] = [
    { rotulo: 'Pontuação média', r1: media(r1, (i) => i.pontuacao), r2: media(r2, (i) => i.pontuacao), menorMelhor: false, formatar: formatarInteiro },
    { rotulo: 'Óbitos (turma)', r1: total(r1, 'dth'), r2: total(r2, 'dth'), menorMelhor: true, formatar: formatarInteiro },
    { rotulo: 'Boarding por grupo', r1: media(r1, (i) => m(i.metricas, 'bH')), r2: media(r2, (i) => m(i.metricas, 'bH')), menorMelhor: true, formatar: (v) => `${formatarDecimal(v)} h` },
    { rotulo: 'Cirurgias canceladas', r1: total(r1, 'cxC'), r2: total(r2, 'cxC'), menorMelhor: true, formatar: formatarInteiro },
  ];
  if (c1.temDados || c2.temDados) {
    linhas.push(
      { rotulo: 'Decisões por hora', r1: c1.temDados ? c1.decisoesPorHora : null, r2: c2.temDados ? c2.decisoesPorHora : null, menorMelhor: true, formatar: formatarDecimal },
      { rotulo: 'Alertas por hora', r1: c1.temDados ? c1.alertasPorHora : null, r2: c2.temDados ? c2.alertasPorHora : null, menorMelhor: true, formatar: formatarDecimal },
    );
  }
  return linhas;
}

export interface ColocacaoFinal {
  grupoId: string;
  nome: string;
  cor: string;
  r1: number | null;
  r2: number | null;
  /** O que decide o pódio: a melhora do Travado para o Lean (R2 − R1). */
  final: number;
}

export function classificacaoFinal(itens: ItemRanking[]): ColocacaoFinal[] {
  const porGrupo = new Map<string, ColocacaoFinal>();
  for (const i of itens) {
    const c = porGrupo.get(i.grupoId) ?? { grupoId: i.grupoId, nome: i.nome, cor: i.cor, r1: null, r2: null, final: 0 };
    if (i.rodada === 1) c.r1 = i.pontuacao;
    else c.r2 = i.pontuacao;
    porGrupo.set(i.grupoId, c);
  }
  return [...porGrupo.values()]
    .map((c) => ({ ...c, final: c.r1 !== null && c.r2 !== null ? c.r2 - c.r1 : Number.NEGATIVE_INFINITY }))
    .sort((a, b) => b.final - a.final || (b.r2 ?? 0) - (a.r2 ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** "1 grupo", "6 grupos". */
export function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}
