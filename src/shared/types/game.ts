// ============================================================
// Types — Plantão Travado / Plantão Lean
// ED Leaders × FLAME 2026
// ============================================================

export type Sector = 'triagem' | 'de' | 'enf' | 'uti' | 'rpa' | 'corredor' | 'alta';
export type Destination = 'alta_de' | 'enf' | 'uti' | 'alta_enf' | 'step_down';
export type Severity = 'green' | 'yellow' | 'orange' | 'red';
export type SurgeryStatus = 'scheduled' | 'done' | 'cancelled';
export type LogType = 'danger' | 'warning' | 'success' | 'info' | 'fact';
export type Phase = 'role' | 'lobby' | 'facilLogin' | 'waiting' | 'menu' | 'play' | 'over';
export type RoomStatus = 'waiting' | 'round1' | 'debrief' | 'round2' | 'finished';
export type Round = 1 | 2;

export interface Patient {
  id: number;
  name: string;
  sector: Sector;
  dest: Destination;
  sev: Severity;
  ready: boolean;
  dischReady: boolean;
  prep: number;
  deNeed: number;
  deSpent: number;
  bStart: number | null;
  bMin: number;
  det: boolean;
  dead: boolean;
  postOp: boolean;
  blocked: boolean;
  offSvc: boolean;
  social: boolean;
  socialDelay: number;
  obsProlong: boolean;
  obsEnd: number;
  arrMin: number;
  labDelay?: boolean;
}

export interface Surgery {
  id: number;
  label: string;
  sala: number;
  stH: number;
  dur: number;
  dest: 'enf' | 'uti';
  st: SurgeryStatus;
}

export interface Stats {
  disc: number;
  altaHosp: number;
  libDE: number;
  dets: number;
  deaths: number;
  cxCan: number;
  lwbs: number;
  offS: number;
  socB: number;
  boardHrs: number;
}

export interface Events {
  pcr: boolean;
  tomo: boolean;
  surto: boolean;
  social: boolean;
  lab: boolean;
  famDelay: boolean;
  pcrEnd: number;
  tomoEnd: number;
  labEnd: number;
}

export interface LogEntry {
  msg: string;
  type: LogType;
  t: number;
}

export interface Moves {
  total: number;
  produtivo: number;
  reativo: number;
}

export interface OffServiceConfirm {
  sel: Patient;
  sid: Sector;
}

export interface SevInfo {
  c: string;
  l: string;
}

export interface RollDestResult {
  dest: Destination;
  sev: Severity;
  de: number;
}

export interface ScoreInput {
  boardHrs: number;
  dets: number;
  deaths: number;
  cxCan: number;
  lwbs: number;
  offS: number;
  socB: number;
  altaHosp?: number;
  disc?: number;
  isR2?: boolean;
}

export interface MusicUpdateConfig {
  deOcc: number;
  boarding: number;
  deaths: number;
  isR2: boolean;
  run: boolean;
}

export type SfxType = 'death' | 'det' | 'disc' | 'cascade' | 'fluxista';

export interface Capacity {
  de: number;
  enf: number;
  uti: number;
  rpa: number;
}

// Session stored in localStorage
export interface GameSession {
  ph: Phase;
  pts: Patient[];
  sx: Surgery[];
  sm: number;
  st: Stats;
  evts: Events;
  rnd2: Round;
  log: LogEntry[];
  nirUses: number;
  nirCd: number;
  ccBlocked: boolean;
  tName: string;
  rCode: string;
  roomId: string | null;
  teamId: string | null;
  nx: number;
  rd: Record<string, boolean>;
  r1Results: Stats | null;
  fcUses: number;
  savedAt: number;
}
