// ============================================================
// Motor da simulação — funções puras extraídas do tick de src/player/App.tsx
// Sem React, sem rede, sem Math.random: todo sorteio usa o gerador de estado.rng.
// ============================================================

import type { Destination, Events, LogEntry, LogType, Patient, Sector, Severity, SfxType, Stats } from '../../types/game';
import { arrRate, calcScore, criarPaciente, hospMult, mkInit, mkSx, mkSxR2, nomeAleatorio, rollDest } from '../game-engine';
import { BOARD_DEAD_MIN, BOARD_DET_MIN, CAP, EH, OFFSVC_DET_PROB, SH } from '../constants';
import { criarGerador, estadoDaSemente, type Gerador } from './rng';
import type {
  Acao, ErroAcao, EstadoSimulacao, Metricas, Ocorrencia, OpcoesEstadoInicial,
  ResultadoPasso, Rodada, TipoOcorrencia,
} from './types';

export const MINUTO_INICIO = SH * 60;
export const MINUTO_FIM = EH * 60;
export const LOG_MAX = 60;
export const NIR_MAX_USOS = 3;
export const NIR_ESPERA_MIN = 60;
export const FC_MAX_USOS = 2;

const STATS_ZERO: Stats = { disc: 0, altaHosp: 0, libDE: 0, dets: 0, deaths: 0, cxCan: 0, lwbs: 0, offS: 0, socB: 0, boardHrs: 0 };
const EVENTOS_ZERO: Events = { pcr: false, tomo: false, surto: false, social: false, lab: false, famDelay: false, pcrEnd: 0, tomoEnd: 0, labEnd: 0 };

// ── Utilidades internas ─────────────────────────────────────

type Extra = Omit<Ocorrencia, 'minuto' | 'tipo' | 'msg' | 'nivel'>;

interface Contexto {
  g: Gerador;
  minuto: number;
  ocorrencias: Ocorrencia[];
  proximoId: number;
}

function registrar(ctx: Contexto, tipo: TipoOcorrencia, msg: string, nivel: LogType, extra: Extra = {}): void {
  ctx.ocorrencias.push({ minuto: ctx.minuto, tipo, msg, nivel, ...extra });
}

function novoPaciente(ctx: Contexto, sector: Sector, dest: Destination, sev: Severity, ready = false, deT = 120): Patient {
  const id = ctx.proximoId++;
  return criarPaciente(id, nomeAleatorio(ctx.g.proximo), sector, dest, sev, ready, deT);
}

function contar(P: readonly Patient[], setor: Sector): number {
  let n = 0;
  for (const p of P) if (p.sector === setor) n++;
  return n;
}

function emBoarding(p: Patient): boolean {
  return p.sector === 'de' && p.ready && (p.dest === 'enf' || p.dest === 'uti');
}

/** Novas entradas de log: addL antigo inseria no topo, então a última ocorrência fica primeiro. */
function anexarLog(log: readonly LogEntry[], ocorrencias: readonly Ocorrencia[]): LogEntry[] {
  const novas = ocorrencias.map(o => ({ msg: o.msg, type: o.nivel, t: o.minuto })).reverse();
  return [...novas, ...log].slice(0, LOG_MAX);
}

/** Capacidade efetiva de um setor para movimentos do grupo (DE perde 1 maca durante a parada cardíaca). */
export function capacidadeSetor(estado: EstadoSimulacao, setor: Sector): number {
  if (setor === 'enf') return CAP.enf;
  if (setor === 'uti') return CAP.uti;
  if (setor === 'de') return CAP.de - (estado.eventos.pcr ? 1 : 0);
  return 999;
}

// ── Estado inicial ──────────────────────────────────────────

export function criarEstadoInicial(rodada: Rodada, semente: number, opcoes: OpcoesEstadoInicial = {}): EstadoSimulacao {
  const ccBlocked = opcoes.ccBlocked ?? false;
  const g = criarGerador(estadoDaSemente(semente));
  let proximoId = 1;
  const pacientes = mkInit(g.proximo, () => proximoId++);

  // Cirurgias — em R1, atraso da primeira cirurgia na sala 1
  const cirurgias = rodada === 2 ? mkSxR2() : mkSx();
  if (rodada === 1) {
    const delay = g.inteiro(30, 60) / 60;
    cirurgias.forEach(s => { if (s.sala === 1) s.stH += delay; });
  }
  // Sala 4 reservada para emergências: cirurgias da sala 4 vão para a sala 3
  if (ccBlocked) cirurgias.forEach(s => { if (s.sala === 4) s.sala = 3; });

  const title = rodada === 2 ? 'PLANTAO LEAN' : 'PLANTAO TRAVADO';
  const ccMsg = ccBlocked ? ' Sala 4 reservada para emergências.' : ' Todas as 4 salas em uso eletivo.';
  const r2Msg = rodada === 2 ? ' FERRAMENTAS LEAN ATIVAS: Alta precoce, Fast Track, Discharge Lounge, Surgical Smoothing, Fluxista, NIR, Full Capacity, Alta Segura.' : '';
  const log: LogEntry[] = [{ msg: `${title} iniciado! DE 8/15, Enf 71/85, UTI 13/15. Ocupação hospitalar: 84%.${ccMsg}${r2Msg}`, type: 'info', t: MINUTO_INICIO }];
  if (rodada === 1) {
    const delayMin = Math.round(((cirurgias.find(s => s.sala === 1)?.stH ?? 7.5) - 7.5) * 60);
    if (delayMin > 0) log.push({ msg: `ATRASO: Primeira cirurgia atrasou ${delayMin}min. Efeito cascata na Sala 1.`, type: 'warning', t: MINUTO_INICIO });
  }
  if (rodada === 2) log.push({ msg: 'BED HUDDLE 7h: Previsão ~40 pacientes. 7 cirurgias redistribuídas. Pico 11h-14h.', type: 'info', t: MINUTO_INICIO });

  const proximaChegada = MINUTO_INICIO + g.inteiro(5, 12);

  return {
    versao: 0,
    rodada,
    minuto: MINUTO_INICIO,
    rng: g.estado(),
    pacientes,
    cirurgias,
    stats: { ...STATS_ZERO },
    eventos: { ...EVENTOS_ZERO },
    flags: ccBlocked ? { ccBlocked: true } : {},
    proximaChegada,
    ferramentas: { nirUsos: 0, nirEspera: 0, fcUsos: 0, fcLiberado: false },
    log,
    proximoId,
  };
}

// ── Passo (1 minuto simulado) ───────────────────────────────

export function passo(estado: EstadoSimulacao): ResultadoPasso {
  if (estado.minuto >= MINUTO_FIM) return { estado, ocorrencias: [] };

  const cm = estado.minuto + 1;
  const ch = Math.floor(cm / 60);
  const isR2 = estado.rodada === 2;
  const ctx: Contexto = { g: criarGerador(estado.rng), minuto: cm, ocorrencias: [], proximoId: estado.proximoId };
  const rand = ctx.g.proximo;
  const rnd = ctx.g.inteiro;

  const P = estado.pacientes.map(p => ({ ...p }));
  const S: Stats = { ...estado.stats };
  const E: Events = { ...estado.eventos };
  const R: Record<string, boolean> = { ...estado.flags };
  const ccBlocked = R.ccBlocked === true;
  const ferramentas = { ...estado.ferramentas };
  let proximaChegada = estado.proximaChegada;

  // ── Eventos aleatórios ────────────────────────────────────

  // Parada cardíaca — mais frequente em R1
  if (ch >= 9 && ch < 16 && !E.pcr && rand() < (isR2 ? 0.004 : 0.008)) {
    E.pcr = true; E.pcrEnd = cm + 60;
    registrar(ctx, 'pcr', 'PARADA CARDIACA no DE! 1 maca bloqueada por 1h.', 'danger');
  }
  if (E.pcr && cm >= E.pcrEnd) { E.pcr = false; registrar(ctx, 'pcr_fim', 'Parada resolvida. Maca liberada.', 'success'); }

  // Tomógrafo quebrado
  if (ch >= 8 && ch < 14 && !E.tomo && rand() < 0.005) {
    const tomoDur = isR2 ? 60 : 120;
    E.tomo = true; E.tomoEnd = cm + tomoDur;
    if (isR2) registrar(ctx, 'tomografo', 'TOMOGRAFO: manutencao preventiva, retorno em 1h.', 'warning');
    else registrar(ctx, 'tomografo', 'TOMOGRAFO QUEBROU! Decisao +120min para todos no DE.', 'danger');
  }
  if (E.tomo && cm >= E.tomoEnd) { E.tomo = false; registrar(ctx, 'tomografo_fim', 'Tomografo reparado.', 'success'); }

  // Exames com atraso (Teoria das Restrições)
  if (ch >= 9 && ch < 16 && !E.lab && rand() < (isR2 ? 0.002 : 0.006)) {
    E.lab = true; E.labEnd = cm + (isR2 ? 45 : 90);
    const affected = P.filter(p => p.sector === 'de' && !p.ready && !p.obsProlong).slice(0, rnd(2, 4));
    affected.forEach(p => { p.deNeed += isR2 ? 30 : 60; p.labDelay = true; });
    registrar(ctx, 'laboratorio', `ATRASO NO LABORATORIO! ${affected.length} pacientes aguardando resultados (+${isR2 ? 30 : 60}min).`, 'warning');
  }
  if (E.lab && cm >= E.labEnd) {
    E.lab = false;
    P.forEach(p => { if (p.labDelay) p.labDelay = false; });
    registrar(ctx, 'laboratorio_fim', 'Laboratorio normalizado.', 'success');
  }

  // Surto: GARANTIDO às 12h na R1, aleatório na R2
  const surtoForced = !isR2 && cm === 12 * 60 && !E.surto;
  const surtoRandom = ch >= 12 && ch < 15 && !E.surto && rand() < 0.006;
  if (surtoForced || surtoRandom) {
    E.surto = true;
    for (let i = 0; i < 3; i++) {
      const d = i < 2 ? rollDest(isR2, rand) : { dest: 'uti' as const, sev: 'red' as const, de: rnd(90, 150) };
      const np = novoPaciente(ctx, 'triagem', d.dest, d.sev, false, d.de); np.arrMin = cm; P.push(np);
    }
    registrar(ctx, 'surto', 'SURTO! 3 pacientes simultâneos chegando!', 'danger', { som: 'cascade' });
  }

  // Paciente social (atraso de familiares)
  if (ch >= 10 && ch < 17 && !E.social && rand() < 0.005) {
    E.social = true;
    const ef = P.find(p => p.sector === 'enf' && p.dischReady && p.prep <= 0 && !p.social && !p.blocked);
    if (ef) {
      ef.social = true; ef.socialDelay = isR2 ? 60 : rnd(180, 300); S.socB++;
      registrar(ctx, 'social',
        `ATRASO DE FAMILIARES: ${ef.name} — leito bloqueado ~${Math.round(ef.socialDelay / 60)}h.${isR2 ? ' Alta segura acionada: reduzido a 1h.' : ''}`,
        isR2 ? 'info' : 'warning', { pacienteId: ef.id });
    }
  }

  // Segundo caso social em R1 (agrava o problema)
  if (!isR2 && ch >= 13 && ch < 16 && !E.famDelay && rand() < 0.004) {
    E.famDelay = true;
    const ef = P.find(p => p.sector === 'enf' && p.dischReady && p.prep <= 0 && !p.social && !p.blocked);
    if (ef) {
      ef.social = true; ef.socialDelay = rnd(120, 240); S.socB++;
      registrar(ctx, 'bloqueio_social', `BLOQUEIO SOCIAL: ${ef.name} — sem responsavel, leito preso ~${Math.round(ef.socialDelay / 60)}h!`, 'warning', { pacienteId: ef.id });
    }
  }

  // Cirurgia de emergência do DE
  if (ch >= 9 && ch < 16 && rand() < (isR2 ? 0.003 : 0.005)) {
    const emg = P.find(p => p.sector === 'de' && p.sev === 'red' && !p.dead && !p.postOp);
    if (emg) {
      const rpaCount = contar(P, 'rpa');
      if (rpaCount < CAP.rpa) {
        emg.sector = 'rpa'; emg.postOp = true; emg.ready = true; emg.dest = 'uti';
        emg.name = `EMG-${emg.name.split(' ')[0]}`;
        registrar(ctx, 'emergencia_cirurgica', `EMERGÊNCIA CIRÚRGICA: ${emg.name} → CC${ccBlocked ? ' (sala reservada)' : ''} → RPA.`, 'danger', { som: 'cascade', pacienteId: emg.id });
      } else if (!ccBlocked) {
        // RPA lotada e sem sala reservada → óbito
        emg.dead = true; S.deaths++;
        registrar(ctx, 'emergencia_obito', `SEM SALA CIRÚRGICA! ${emg.name} — óbito evitável. RPA lotada, sem sala reservada.`, 'danger', { som: 'death', flashObito: true, pacienteId: emg.id });
      } else {
        // Sala reservada mas RPA lotada — opera na sala reservada, paciente fica em espera
        emg.blocked = true;
        emg.ready = false;
        registrar(ctx, 'emergencia_espera', `EMERGÊNCIA: ${emg.name} operado na sala reservada. Aguardando vaga na RPA.`, 'warning', { pacienteId: emg.id });
      }
    }
  }

  // Observação prolongada
  if (ch >= 9 && ch < 15 && rand() < 0.004) {
    const pp = P.find(p => p.sector === 'de' && !p.ready && !p.obsProlong);
    if (pp) {
      pp.obsProlong = true; pp.obsEnd = cm + rnd(300, 480); pp.deNeed = 99999;
      registrar(ctx, 'obs_prolongada', `OBS PROLONGADA: ${pp.name} — maca presa por ${Math.round((pp.obsEnd - cm) / 60)}h.`, 'warning', { pacienteId: pp.id });
    }
  }
  P.forEach(p => {
    if (p.obsProlong && cm >= p.obsEnd) {
      p.obsProlong = false; p.ready = true; p.dest = 'alta_de';
      registrar(ctx, 'obs_fim', `${p.name} (obs) liberado.`, 'success', { pacienteId: p.id });
    }
  });

  // ── Chegadas ──────────────────────────────────────────────
  if (cm >= proximaChegada) {
    const d = rollDest(isR2, rand);
    const np = novoPaciente(ctx, 'triagem', d.dest, d.sev, false, d.de);
    np.arrMin = cm;
    if (E.tomo) np.deNeed += 120;
    if (E.lab) { np.deNeed += 30; np.labDelay = true; }
    const pcrB0 = E.pcr ? 1 : 0;
    if (contar(P, 'de') < CAP.de - pcrB0) np.sector = 'de';
    P.push(np);
    const rate = arrRate(ch, isR2);
    proximaChegada = cm + Math.max(3, Math.round(60 / rate) + rnd(-4, 4));
  }

  // Triagem → DE automático
  const porta = P.filter(p => p.sector === 'triagem').sort((a, b) => a.arrMin - b.arrMin);
  const pcrB = E.pcr ? 1 : 0;
  const space = CAP.de - pcrB - contar(P, 'de');
  for (let i = 0; i < Math.min(space, porta.length); i++) porta[i]!.sector = 'de';

  // Processamento do DE com multiplicador de congestão hospitalar
  const mult = hospMult(contar(P, 'enf'), contar(P, 'uti'), isR2);
  P.forEach(p => {
    if (p.sector === 'de' && !p.ready && !p.obsProlong) {
      p.deSpent += mult;
      if (p.deSpent >= p.deNeed) { p.ready = true; if (p.labDelay) p.labDelay = false; }
    }
  });

  // R2: Fluxista — alta automática de alta_de a cada 20 min
  if (isR2 && cm % 20 === 0) {
    const fluxPts = P.filter(p => p.sector === 'de' && p.ready && p.dest === 'alta_de');
    fluxPts.forEach((p, i) => {
      p.sector = 'alta'; S.disc++;
      const som: SfxType | undefined = i === 0 ? 'fluxista' : undefined;
      registrar(ctx, 'fluxista', `Fluxista: ${p.name} — alta automática.`, 'success', som ? { som, pacienteId: p.id } : { pacienteId: p.id });
    });
  }

  // R2: Fast Track — verdes processam 40% mais rápido
  if (isR2) {
    P.forEach(p => { if (p.sector === 'de' && !p.ready && !p.obsProlong && p.sev === 'green') p.deSpent += 0.4; });
  }

  // R2: Fluxo puxado — DE lotado ACELERA decisões
  if (isR2 && contar(P, 'de') >= Math.round(CAP.de * 0.8)) {
    P.forEach(p => { if (p.sector === 'de' && !p.ready && !p.obsProlong) p.deSpent += 1.0; });
    if (!R.pullLog) { R.pullLog = true; registrar(ctx, 'fluxo_rapido', 'PROTOCOLO DE FLUXO RAPIDO ATIVO — decisoes aceleradas no DE.', 'success'); }
  }

  // Espera do NIR
  if (ferramentas.nirEspera > 0) ferramentas.nirEspera = Math.max(0, ferramentas.nirEspera - 1);

  // ── Consequências do boarding ─────────────────────────────
  P.forEach(p => {
    if (emBoarding(p)) {
      if (!p.bStart) p.bStart = cm;
      p.bMin = cm - p.bStart;
      S.boardHrs += 1 / 60;
      if (p.bMin >= BOARD_DET_MIN && !p.det) {
        p.det = true; S.dets++;
        registrar(ctx, 'deterioracao', `DETERIORAÇÃO: ${p.name} — ${Math.floor(p.bMin / 60)}h em boarding!`, 'warning', { som: 'det', pacienteId: p.id });
      }
      if (p.bMin >= BOARD_DEAD_MIN && !p.dead) {
        p.dead = true; S.deaths++;
        registrar(ctx, 'obito', `ÓBITO EVITÁVEL: ${p.name} — ${Math.floor(p.bMin / 60)}h em boarding.`, 'danger', { som: 'death', flashObito: true, pacienteId: p.id });
      }
    }
  });

  // Deterioração fora do perfil
  P.forEach(p => {
    if (p.offSvc && p.sector === 'enf' && !p.dead && !p.det && rand() < OFFSVC_DET_PROB) {
      p.det = true; p.sev = 'red'; S.dets++;
      // Fluxo reverso: deteriorou fora do perfil + UTI lotada → volta ao DE
      if (contar(P, 'uti') >= CAP.uti) {
        p.sector = 'de'; p.offSvc = false;
        registrar(ctx, 'retorno_de', `RETORNO AO DE: ${p.name} — deteriorou na ENF, sem vaga UTI. Damage control.`, 'danger', { som: 'det', pacienteId: p.id });
      } else {
        registrar(ctx, 'deterioracao_fora_do_perfil', `${p.name} deteriorou FORA DO PERFIL!`, 'warning', { som: 'det', pacienteId: p.id });
      }
    }
  });

  // Dados reais — overlay educativo (1x cada)
  if (S.boardHrs >= 2 && !R.factBoard) { R.factBoard = true; registrar(ctx, 'dado_real', 'Dados reais: boarding >2h aumenta risco de eventos adversos em 20%.', 'fact'); }
  if (S.dets >= 1 && !R.factDet) { R.factDet = true; registrar(ctx, 'dado_real', 'Estudos mostram: cada hora de boarding >4h aumenta mortalidade em 2%.', 'fact'); }
  if (S.deaths >= 1 && !R.factDeath) { R.factDeath = true; registrar(ctx, 'dado_real', 'Em hospitais com ocupação >95%, mortalidade cresce 8% por cada 10% de boarding adicional.', 'fact'); }
  if (S.cxCan >= 1 && !R.factCx) { R.factCx = true; registrar(ctx, 'dado_real', 'Cirurgias canceladas por falta de leito custam em média R$15.000 por caso.', 'fact'); }

  // Corredor — DE cheio e mais de 2 na triagem
  if (contar(P, 'de') >= CAP.de - pcrB && contar(P, 'triagem') > 2) {
    const tc = P.find(p => p.sector === 'triagem');
    if (tc && rand() < 0.4) { tc.sector = 'corredor'; registrar(ctx, 'corredor', `${tc.name} → CORREDOR — sem macas disponíveis!`, 'warning', { pacienteId: tc.id }); }
  }
  // LWBS dispara mais cedo em R1 (corredor > 2)
  const corredorLimit = isR2 ? 3 : 2;
  if (contar(P, 'corredor') > corredorLimit) {
    const lw = P.find(p => p.sector === 'corredor' && p.dest === 'alta_de' && !p.dead);
    if (lw && rand() < 0.3) { lw.sector = 'alta'; S.lwbs++; registrar(ctx, 'lwbs', `${lw.name} SAIU SEM ATENDIMENTO! (LWBS)`, 'danger', { pacienteId: lw.id }); }
  }

  // Contagem regressiva do bloqueio social
  P.forEach(p => {
    if (p.social && p.socialDelay > 0) {
      p.socialDelay--;
      if (p.socialDelay <= 0) { p.social = false; registrar(ctx, 'social_fim', `${p.name} (social) liberado.`, 'success', { pacienteId: p.id }); }
    }
  });

  // Rounds da ENF — R1: round médico às 11h (preparo 2-3h); R2: Bed Huddle às 8h (leito libera na hora)
  const enfRoundH = isR2 ? 8 : 11;
  const candidatosAlta = (): Patient[] => P.filter(p => p.sector === 'enf' && !p.dischReady && !p.blocked && !p.social);
  if (ch >= enfRoundH && !R.e1) {
    R.e1 = true;
    const c = candidatosAlta();
    const n = Math.min(rnd(6, 8), c.length);
    for (let i = 0; i < n; i++) { c[i]!.dischReady = true; c[i]!.prep = isR2 ? 0 : rnd(120, 180); }
    if (isR2) registrar(ctx, 'round_enf', `BED HUDDLE ${enfRoundH}h: ${n} altas prescritas. Discharge Lounge: leitos liberam IMEDIATO.`, 'success');
    else registrar(ctx, 'round_enf', `ROUND MÉDICO ${enfRoundH}h: ${n} altas prescritas. Preparo estimado: 2-3h. TARDE DEMAIS!`, 'warning');
  }
  if (ch >= 14 && !R.e2) {
    R.e2 = true;
    const c = candidatosAlta();
    const n = Math.min(rnd(3, 4), c.length);
    for (let i = 0; i < n; i++) { c[i]!.dischReady = true; c[i]!.prep = isR2 ? 0 : rnd(90, 120); }
    registrar(ctx, 'round_enf', `ROUND 14h: ${n} altas.${isR2 ? ' Liberação imediata.' : ' Preparo ~1.5-2h.'}`, 'success');
  }
  if (ch >= 17 && !R.e3) {
    R.e3 = true;
    const c = candidatosAlta();
    const n = Math.min(rnd(1, 2), c.length);
    for (let i = 0; i < n; i++) { c[i]!.dischReady = true; c[i]!.prep = isR2 ? 0 : 60; }
    if (n > 0) registrar(ctx, 'round_enf', `ROUND 17h: ${n} alta(s) esporádica(s).`, 'info');
  }

  // Step-down da UTI
  if (ch >= 11 && !R.u1) {
    R.u1 = true;
    const c = P.filter(p => p.sector === 'uti' && !p.dischReady);
    for (let i = 0; i < Math.min(2, c.length); i++) {
      const u = c[i]!;
      u.dischReady = true; u.dest = 'enf'; u.prep = isR2 ? 0 : 60;
      registrar(ctx, 'round_uti', `Alta UTI: ${u.name} step-down → ENF.`, 'info', { pacienteId: u.id });
    }
  }
  if (ch >= 15 && !R.u2) {
    R.u2 = true;
    const u = P.find(p => p.sector === 'uti' && !p.dischReady);
    if (u) {
      u.dischReady = true; u.dest = 'enf'; u.prep = isR2 ? 0 : 60;
      registrar(ctx, 'round_uti', `Alta UTI: ${u.name} step-down → ENF.`, 'info', { pacienteId: u.id });
    }
  }

  P.forEach(p => { if (p.prep > 0) p.prep--; });

  // ── Centro cirúrgico ──────────────────────────────────────
  const cirurgias = estado.cirurgias.map(s => ({ ...s }));
  cirurgias.forEach(s => {
    if (s.st !== 'scheduled') return;
    const enM = s.stH * 60 + s.dur * 60;
    if (cm < enM) return;
    if (contar(P, 'rpa') >= CAP.rpa) {
      s.st = 'cancelled'; S.cxCan++;
      const disch = P.find(p => p.sector === 'enf' && p.dischReady && p.prep <= 0 && !p.blocked && !p.social);
      if (disch) {
        disch.dischReady = false; disch.blocked = true;
        registrar(ctx, 'cirurgia_cancelada', `${s.label} CANCELADA! ${disch.name} perde alta. EFEITO CASCATA.`, 'danger',
          { som: 'cascade', pacienteId: disch.id, cascata: { texto: `${s.label} cancelada → ${disch.name} perde alta → leito não gira`, duracaoMs: 8000 } });
      } else {
        registrar(ctx, 'cirurgia_cancelada', `${s.label} CANCELADA — RPA lotada!`, 'danger',
          { som: 'cascade', cascata: { texto: 'Cirurgia cancelada → menos giro → mais boarding', duracaoMs: 6000 } });
      }
    } else {
      s.st = 'done';
      const np = criarPaciente(ctx.proximoId++, `PO-${s.label.replace('Cx ', '')}`, 'rpa', s.dest, s.dest === 'uti' ? 'red' : 'orange', true);
      np.postOp = true;
      P.push(np);
      registrar(ctx, 'cirurgia_concluida', `${np.name} → RPA, precisa de ${s.dest === 'uti' ? 'UTI' : 'ENF'}.`, 'info', { pacienteId: np.id });
    }
  });

  if (cm >= MINUTO_FIM) registrar(ctx, 'fim', 'Plantao encerrado!', 'success');

  return {
    estado: {
      versao: estado.versao + 1,
      rodada: estado.rodada,
      minuto: Math.min(cm, MINUTO_FIM),
      rng: ctx.g.estado(),
      pacientes: P,
      cirurgias,
      stats: S,
      eventos: E,
      flags: R,
      proximaChegada,
      ferramentas,
      log: anexarLog(estado.log, ctx.ocorrencias),
      proximoId: ctx.proximoId,
    },
    ocorrencias: ctx.ocorrencias,
  };
}

/** Reconexão: aplica `passo` até chegar ao minuto pedido (limitado a 19h), sem decisões do grupo. */
export function avancarAte(estado: EstadoSimulacao, minuto: number): ResultadoPasso {
  const alvo = Math.min(minuto, MINUTO_FIM);
  let atual = estado;
  const ocorrencias: Ocorrencia[] = [];
  while (atual.minuto < alvo) {
    const r = passo(atual);
    atual = r.estado;
    ocorrencias.push(...r.ocorrencias);
  }
  return { estado: atual, ocorrencias };
}

// ── Decisões do grupo ───────────────────────────────────────

/** Destinos que o grupo pode escolher para o paciente (sem checar lotação). Igual ao getT do App. */
export function destinosPossiveis(estado: EstadoSimulacao, pacienteId: number): Sector[] {
  const p = estado.pacientes.find(x => x.id === pacienteId);
  if (!p) return [];
  const t: Sector[] = [];
  if (p.sector === 'triagem' || p.sector === 'corredor') t.push('de');
  if (p.sector === 'de' && p.ready) {
    if (p.dest === 'alta_de') t.push('alta');
    if (p.dest === 'enf') t.push('enf');
    if (p.dest === 'uti') { t.push('uti'); t.push('enf'); }
  }
  if (p.sector === 'enf' && p.dischReady && p.prep <= 0 && !p.social) t.push('alta');
  if (p.sector === 'uti' && p.dischReady && p.prep <= 0) { if (p.dest === 'enf') t.push('enf'); else t.push('alta'); }
  if (p.sector === 'rpa' && p.ready) { if (p.dest === 'enf') t.push('enf'); if (p.dest === 'uti') { t.push('uti'); t.push('enf'); } }
  return t;
}

function erro(codigo: ErroAcao['codigo'], msg: string): ErroAcao {
  return { erro: msg, codigo };
}

function concluirAcao(estado: EstadoSimulacao, mudancas: Partial<EstadoSimulacao>, ocorrencias: Ocorrencia[]): ResultadoPasso {
  const novo: EstadoSimulacao = { ...estado, ...mudancas, versao: estado.versao + 1 };
  novo.log = anexarLog(estado.log, ocorrencias);
  return { estado: novo, ocorrencias };
}

function substituir(P: readonly Patient[], id: number, f: (p: Patient) => Patient): Patient[] {
  return P.map(p => (p.id === id ? f(p) : p));
}

function oc(estado: EstadoSimulacao, tipo: TipoOcorrencia, msg: string, nivel: LogType, extra: Extra = {}): Ocorrencia {
  return { minuto: estado.minuto, tipo, msg, nivel, ...extra };
}

function verificarLotacao(estado: EstadoSimulacao, destino: Sector): ErroAcao | null {
  if (destino === 'alta') return null;
  if (contar(estado.pacientes, destino) >= capacidadeSetor(estado, destino)) {
    return erro('lotado', `${destino.toUpperCase()} LOTADO!`);
  }
  return null;
}

function mover(estado: EstadoSimulacao, p: Patient, destino: Sector): ResultadoPasso | ErroAcao {
  if (!destinosPossiveis(estado, p.id).includes(destino)) return erro('destino_invalido', `${p.name} não pode ir para ${destino.toUpperCase()} agora.`);
  const lotado = verificarLotacao(estado, destino);
  if (lotado) return lotado;
  const isOff = p.dest === 'uti' && destino === 'enf' && p.sector !== 'uti';
  if (isOff) return erro('confirmar_fora_do_perfil', `${p.name} precisa de UTI. Confirme o envio FORA DO PERFIL para a ENF.`);

  const isProd = destino === 'alta' || destino === 'enf' || (destino === 'uti' && p.dest === 'uti');
  const decisao = isProd ? 'produtiva' as const : 'reativa' as const;
  let stats = estado.stats;
  let ocorrencia: Ocorrencia;
  if (destino === 'alta') {
    const isHospDisc = p.sector === 'enf'; // alta hospitalar = só ENF
    stats = { ...stats, disc: stats.disc + 1, altaHosp: stats.altaHosp + (isHospDisc ? 1 : 0), libDE: stats.libDE + (p.sector === 'de' ? 1 : 0) };
    ocorrencia = oc(estado, 'alta', `${p.name} — ${isHospDisc ? 'alta hospitalar' : 'liberação DE'}.`, 'success', { som: 'disc', pacienteId: p.id, decisao });
  } else {
    ocorrencia = oc(estado, 'movimento', `${p.name} → ${destino.toUpperCase()}`, 'info', { pacienteId: p.id, decisao });
  }
  // Evolução clínica: step-down UTI→ENF = melhorou
  const sev: Severity = p.sector === 'uti' && destino === 'enf' && p.dischReady ? 'green' : p.sev;
  const pacientes = substituir(estado.pacientes, p.id, x => ({
    ...x, sector: destino, sev, ready: false, dischReady: false, bStart: null, bMin: 0, offSvc: false, obsProlong: false,
  }));
  return concluirAcao(estado, { pacientes, stats }, [ocorrencia]);
}

function confirmarForaDoPerfil(estado: EstadoSimulacao, p: Patient): ResultadoPasso | ErroAcao {
  const isOff = p.dest === 'uti' && p.sector !== 'uti' && destinosPossiveis(estado, p.id).includes('enf');
  if (!isOff) return erro('destino_invalido', `${p.name} não é candidato a envio fora do perfil.`);
  const lotado = verificarLotacao(estado, 'enf');
  if (lotado) return lotado;
  const pacientes = substituir(estado.pacientes, p.id, x => ({ ...x, sector: 'enf', ready: false, dischReady: false, bStart: null, bMin: 0, offSvc: true }));
  const stats = { ...estado.stats, offS: estado.stats.offS + 1 };
  return concluirAcao(estado, { pacientes, stats }, [
    oc(estado, 'fora_do_perfil', `FORA DO PERFIL: ${p.name} UTI→ENF. Risco elevado!`, 'warning', { pacienteId: p.id, decisao: 'reativa' }),
  ]);
}

function nir(estado: EstadoSimulacao, p: Patient): ResultadoPasso | ErroAcao {
  const f = estado.ferramentas;
  if (estado.rodada !== 2) return erro('ferramenta_indisponivel', 'NIR disponível apenas no Plantão Lean.');
  if (f.nirUsos >= NIR_MAX_USOS) return erro('ferramenta_indisponivel', `NIR esgotado — limite de ${NIR_MAX_USOS} usos atingido.`);
  if (f.nirEspera > 0) return erro('ferramenta_indisponivel', `NIR em espera — disponível em ${f.nirEspera} min.`);
  if (p.sector !== 'de' || !p.ready || p.dest === 'alta_de') return erro('destino_invalido', 'NIR apenas para pacientes do DE com indicação de internação.');
  const pacientes = estado.pacientes.filter(x => x.id !== p.id);
  const ferramentas = { ...f, nirUsos: f.nirUsos + 1, nirEspera: NIR_ESPERA_MIN };
  return concluirAcao(estado, { pacientes, ferramentas }, [
    oc(estado, 'nir', `NIR: ${p.name} transferido para outra unidade. (${f.nirUsos + 1}/3 usos)`, 'success', { som: 'disc', pacienteId: p.id }),
  ]);
}

function fullCapacity(estado: EstadoSimulacao, p: Patient): ResultadoPasso | ErroAcao {
  const f = estado.ferramentas;
  if (estado.rodada !== 2) return erro('ferramenta_indisponivel', 'FULL CAPACITY disponível apenas no Plantão Lean.');
  if (!f.fcLiberado) return erro('ferramenta_indisponivel', 'FULL CAPACITY negado — aguardando autorização da Diretoria.');
  if (f.fcUsos >= FC_MAX_USOS) return erro('ferramenta_indisponivel', 'FULL CAPACITY esgotado — limite de 2 pacientes atingido.');
  if (p.sector !== 'de' || !p.ready || p.sev !== 'green' || p.dest === 'alta_de') {
    return erro('destino_invalido', 'FULL CAPACITY apenas para pacientes VERDES com indicação de internação no DE.');
  }
  const pacientes = substituir(estado.pacientes, p.id, x => ({ ...x, sector: 'corredor', bStart: null, bMin: 0 }));
  const ferramentas = { ...f, fcUsos: f.fcUsos + 1 };
  return concluirAcao(estado, { pacientes, ferramentas }, [
    oc(estado, 'full_capacity', `FULL CAPACITY: ${p.name} ao corredor da enfermaria. Maca liberada. (${f.fcUsos + 1}/2 usos)`, 'success', { pacienteId: p.id }),
  ]);
}

export function aplicarAcao(estado: EstadoSimulacao, acao: Acao): ResultadoPasso | ErroAcao {
  if (estado.minuto >= MINUTO_FIM) return erro('fim_de_jogo', 'Plantão encerrado.');
  const p = estado.pacientes.find(x => x.id === acao.pacienteId);
  if (!p) return erro('paciente_inexistente', 'Paciente não encontrado.');
  switch (acao.tipo) {
    case 'mover': return mover(estado, p, acao.destino);
    case 'confirmarForaDoPerfil': return confirmarForaDoPerfil(estado, p);
    case 'nir': return nir(estado, p);
    case 'fullCapacity': return fullCapacity(estado, p);
  }
}

export function ehErro(r: ResultadoPasso | ErroAcao): r is ErroAcao {
  return 'erro' in r;
}

/** Facilitador libera o Full Capacity (hoje: polling de rooms.full_cap_approved). Só tem efeito na R2. */
export function liberarFullCapacity(estado: EstadoSimulacao): ResultadoPasso {
  if (estado.rodada !== 2 || estado.ferramentas.fcLiberado) return { estado, ocorrencias: [] };
  return concluirAcao(estado, { ferramentas: { ...estado.ferramentas, fcLiberado: true } }, [
    oc(estado, 'full_capacity_liberado', 'DIRETORIA AUTORIZOU Full Capacity! 2 pacientes verdes podem ir ao corredor.', 'success'),
  ]);
}

// ── Leituras ────────────────────────────────────────────────

export function pontuacao(estado: EstadoSimulacao): number {
  return calcScore({ ...estado.stats, isR2: estado.rodada === 2 });
}

export function metricas(estado: EstadoSimulacao): Metricas {
  const P = estado.pacientes;
  const S = estado.stats;
  const brd = P.filter(p => emBoarding(p) && !p.dead);
  const avgB = brd.length > 0 ? Math.round(brd.reduce((a, p) => a + p.bMin, 0) / brd.length) : 0;
  return {
    dis: S.disc, det: S.dets, dth: S.deaths, cxC: S.cxCan, lw: S.lwbs, off: S.offS, soc: S.socB, bH: S.boardHrs,
    deOcc: contar(P, 'de'), enfOcc: contar(P, 'enf'), utiOcc: contar(P, 'uti'), rpaOcc: contar(P, 'rpa'),
    boarding: brd.length, avgB, corredor: contar(P, 'corredor'),
    altaHosp: S.altaHosp, libDE: S.libDE,
  };
}

/** Aviso de RPA quase cheia antes da próxima cirurgia terminar (hoje `setRpaW`). */
export function alertaRpa(estado: EstadoSimulacao): string | null {
  const cm = estado.minuto;
  const rC = contar(estado.pacientes, 'rpa');
  const nxt = estado.cirurgias.find(s => s.st === 'scheduled' && cm < s.stH * 60 + s.dur * 60);
  if (!nxt || rC < 2) return null;
  const mL = Math.round(nxt.stH * 60 + nxt.dur * 60 - cm);
  return mL > 0 && mL <= 45 ? `RPA ${rC}/${CAP.rpa} — ${nxt.label} termina em ${mL} min` : null;
}

export function encerrado(estado: EstadoSimulacao): boolean {
  return estado.minuto >= MINUTO_FIM;
}
