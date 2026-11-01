// ============================================================
// Constantes de calibração do motor (regras aprovadas no Portão 2)
// Mudar um número aqui muda o jogo: rode o teste de estratégias depois.
// ============================================================

import type { Severity } from '../../types/game';
import type { ChaveLote } from './types';

// ── Demanda (igual nas duas rodadas) ────────────────────────

/** Chegadas esperadas por hora (Poisson não homogêneo; chance λ/60 por minuto). Soma ≈ 43. */
export const TAXA_CHEGADA_POR_HORA: Readonly<Record<number, number>> = {
  7: 2, 8: 2.5, 9: 3.5, 10: 4, 11: 5, 12: 5, 13: 5, 14: 4, 15: 3.5, 16: 3, 17: 3, 18: 2.5,
};

/** Surto: 3 pacientes juntos ao meio-dia, um deles vermelho para UTI, nas duas rodadas. */
export const SURTO_MINUTO = 12 * 60;
export const SURTO_PACIENTES = 3;

/** Perfil de gravidade das chegadas. */
export const PERFIL_GRAVIDADE: Readonly<Record<Severity, number>> = {
  red: 0.10, orange: 0.20, yellow: 0.40, green: 0.30,
};

export type DestinoChegada = 'alta_de' | 'enf' | 'uti';

/** Destino condicionado à gravidade. */
export const DESTINO_POR_GRAVIDADE: Readonly<Record<Severity, Readonly<Partial<Record<DestinoChegada, number>>>>> = {
  red: { uti: 0.60, enf: 0.40 },
  orange: { enf: 0.70, alta_de: 0.30 },
  yellow: { enf: 0.55, alta_de: 0.45 },
  green: { alta_de: 0.95, enf: 0.05 },
};

/** Fração das chegadas fora do perfil do hospital (precisam de transferência). ≈ 2–3 por plantão. */
export const P_FORA_DO_PERFIL = 0.055;

/** Tempo até a decisão no DE, em minutos [mín, máx], igual nas duas rodadas. */
export const TEMPO_DECISAO: Readonly<Record<Severity, readonly [number, number]>> = {
  green: [30, 60], yellow: [90, 180], orange: [90, 150], red: [60, 90],
};

// ── Fila (Manchester) ───────────────────────────────────────

export const PRIORIDADE: Readonly<Record<Severity, number>> = { red: 0, orange: 1, yellow: 2, green: 3 };

/** Tempo-alvo da chegada até entrar no DE (min). */
export const ALVO_ESPERA: Readonly<Record<Severity, number>> = { red: 0, orange: 10, yellow: 60, green: 120 };

/** Sala vermelha: vermelho entra no DE até este número acima da capacidade. */
export const SALA_VERMELHA_EXTRA = 2;

/** Corredor do DE: acima deste número, paciente de baixa complexidade pode sair sem atendimento. */
export const LWBS_LIMITE_CORREDOR = 2;
export const P_IR_AO_CORREDOR = 0.4;
export const P_LWBS = 0.3;

// ── Risco, deterioração e óbito ─────────────────────────────

/** Boarding a partir do qual começa o risco de deteriorar (min). */
export const LIMIAR_RISCO_BOARDING: Readonly<Record<Severity, number>> = { red: 60, orange: 120, yellow: 180, green: 240 };
/** Chance por minuto de deteriorar em boarding, depois do limiar. */
export const P_DET_BOARDING = 1 / 60;
/** Chance por minuto de deteriorar esperando na triagem/corredor além do tempo-alvo. */
export const P_DET_ESPERA = 1 / 120;
/** Deteriorado que continua esperando: óbito possível depois deste tempo (min)… */
export const OBITO_APOS_DET_MIN = 120;
/** …com esta chance por minuto. */
export const P_OBITO = 1 / 90;
/** Leito inadequado (paciente de UTI internado na ENF): ≈ 25% em 4 h. */
export const P_DET_LEITO_INADEQUADO = 1 / 800;
/** Faixa de "atenção" antes do limiar de boarding (min). */
export const ATENCAO_ANTES_MIN = 60;

// ── Altas (mesmos pacientes nas duas rodadas, horários diferentes) ──

export interface ConfigLote {
  setor: 'enf' | 'uti';
  quantidade: readonly [number, number];
  horaR1: number;
  horaR2: number;
  /** Preparo na R1 [mín, máx]; na R2 é sempre 0 (Discharge Lounge) */
  prepR1: readonly [number, number];
}

export const LOTES_ALTA: Readonly<Record<ChaveLote, ConfigLote>> = {
  enf1: { setor: 'enf', quantidade: [6, 8], horaR1: 11, horaR2: 8, prepR1: [120, 180] },
  enf2: { setor: 'enf', quantidade: [3, 4], horaR1: 14, horaR2: 12, prepR1: [90, 120] },
  enf3: { setor: 'enf', quantidade: [1, 2], horaR1: 17, horaR2: 15, prepR1: [60, 60] },
  uti1: { setor: 'uti', quantidade: [2, 2], horaR1: 11, horaR2: 9, prepR1: [60, 60] },
  uti2: { setor: 'uti', quantidade: [1, 1], horaR1: 15, horaR2: 13, prepR1: [60, 60] },
};

/** Alta bloqueada por cancelamento cirúrgico (efeito cascata) libera depois deste tempo. */
export const BLOQUEIO_CASCATA_MIN = 120;

// ── Ferramentas Lean (R2) ───────────────────────────────────

export const FLUXISTA_INTERVALO_MIN = 20;
export const FAST_TRACK_VAGAS = 4;
export const FAST_TRACK_FATOR_DECISAO = 0.6;
/** Protocolo de fluxo rápido: DE com ocupação ≥ esta fração acelera as decisões. */
export const FLUXO_RAPIDO_OCUPACAO = 0.8;
export const FLUXO_RAPIDO_BONUS = 1.0;
export const NIR_MAX_USOS = 3;
export const NIR_ESPERA_MIN = 60;
/** PCP / Full Capacity: vagas no corredor da enfermaria. */
export const ENF_EXTRA_VAGAS = 2;

// ── Eventos (mesma frequência nas duas rodadas, salvo indicação) ──

export const P_PCR = 0.008;
export const PCR_DURACAO_MIN = 60;
export const P_EMERGENCIA_CIRURGICA = 0.005;
export const P_OBS_PROLONGADA = 0.004;
export const P_TOMOGRAFO = 0.005;
/** Tomógrafo: duração e acréscimo no tempo de decisão (R1 quebra; R2 manutenção preventiva). */
export const TOMOGRAFO: Readonly<Record<1 | 2, { duracao: number; acrescimo: number }>> = {
  1: { duracao: 120, acrescimo: 120 },
  2: { duracao: 60, acrescimo: 60 },
};
/** Laboratório: chance, duração e acréscimo (na R2 o recurso funciona melhor). */
export const LABORATORIO: Readonly<Record<1 | 2, { p: number; duracao: number; acrescimo: number }>> = {
  1: { p: 0.006, duracao: 90, acrescimo: 60 },
  2: { p: 0.002, duracao: 45, acrescimo: 30 },
};
export const LAB_ACRESCIMO_CHEGADA = 30;
export const P_SOCIAL = 0.005;
export const P_SOCIAL_FAMILIA = 0.004;
/** Duração do bloqueio social (min). Na R2, Alta Segura reduz a 60 min. */
export const SOCIAL_DURACAO_R1: readonly [number, number] = [180, 300];
export const SOCIAL_FAMILIA_DURACAO_R1: readonly [number, number] = [120, 240];
export const SOCIAL_DURACAO_R2 = 60;
/** Atraso da sala 1 na R1 (min). */
export const ATRASO_SALA1_R1: readonly [number, number] = [30, 60];
