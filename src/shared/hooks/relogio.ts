// ============================================================
// Relógio do plantão: o relógio é do servidor (docs/schema.md, princípio 5).
//
// minuto = 420 + ⌊(horaServidor − rodadaInicio − pausaAcumulada) / 1000⌋,
// limitado a 420..1140 (7h → 19h). 1 s real = 1 minuto de plantão.
//
// O relógio local de cada computador pode estar adiantado ou atrasado.
// A cada resposta, mede-se o desvio = horaServidor − hora local no meio da
// consulta (envio + metade do tempo de ida e volta); entre as medições
// recentes vale a de menor ida e volta (a mais confiável). A hora do servidor
// "agora" é então hora local + desvio.
// ============================================================

import { instanteEmMs, type EstadoTurma } from '../schemas';

export const MINUTO_INICIO = 420;
export const MINUTO_FIM = 1140;

/**
 * Quanto o motor do grupo pode andar além da última leitura confirmada pelo
 * servidor: no máximo um tique (1 s = 1 min de plantão). Assim uma pausa vista
 * com atraso nunca deixa o grupo mais de um minuto à frente (ensaio E2).
 */
export const MARGEM_EXTRAPOLACAO_MS = 1000;

/** Medições guardadas para escolher a de menor ida e volta. */
const AMOSTRAS_RELOGIO = 5;

export interface ParametrosMinuto {
  rodadaInicioMs: number;
  pausaAcumuladaMs: number;
  agoraServidorMs: number;
  /** Início da pausa em curso: o relógio fica congelado nele. */
  pausadaEmMs?: number | null;
}

export function calcularMinutoServidor(p: ParametrosMinuto): number {
  const referencia = p.pausadaEmMs != null ? Math.min(p.pausadaEmMs, p.agoraServidorMs) : p.agoraServidorMs;
  const decorridoMs = referencia - p.rodadaInicioMs - p.pausaAcumuladaMs;
  const minuto = MINUTO_INICIO + Math.floor(decorridoMs / 1000);
  return Math.min(MINUTO_FIM, Math.max(MINUTO_INICIO, minuto));
}

/** Minuto do plantão da turma, ou `null` fora de rodada (aberta, debrief, encerrada). */
export function minutoDaTurma(turma: EstadoTurma, agoraServidorMs: number): number | null {
  if (turma.status !== 'rodada1' && turma.status !== 'rodada2') return null;
  if (!turma.rodadaInicio) return null;
  const rodadaInicioMs = instanteEmMs(turma.rodadaInicio);
  if (!Number.isFinite(rodadaInicioMs)) return null;
  const pausadaEmMs = turma.pausada && turma.pausadaEm ? instanteEmMs(turma.pausadaEm) : null;
  return calcularMinutoServidor({
    rodadaInicioMs,
    pausaAcumuladaMs: turma.pausaAcumuladaMs,
    agoraServidorMs,
    pausadaEmMs: pausadaEmMs !== null && Number.isFinite(pausadaEmMs) ? pausadaEmMs : null,
  });
}

/** Correção do relógio local pela hora do servidor. */
export class RelogioServidor {
  private desvio: number | null = null;
  private amostras: { desvio: number; idaVolta: number }[] = [];

  /**
   * Registra a hora do servidor medida numa resposta que chegou em `horaLocalMs`.
   * Com `envioLocalMs` (quando a consulta saiu), desconta metade da ida e volta.
   */
  registrar(horaServidor: string, horaLocalMs: number, envioLocalMs?: number): void {
    const servidorMs = instanteEmMs(horaServidor);
    if (!Number.isFinite(servidorMs) || !Number.isFinite(horaLocalMs)) return;
    const idaVolta =
      envioLocalMs !== undefined && Number.isFinite(envioLocalMs) ? Math.max(0, horaLocalMs - envioLocalMs) : 0;
    this.amostras.push({ desvio: servidorMs - (horaLocalMs - idaVolta / 2), idaVolta });
    if (this.amostras.length > AMOSTRAS_RELOGIO) this.amostras.shift();
    let melhor = this.amostras[0]!;
    for (const a of this.amostras) if (a.idaVolta < melhor.idaVolta) melhor = a;
    this.desvio = melhor.desvio;
  }

  /** Desvio atual (servidor − local), ou `null` antes da primeira resposta. */
  get desvioMs(): number | null {
    return this.desvio;
  }

  /** Hora do servidor estimada para a hora local dada, ou `null` sem medição. */
  agora(horaLocalMs: number): number | null {
    return this.desvio === null ? null : horaLocalMs + this.desvio;
  }
}
