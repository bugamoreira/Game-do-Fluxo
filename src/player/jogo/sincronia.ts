// ============================================================
// Regras puras de sincronia do jogo do grupo com a sala:
// relógio do servidor, retomada após reconexão, série e eventos enviados.
// Sem React e sem rede (testadas em __tests__/sincronia.test.ts).
// ============================================================

import { z } from 'zod';
import {
  MINUTO_FIM,
  MINUTO_INICIO,
  criarEstadoInicial,
  metricas,
  type EstadoSimulacao,
  type Metricas,
  type Ocorrencia,
  type Rodada,
  type TipoOcorrencia,
} from '../../shared/lib/simulation';
import type { EventoJogo } from '../../shared/schemas/sync.schema';

/** Intervalo do relógio do jogo: bem abaixo de 1 s para seguir o minuto do servidor sem atraso visível. */
export const TIQUE_JOGO_MS = 250;

/** Série de métricas: um ponto a cada 30 min simulados. */
export const INTERVALO_SERIE_MIN = 30;

/** Mais passos que isto num tique = recuperação (reconexão): sem sons nem flash. */
export const PASSOS_LOTE = 3;

/**
 * Minuto até onde o motor local deve avançar agora, ou `null` para ficar parado.
 * O local nunca passa do servidor; pausa do facilitador congela.
 */
export function minutoAlvo(minutoLocal: number, minutoServidor: number | null, pausada: boolean): number | null {
  if (pausada || minutoServidor === null) return null;
  const alvo = Math.min(MINUTO_FIM, minutoServidor);
  return alvo > minutoLocal ? alvo : null;
}

/** Minuto do relógio local (modo solo): 1 s real = 1 min de plantão, descontando as pausas. */
export function minutoLocal(inicioMs: number, agoraMs: number, pausaAcumuladaMs: number, pausadoEmMs: number | null): number {
  const ref = pausadoEmMs ?? agoraMs;
  const m = MINUTO_INICIO + Math.floor((ref - inicioMs - pausaAcumuladaMs) / 1000);
  return Math.min(MINUTO_FIM, Math.max(MINUTO_INICIO, m));
}

/**
 * Semente da partida a partir da turma: a mesma para todos os grupos e para as
 * duas rodadas (mesma demanda, comparação justa). FNV-1a de 32 bits.
 */
export function sementeDaTurma(turmaId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < turmaId.length; i++) {
    h ^= turmaId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tensão da música (0..1) a partir do hospital: DE cheio, boarding e óbitos. */
export function tensaoDoPlantao(estado: EstadoSimulacao): number {
  const m = metricas(estado);
  const de = Math.min(1, m.deOcc / 15);
  const boarding = Math.min(1, m.boarding / 6);
  const t = 0.5 * de + 0.35 * boarding + (m.dth > 0 ? 0.3 : 0) + (m.det > 0 ? 0.05 : 0);
  return Math.min(1, Math.round(t * 100) / 100);
}

/** Marco da série atingido pelo minuto (múltiplo de 30 a partir das 7h). */
export function marcoDaSerie(minuto: number): number {
  return MINUTO_INICIO + Math.floor((minuto - MINUTO_INICIO) / INTERVALO_SERIE_MIN) * INTERVALO_SERIE_MIN;
}

/**
 * Ocorrências que viram `eventos_jogo` (facilitador, telão e relatório). Os
 * nomes são os do motor (`TipoOcorrencia`); o relatório conta `de_lotado` e
 * `corredor` como alertas e o telão os mostra em "Agora no plantão".
 */
export const TIPOS_EVENTO_RELEVANTE: ReadonlySet<TipoOcorrencia> = new Set<TipoOcorrencia>([
  'obito', 'obito_espera', 'emergencia_obito',
  'deterioracao', 'deterioracao_espera', 'deterioracao_leito_inadequado', 'retorno_de',
  'cirurgia_cancelada', 'surto', 'lwbs', 'de_lotado', 'corredor',
  'nir', 'nir_concluido', 'full_capacity', 'full_capacity_liberado',
  'leito_inadequado',
]);

/** Converte ocorrências em eventos do servidor, com chave idempotente (reenvio não duplica). */
export function eventosRelevantes(rodada: Rodada, ocorrencias: readonly Ocorrencia[]): EventoJogo[] {
  const vistos = new Map<string, number>();
  const eventos: EventoJogo[] = [];
  for (const o of ocorrencias) {
    if (!TIPOS_EVENTO_RELEVANTE.has(o.tipo)) continue;
    const base = `r${rodada}:${o.minuto}:${o.tipo}:${o.pacienteId ?? 0}`;
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    eventos.push({ minuto: o.minuto, tipo: o.tipo, mensagem: o.msg.slice(0, 300), chave: n === 0 ? base : `${base}:${n}` });
  }
  return eventos;
}

/** Resumo enviado com o estado (placar) e guardado para o fim da rodada. */
export interface ResumoRodada {
  pontuacao: number;
  metricas: Metricas;
}

// ── Retomada (docs/design.md §5, "Reconexão só com o estado completo") ──

/**
 * Checagem de forma do estado vindo do armazenamento ou do servidor. O schema de
 * transporte só valida versão, rodada e minuto; aqui se garante o mínimo para o
 * motor não quebrar com uma cópia de outra versão do app.
 */
const EstadoMotorSchema = z.looseObject({
  versao: z.number().int().min(0),
  rodada: z.union([z.literal(1), z.literal(2)]),
  minuto: z.number().int().min(MINUTO_INICIO).max(MINUTO_FIM),
  rng: z.number(),
  pacientes: z.array(z.looseObject({ id: z.number(), sector: z.string(), transferenciaAte: z.number() })),
  cirurgias: z.array(z.looseObject({ id: z.number() })),
  stats: z.looseObject({ deaths: z.number() }),
  eventos: z.looseObject({}),
  flags: z.record(z.string(), z.boolean()),
  agenda: z.looseObject({ chegadas: z.array(z.unknown()), altas: z.array(z.unknown()) }),
  chegadasProcessadas: z.number(),
  ferramentas: z.looseObject({ nirUsos: z.number(), fcLiberado: z.boolean() }),
  log: z.array(z.unknown()),
  proximoId: z.number(),
  carga: z.looseObject({ automatico: z.looseObject({}) }),
});

export function comoEstadoSimulacao(v: unknown): EstadoSimulacao | null {
  return EstadoMotorSchema.safeParse(v).success ? (v as EstadoSimulacao) : null;
}

export type Retomada =
  | { tipo: 'restaurar'; estado: EstadoSimulacao }
  | { tipo: 'novo'; estado: EstadoSimulacao }
  | { tipo: 'sem_estado'; mensagem: string };

export interface EntradaRetomada {
  rodada: Rodada;
  semente: number;
  /** Cópia local deste computador (qualquer rodada; é filtrada aqui). */
  local: unknown;
  /** Estado salvo devolvido pelo servidor (`entrar` ou `obter_estado`). */
  servidor: unknown;
  /**
   * Pode começar do zero: o grupo é novo (entrou agora, inclusive atrasado com
   * entrada liberada) ou este computador acompanhou ao vivo o início da rodada.
   */
  podeComecar: boolean;
  /** Frase do servidor, se houver, para a tela de bloqueio. */
  mensagemServidor?: string | null;
}

export const MENSAGEM_SEM_ESTADO =
  'Não encontramos o jogo salvo deste grupo nesta rodada. Peça ao facilitador para liberar a reconexão do grupo.';

/**
 * Decide como o grupo volta ao jogo: o estado mais recente (maior versão) da
 * rodada, entre a cópia local e a do servidor; sem estado, só começa do zero
 * quando pode, senão não inventa.
 */
export function decidirRetomada(e: EntradaRetomada): Retomada {
  const candidatos = [comoEstadoSimulacao(e.local), comoEstadoSimulacao(e.servidor)].filter(
    (x): x is EstadoSimulacao => x !== null && x.rodada === e.rodada,
  );
  if (candidatos.length > 0) {
    return { tipo: 'restaurar', estado: candidatos.reduce((a, b) => (b.versao > a.versao ? b : a)) };
  }
  if (e.podeComecar) return { tipo: 'novo', estado: criarEstadoInicial(e.rodada, e.semente) };
  return { tipo: 'sem_estado', mensagem: e.mensagemServidor?.trim() || MENSAGEM_SEM_ESTADO };
}
