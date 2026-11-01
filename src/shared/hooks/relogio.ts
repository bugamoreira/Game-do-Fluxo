// ============================================================
// Relógio do plantão: o relógio é do servidor (docs/schema.md, princípio 5).
//
// minuto = 420 + ⌊(horaServidor − rodadaInicio − pausaAcumulada) / 1000⌋,
// limitado a 420..1140 (7h → 19h). 1 s real = 1 minuto de plantão.
//
// O relógio local de cada computador pode estar adiantado ou atrasado.
// A cada resposta, mede-se o desvio = horaServidor − hora local no momento da
// resposta; a hora do servidor "agora" é então hora local + desvio.
// ============================================================

import { instanteEmMs, type EstadoTurma } from '../schemas';

export const MINUTO_INICIO = 420;
export const MINUTO_FIM = 1140;

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

  /** Registra a hora do servidor medida numa resposta que chegou em `horaLocalMs`. */
  registrar(horaServidor: string, horaLocalMs: number): void {
    const servidorMs = instanteEmMs(horaServidor);
    if (Number.isFinite(servidorMs)) this.desvio = servidorMs - horaLocalMs;
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
