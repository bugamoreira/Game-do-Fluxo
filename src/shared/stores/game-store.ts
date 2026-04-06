// ============================================================
// Zustand Game Store — Plantao Travado / Plantao Lean
// Centralizes ALL game state from the Game component
// ED Leaders x FLAME 2026
// ============================================================

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  Phase, Round, Patient, Surgery, Stats, Events, LogEntry, LogType,
  Moves, GameSession, OffServiceConfirm,
} from '../types/game';
import { mkInit, mkSx, mkSxR2, resetId } from '../lib/game-engine';
import { rnd } from '../lib/format';
import { SH } from '../lib/constants';

// ── State shape ─────────────────────────────────────────────

interface GameState {
  // Phase
  ph: Phase;

  // Simulation
  pts: Patient[];
  sx: Surgery[];
  sm: number;
  run: boolean;
  rnd2: Round;

  // Stats
  st: Stats;
  evts: Events;
  log: LogEntry[];

  // UI
  sel: Patient | null;
  fl: string | null;
  cascade: string | null;
  rpaW: string | null;

  // Score pulse
  scorePulse: 'up' | 'down' | null;
  deathFlash: boolean;

  // Game tools
  nirUses: number;
  nirCd: number;
  ccBlocked: boolean;
  showCcModal: number | null;
  fcUses: number;
  fcApproved: boolean;

  // Moves
  moves: Moves;
  r1Results: Stats | null;

  // Multiplayer
  tName: string;
  rCode: string;
  roomId: string | null;
  teamId: string | null;

  // Connection
  connectionStatus: 'online' | 'reconnecting' | 'offline';

  // Off-service confirm
  offServiceConfirm: OffServiceConfirm | null;
}

// ── Actions ─────────────────────────────────────────────────

interface GameActions {
  // Simple setters
  setPhase: (ph: Phase) => void;
  setRun: (run: boolean) => void;
  setSel: (sel: Patient | null) => void;
  setFl: (fl: string | null) => void;
  setCascade: (cascade: string | null) => void;
  setRpaW: (rpaW: string | null) => void;
  setScorePulse: (pulse: 'up' | 'down' | null) => void;
  setDeathFlash: (flash: boolean) => void;
  setNirUses: (n: number) => void;
  setNirCd: (n: number) => void;
  setCcBlocked: (blocked: boolean) => void;
  setShowCcModal: (round: number | null) => void;
  setFcUses: (n: number) => void;
  setFcApproved: (approved: boolean) => void;
  setMoves: (moves: Moves) => void;
  setR1Results: (results: Stats | null) => void;
  setConnectionStatus: (status: 'online' | 'reconnecting' | 'offline') => void;
  setOffServiceConfirm: (confirm: OffServiceConfirm | null) => void;

  // Batch setters (avoid multiple re-renders)
  setPts: (pts: Patient[]) => void;
  setSx: (sx: Surgery[]) => void;
  setSm: (sm: number) => void;
  setSt: (st: Stats) => void;
  setEvts: (evts: Events) => void;
  setLog: (log: LogEntry[]) => void;
  setRnd2: (rnd2: Round) => void;

  // Multiplayer setters
  setTName: (name: string) => void;
  setRCode: (code: string) => void;
  setRoomId: (id: string | null) => void;
  setTeamId: (id: string | null) => void;

  // Complex actions
  addLog: (msg: string, type?: LogType) => void;
  startRound: (roundNum: Round, blocked: boolean) => void;

  // Session persistence
  saveSession: () => void;
  restoreSession: () => boolean;
  clearSession: () => void;
}

// ── Default values ──────────────────────────────────────────

const defaultStats: Stats = {
  disc: 0, altaHosp: 0, libDE: 0, dets: 0, deaths: 0,
  cxCan: 0, lwbs: 0, offS: 0, socB: 0, boardHrs: 0,
};

const defaultEvents: Events = {
  pcr: false, tomo: false, surto: false, social: false,
  lab: false, famDelay: false, pcrEnd: 0, tomoEnd: 0, labEnd: 0,
};

const defaultMoves: Moves = { total: 0, produtivo: 0, reativo: 0 };

// ── Session key ─────────────────────────────────────────────

const SESSION_KEY = 'flame_session';

// ── Store ───────────────────────────────────────────────────

export const useGameStore = create<GameState & GameActions>()(
  devtools(
    (set, get) => ({
      // ── Initial state ───────────────────────────────────────
      ph: 'role',
      pts: [],
      sx: [],
      sm: SH * 60,
      run: false,
      rnd2: 1 as Round,
      st: { ...defaultStats },
      evts: { ...defaultEvents },
      log: [],
      sel: null,
      fl: null,
      cascade: null,
      rpaW: null,
      scorePulse: null,
      deathFlash: false,
      nirUses: 0,
      nirCd: 0,
      ccBlocked: false,
      showCcModal: null,
      fcUses: 0,
      fcApproved: false,
      moves: { ...defaultMoves },
      r1Results: null,
      tName: '',
      rCode: '',
      roomId: null,
      teamId: null,
      connectionStatus: 'online',
      offServiceConfirm: null,

      // ── Simple setters ──────────────────────────────────────
      setPhase:            (ph)       => set({ ph }),
      setRun:              (run)      => set({ run }),
      setSel:              (sel)      => set({ sel }),
      setFl:               (fl)       => set({ fl }),
      setCascade:          (cascade)  => set({ cascade }),
      setRpaW:             (rpaW)     => set({ rpaW }),
      setScorePulse:       (pulse)    => set({ scorePulse: pulse }),
      setDeathFlash:       (flash)    => set({ deathFlash: flash }),
      setNirUses:          (n)        => set({ nirUses: n }),
      setNirCd:            (n)        => set({ nirCd: n }),
      setCcBlocked:        (blocked)  => set({ ccBlocked: blocked }),
      setShowCcModal:      (round)    => set({ showCcModal: round }),
      setFcUses:           (n)        => set({ fcUses: n }),
      setFcApproved:       (approved) => set({ fcApproved: approved }),
      setMoves:            (moves)    => set({ moves }),
      setR1Results:        (results)  => set({ r1Results: results }),
      setConnectionStatus: (status)   => set({ connectionStatus: status }),
      setOffServiceConfirm:(confirm)  => set({ offServiceConfirm: confirm }),
      setPts:              (pts)      => set({ pts }),
      setSx:               (sx)       => set({ sx }),
      setSm:               (sm)       => set({ sm }),
      setSt:               (st)       => set({ st }),
      setEvts:             (evts)     => set({ evts }),
      setLog:              (log)      => set({ log }),
      setRnd2:             (rnd2)     => set({ rnd2 }),
      setTName:            (name)     => set({ tName: name }),
      setRCode:            (code)     => set({ rCode: code }),
      setRoomId:           (id)       => set({ roomId: id }),
      setTeamId:           (id)       => set({ teamId: id }),

      // ── addLog — prepend to log, cap at 60 entries ──────────
      addLog: (msg, type = 'info') => {
        const { sm, log } = get();
        const entry: LogEntry = { msg, type, t: sm };
        set({ log: [entry, ...log].slice(0, 60) });
      },

      // ── startRound — initialize a new round ────────────────
      startRound: (roundNum, blocked) => {
        resetId();
        const patients = mkInit();

        // Build surgery list
        const sxList = roundNum === 2 ? mkSxR2() : mkSx();
        if (roundNum === 1) {
          const delay = rnd(30, 60) / 60; // 0.5-1h delay
          sxList.forEach(s => { if (s.sala === 1) s.stH += delay; });
        }
        if (blocked) {
          sxList.forEach(s => { if (s.sala === 4) s.sala = 3; });
        }

        // Build initial log entries
        const title = roundNum === 2 ? 'PLANTAO LEAN' : 'PLANTAO TRAVADO';
        const ccMsg = blocked
          ? ' Sala 4 reservada para emergencias.'
          : ' Todas as 4 salas em uso eletivo.';
        const r2Msg = roundNum === 2
          ? ' FERRAMENTAS LEAN ATIVAS: Alta precoce, Fast Track, Discharge Lounge, Surgical Smoothing, Fluxista, NIR, Full Capacity, Alta Segura.'
          : '';
        const initLogs: LogEntry[] = [
          { msg: `${title} iniciado! DE 8/15, Enf 71/85, UTI 13/15. Ocupacao hospitalar: 84%.${ccMsg}${r2Msg}`, type: 'info', t: SH * 60 },
        ];
        if (roundNum === 1) {
          const firstSala1 = sxList.find(s => s.sala === 1);
          const delayMin = Math.round(((firstSala1?.stH ?? 7.5) - 7.5) * 60);
          if (delayMin > 0) {
            initLogs.push({ msg: `ATRASO: Primeira cirurgia atrasou ${delayMin}min. Efeito cascata na Sala 1.`, type: 'warning', t: SH * 60 });
          }
        }
        if (roundNum === 2) {
          initLogs.push({ msg: 'BED HUDDLE 7h: Previsao ~40 pacientes. 7 cirurgias redistribuidas. Pico 11h-14h.', type: 'info', t: SH * 60 });
        }

        set({
          ph: 'play',
          pts: patients,
          sx: sxList,
          sm: SH * 60,
          run: true,
          rnd2: roundNum,
          ccBlocked: blocked,
          showCcModal: null,
          sel: null,
          nirUses: 0,
          nirCd: 0,
          fcUses: 0,
          fcApproved: false,
          deathFlash: false,
          moves: { ...defaultMoves },
          st: { ...defaultStats },
          evts: { ...defaultEvents },
          log: initLogs,
          cascade: null,
          rpaW: null,
        });
      },

      // ── saveSession — persist to localStorage ───────────────
      saveSession: () => {
        const s = get();
        try {
          const data: GameSession = {
            ph: s.ph,
            pts: s.pts,
            sx: s.sx,
            sm: s.sm,
            st: s.st,
            evts: s.evts,
            rnd2: s.rnd2,
            log: s.log.slice(0, 20),
            nirUses: s.nirUses,
            nirCd: s.nirCd,
            ccBlocked: s.ccBlocked,
            tName: s.tName,
            rCode: s.rCode,
            roomId: s.roomId,
            teamId: s.teamId,
            nx: 0,               // placeholder — real nx lives in component ref
            rd: {},              // placeholder — real rd lives in component ref
            r1Results: s.r1Results,
            fcUses: s.fcUses,
            savedAt: Date.now(),
          };
          localStorage.setItem(SESSION_KEY, JSON.stringify(data));
        } catch (_e) {
          // localStorage may be full or blocked
        }
      },

      // ── restoreSession — load from localStorage ─────────────
      restoreSession: () => {
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          if (!raw) return false;

          const data: GameSession = JSON.parse(raw);

          // Only restore if saved within the last 5 minutes
          if (!data.savedAt || Date.now() - data.savedAt > 5 * 60 * 1000) {
            localStorage.removeItem(SESSION_KEY);
            return false;
          }

          // Only restore play sessions
          if (data.ph !== 'play') {
            localStorage.removeItem(SESSION_KEY);
            return false;
          }

          set({
            ph: 'play',
            pts: data.pts || [],
            sx: data.sx || [],
            sm: data.sm ?? SH * 60,
            run: true,
            rnd2: data.rnd2 || 1,
            st: data.st || { ...defaultStats },
            evts: data.evts || { ...defaultEvents },
            log: data.log || [],
            nirUses: data.nirUses || 0,
            nirCd: data.nirCd || 0,
            ccBlocked: data.ccBlocked || false,
            tName: data.tName || '',
            rCode: data.rCode || '',
            roomId: data.roomId || null,
            teamId: data.teamId || null,
            r1Results: data.r1Results || null,
            fcUses: data.fcUses || 0,
          });

          return true;
        } catch (_e) {
          return false;
        }
      },

      // ── clearSession — remove from localStorage ─────────────
      clearSession: () => {
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch (_e) {
          // ignore
        }
      },
    }),
    { name: 'FLAME Game Store' },
  ),
);
