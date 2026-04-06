// ============================================================
// Constants — Plantão Travado / Plantão Lean
// ============================================================

import type { Capacity, SevInfo } from '../types/game';

export const TICK = 1000;
export const SH = 7;   // Shift start hour
export const EH = 19;  // Shift end hour

export const CAP: Capacity = { de: 15, enf: 85, uti: 15, rpa: 3 };
export const HOSP_BEDS = CAP.enf + CAP.uti; // 100

export const SEV: Record<string, SevInfo> = {
  green:  { c: '#22c55e', l: 'Verde' },
  yellow: { c: '#eab308', l: 'Amarelo' },
  orange: { c: '#f97316', l: 'Laranja' },
  red:    { c: '#ef4444', l: 'Vermelho' },
};

export const NAMES = 'Ana,Benício,Carlos,Diana,Eduardo,Fátima,Gabriel,Helena,Igor,Joana,Karla,Lucas,Márcia,Nelson,Olívia,Pedro,Raquel,Samuel,Teresa,Ulisses,Vera,Wagner,Alice,Bruno,Clara,Diego,Elena,Flávio,Gisele,Heitor,Isabela,Jorge,Luana,Marcos,Natália,Oscar,Paula,Rita,Tomás,Yasmin'.split(',');
export const SUR = 'S,M,P,L,R,C,F,A,O,B,D,G,T,V,N'.split(',');

export const BOARD_DET_MIN = 180;    // 3h boarding → deterioração
export const BOARD_DEAD_MIN = 360;   // 6h boarding → óbito evitável
export const OFFSVC_DET_PROB = 1 / (60 * 2.5); // ~1 em 2.5h off-service → det

export const TEAM_COLORS = [
  '#FF3B3B', '#00d4ff', '#22c55e', '#eab308',
  '#f97316', '#a855f7', '#ec4899', '#14b8a6',
] as const;

export const CREDENTIALS = { user: 'ed.leaders', pass: 'flame2026' } as const;
