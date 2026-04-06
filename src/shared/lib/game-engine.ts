// ============================================================
// Game Engine — Plantão Travado / Plantão Lean
// Funções puras de simulação hospitalar
// ED Leaders × FLAME 2026
// ============================================================

import type { Patient, Surgery, Destination, Severity, RollDestResult, ScoreInput } from '../types/game';
import { SH, HOSP_BEDS, NAMES, SUR } from './constants';
import { rnd, pick } from './format';

let _id = 0;

function mkN(): string {
  return `${pick(NAMES)} ${pick(SUR)}.`;
}

/** Reset ID counter (call before mkInit) */
export function resetId(): void {
  _id = 0;
}

// ── Cirurgias R1 — acumuladas no período matutino ──────────
export function mkSx(): Surgery[] {
  return [
    { id: 1, label: 'Cx Eletiva 1',  sala: 1, stH: 7.5,  dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 2, label: 'Cx Eletiva 2',  sala: 2, stH: 8,    dur: 2.5, dest: 'enf', st: 'scheduled' },
    { id: 3, label: 'Cx Complexa 1', sala: 3, stH: 8,    dur: 3,   dest: 'uti', st: 'scheduled' },
    { id: 4, label: 'Cx Eletiva 3',  sala: 4, stH: 8.5,  dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 5, label: 'Cx Eletiva 4',  sala: 1, stH: 10,   dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 6, label: 'Cx Eletiva 5',  sala: 2, stH: 10.5, dur: 2.5, dest: 'enf', st: 'scheduled' },
    { id: 7, label: 'Cx Complexa 2', sala: 3, stH: 11,   dur: 3,   dest: 'uti', st: 'scheduled' },
  ];
}

// ── Cirurgias R2 — redistribuídas (Surgical Smoothing) ─────
export function mkSxR2(): Surgery[] {
  return [
    { id: 1, label: 'Cx Eletiva 1',  sala: 1, stH: 8,    dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 2, label: 'Cx Eletiva 2',  sala: 2, stH: 9,    dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 3, label: 'Cx Complexa 1', sala: 3, stH: 8.5,  dur: 3,   dest: 'uti', st: 'scheduled' },
    { id: 4, label: 'Cx Eletiva 3',  sala: 4, stH: 10,   dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 5, label: 'Cx Eletiva 4',  sala: 1, stH: 14,   dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 6, label: 'Cx Eletiva 5',  sala: 2, stH: 14.5, dur: 2,   dest: 'enf', st: 'scheduled' },
    { id: 7, label: 'Cx Complexa 2', sala: 3, stH: 15,   dur: 2.5, dest: 'uti', st: 'scheduled' },
  ];
}

// ── Criar paciente ─────────────────────────────────────────
export function mkPt(
  sector: Patient['sector'],
  dest: Destination,
  sev: Severity,
  ready = false,
  deT = 120,
): Patient {
  return {
    id: ++_id, name: mkN(), sector, dest, sev, ready,
    dischReady: false, prep: 0, deNeed: deT, deSpent: ready ? deT : 0,
    bStart: null, bMin: 0, det: false, dead: false, postOp: false,
    blocked: false, offSvc: false, social: false, socialDelay: 0,
    obsProlong: false, obsEnd: 0, arrMin: SH * 60,
  };
}

// ── Estado inicial ─────────────────────────────────────────
// DE   8/15  (53%) — pressão desde o início
// ENF 71/85 (84%) — quase sem folga → ocupação (71+13)/100 = 84%
// UTI 13/15 (87%) — gargalo imediato
export function mkInit(): Patient[] {
  _id = 0;
  const P: Patient[] = [];

  const dePatients: Array<{ dest: Destination; sev: Severity; r: boolean }> = [
    { dest: 'enf',     sev: 'orange', r: true  },
    { dest: 'uti',     sev: 'red',    r: true  },
    { dest: 'enf',     sev: 'yellow', r: true  },
    { dest: 'alta_de', sev: 'green',  r: true  },
    { dest: 'alta_de', sev: 'green',  r: true  },
    { dest: 'enf',     sev: 'yellow', r: false },
    { dest: 'uti',     sev: 'red',    r: false },
    { dest: 'alta_de', sev: 'green',  r: false },
  ];

  dePatients.forEach(c => {
    const p = mkPt('de', c.dest, c.sev, c.r, c.r ? 120 : 120 + rnd(0, 60));
    if (!c.r) p.deSpent = rnd(40, 90);
    if (c.r && c.dest !== 'alta_de') {
      p.bStart = SH * 60 - rnd(60, 120);
      p.bMin = SH * 60 - p.bStart;
    }
    P.push(p);
  });

  for (let i = 0; i < 71; i++) {
    P.push(mkPt('enf', 'alta_enf', Math.random() < 0.6 ? 'green' : 'yellow'));
  }
  for (let i = 0; i < 13; i++) {
    P.push(mkPt('uti', 'step_down', 'red'));
  }

  return P;
}

// ── Taxa de chegada por hora ───────────────────────────────
export function arrRate(h: number, isR2: boolean): number {
  const bonus = (!isR2 && h >= 11 && h < 14) ? 2 : 0;
  if (h < 9)  return 2 + bonus;
  if (h < 11) return 3 + bonus;
  if (h < 14) return 5 + bonus;
  if (h < 17) return 3 + bonus;
  return 2;
}

// ── Destino do paciente novo ───────────────────────────────
export function rollDest(isR2 = false): RollDestResult {
  const r = Math.random();
  if (isR2) {
    if (r < 0.50) return { dest: 'alta_de', sev: Math.random() < 0.7 ? 'green' : 'yellow', de: rnd(30,  60)  };
    if (r < 0.85) return { dest: 'enf',     sev: Math.random() < 0.5 ? 'yellow' : 'orange', de: rnd(80,  120) };
    return             { dest: 'uti',     sev: 'red',                                        de: rnd(60,  100) };
  }
  if (r < 0.50) return { dest: 'alta_de', sev: Math.random() < 0.7 ? 'green' : 'yellow', de: rnd(60,  120) };
  if (r < 0.85) return { dest: 'enf',     sev: Math.random() < 0.5 ? 'yellow' : 'orange', de: rnd(120, 180) };
  return             { dest: 'uti',     sev: 'red',                                        de: rnd(90,  150) };
}

// ── Multiplicador de congestão hospitalar ──────────────────
export function hospMult(enfN: number, utiN: number, isR2 = false): number {
  const p = (enfN + utiN) / HOSP_BEDS * 100;
  if (isR2) {
    if (p <= 80) return 1;
    if (p <= 90) return 1.1;
    return 1.3;
  }
  if (p <= 75) return 1;
  if (p <= 85) return 1.2;
  if (p <= 92) return 1.5;
  return 2;
}

// ── Ocupação hospitalar (internação) ───────────────────────
export function hospOcc(enfN: number, utiN: number): number {
  return Math.round((enfN + utiN) / HOSP_BEDS * 100);
}

// ── Cálculo de score ───────────────────────────────────────
export function calcScore(s: ScoreInput): number {
  let sc = 1500;
  sc -= Math.round(s.boardHrs * 10);
  sc -= s.dets   * 40;
  sc -= s.deaths * 150;
  sc -= s.cxCan  * 80;
  sc -= s.lwbs   * 40;
  sc -= s.offS   * 25;
  sc -= s.socB   * 15;
  sc += (s.altaHosp ?? s.disc ?? 0) * 3;
  if (s.deaths === 0) sc += 150;
  if (s.isR2 && s.deaths === 0 && s.dets === 0 && s.cxCan === 0) sc += 300;
  return Math.max(50, Math.round(sc));
}
