// ============================================================
// Motor da simulação — funções puras (contrato B1, docs/contratos.md §1)
// Regras aprovadas no Portão 2 (docs/revisao-logica.md). Sem React, sem rede,
// sem Math.random: a demanda vem pronta da agenda (gerador de demanda) e os
// eventos usam o gerador de estado.rng.
// ============================================================

import type { Events, LogEntry, LogType, Patient, Sector, Severity, Stats } from '../../types/game';
import { calcScore, criarPaciente, hospMult, mkInit, mkSx, mkSxR2 } from '../game-engine';
import { CAP } from '../constants';
import { gerarChegadas, gerarLotesAlta } from './agenda';
import {
  ALVO_ESPERA, ATENCAO_ANTES_MIN, ATRASO_SALA1_R1, BLOQUEIO_CASCATA_MIN, ENF_EXTRA_VAGAS,
  FAST_TRACK_FATOR_DECISAO, FAST_TRACK_VAGAS, FLUXISTA_INTERVALO_MIN, FLUXO_RAPIDO_BONUS, FLUXO_RAPIDO_OCUPACAO,
  LAB_ACRESCIMO_CHEGADA, LABORATORIO, LIMIAR_RISCO_BOARDING, LOTES_ALTA, LWBS_LIMITE_CORREDOR,
  NIR_ESPERA_MIN, NIR_MAX_USOS, NIR_TRANSFERENCIA_R1_MIN, NIR_TRANSFERENCIA_R2_MIN, OBITO_APOS_DET_MIN, P_DET_BOARDING, P_DET_ESPERA, P_DET_LEITO_INADEQUADO,
  P_EMERGENCIA_CIRURGICA, P_IR_AO_CORREDOR, P_LWBS, P_OBITO, P_OBS_PROLONGADA, P_PCR, P_SOCIAL, P_SOCIAL_FAMILIA,
  P_TOMOGRAFO, PCR_DURACAO_MIN, PRIORIDADE, SALA_VERMELHA_EXTRA, SOCIAL_DURACAO_R1, SOCIAL_DURACAO_R2,
  SOCIAL_FAMILIA_DURACAO_R1, TOMOGRAFO,
} from './constantes';
import { MINUTO_FIM_PLANTAO, MINUTO_INICIO_PLANTAO } from './relogio';
import { CANAL_DEMANDA, CANAL_EVENTOS, criarGerador, estadoDoCanal, type Gerador } from './rng';
import type {
  Acao, CargaGestor, ChaveLote, CirurgiaSim, ErroAcao, EstadoSimulacao, Metricas, Ocorrencia,
  PacienteSim, ResultadoPasso, Risco, Rodada, SetorSim, TipoOcorrencia,
} from './types';

export const MINUTO_INICIO = MINUTO_INICIO_PLANTAO;
export const MINUTO_FIM = MINUTO_FIM_PLANTAO;
export const LOG_MAX = 60;
export { NIR_MAX_USOS, NIR_ESPERA_MIN, ENF_EXTRA_VAGAS };

const STATS_ZERO: Stats = { disc: 0, altaHosp: 0, libDE: 0, dets: 0, deaths: 0, cxCan: 0, lwbs: 0, offS: 0, socB: 0, boardHrs: 0 };
const EVENTOS_ZERO: Events = { pcr: false, tomo: false, surto: false, social: false, lab: false, famDelay: false, pcrEnd: 0, tomoEnd: 0, labEnd: 0 };
const PIORA: Readonly<Record<Severity, Severity>> = { green: 'yellow', yellow: 'orange', orange: 'red', red: 'red' };
const ORDEM_LOTES: readonly ChaveLote[] = ['enf1', 'enf2', 'enf3', 'uti1', 'uti2'];

// ── Utilidades ──────────────────────────────────────────────

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

export function paraPacienteSim(p: Patient): PacienteSim {
  const { offSvc, ...resto } = p;
  return {
    ...resto, leitoInadequado: offSvc, foraDoPerfil: false, transferenciaAte: 0, transferido: false,
    risco: 'baixo', slaOk: null, entradaMin: null, detMin: null, retorno: false, bloqueioAte: 0,
  };
}

function cargaZero(): CargaGestor {
  return {
    decisoes: 0, produtivas: 0, reativas: 0,
    alertas: { deterioracao: 0, obito: 0, cancelamento: 0, deLotado: 0, corredor: 0, lwbs: 0 },
    automatico: { fluxista: 0, dischargeLounge: 0, fastTrack: 0, cirurgiasViabilizadas: 0 },
    emergencias: 0, emergenciasSemSala: 0,
  };
}

function copiarCarga(c: CargaGestor): CargaGestor {
  return { ...c, alertas: { ...c.alertas }, automatico: { ...c.automatico } };
}

function contar(P: readonly PacienteSim[], setor: SetorSim): number {
  let n = 0;
  for (const p of P) if (p.sector === setor) n++;
  return n;
}

/** Pronto no DE esperando leito (ENF/UTI) ou transferência (fora do perfil). */
function emBoarding(p: PacienteSim): boolean {
  return p.sector === 'de' && p.ready && !p.dead && (p.dest === 'enf' || p.dest === 'uti' || p.dest === 'transferencia');
}

function naFila(p: PacienteSim): boolean {
  return p.sector === 'triagem' || p.sector === 'corredor';
}

function altaEnfPronta(p: PacienteSim): boolean {
  return p.sector === 'enf' && p.dischReady && p.prep <= 0 && !p.social && !p.blocked;
}

/** Posição na fila: quem voltou ao DE primeiro, depois Manchester, depois ordem de chegada. */
function ordemFila(a: PacienteSim, b: PacienteSim): number {
  const ra = a.retorno ? -1 : PRIORIDADE[a.sev];
  const rb = b.retorno ? -1 : PRIORIDADE[b.sev];
  return ra - rb || a.arrMin - b.arrMin || a.id - b.id;
}

function anexarLog(log: readonly LogEntry[], ocorrencias: readonly Ocorrencia[]): LogEntry[] {
  const novas = ocorrencias.map(o => ({ msg: o.msg, type: o.nivel, t: o.minuto })).reverse();
  return [...novas, ...log].slice(0, LOG_MAX);
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/** Duração aproximada em horas: "1 h", "3 h". */
function horas(min: number): string {
  return `${Math.max(1, Math.round(min / 60))} h`;
}

function horasOuMin(min: number): string {
  return min < 120 ? `${min} min` : `${fmtHora(min)}`;
}

function fmtHora(min: number): string {
  return `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
}

function fimCirurgia(s: CirurgiaSim): number {
  return Math.round((s.stH + s.dur) * 60);
}

function inicioCirurgia(s: CirurgiaSim): number {
  return Math.round(s.stH * 60);
}

/** Capacidade de um setor para movimentos do grupo (DE perde 1 maca durante a parada cardíaca). */
export function capacidadeSetor(estado: Pick<EstadoSimulacao, 'eventos'>, setor: SetorSim): number {
  switch (setor) {
    case 'enf': return CAP.enf;
    case 'uti': return CAP.uti;
    case 'de': return CAP.de - (estado.eventos.pcr ? 1 : 0);
    case 'rpa': return CAP.rpa;
    case 'fast_track': return FAST_TRACK_VAGAS;
    case 'enf_extra': return ENF_EXTRA_VAGAS;
    default: return 999;
  }
}

export function calcularRisco(p: PacienteSim, minuto: number): Risco {
  if (naFila(p)) {
    const espera = minuto - p.arrMin;
    const alvo = ALVO_ESPERA[p.sev];
    if (p.det || espera > alvo) return 'alto';
    return espera >= alvo / 2 ? 'atencao' : 'baixo';
  }
  if (emBoarding(p)) {
    const limiar = LIMIAR_RISCO_BOARDING[p.sev];
    if (p.det || p.bMin >= limiar) return 'alto';
    return p.bMin >= limiar - ATENCAO_ANTES_MIN ? 'atencao' : 'baixo';
  }
  if (p.leitoInadequado && p.sector === 'enf' && !p.det) return 'atencao';
  return 'baixo';
}

// ── Estado inicial ──────────────────────────────────────────

export function criarEstadoInicial(rodada: Rodada, semente: number): EstadoSimulacao {
  // Demanda e censo: gerador próprio, independente da rodada
  const gd = criarGerador(estadoDoCanal(semente, CANAL_DEMANDA));
  let proximoId = 1;
  const pacientes = mkInit(gd.proximo, () => proximoId++).map(paraPacienteSim);
  const chegadas = gerarChegadas(gd);
  const altas = gerarLotesAlta(
    gd,
    pacientes.filter(p => p.sector === 'enf').map(p => p.id),
    pacientes.filter(p => p.sector === 'uti').map(p => p.id),
  );

  // Eventos: gerador separado
  const ge = criarGerador(estadoDoCanal(semente, CANAL_EVENTOS));
  const cirurgias: CirurgiaSim[] = rodada === 2 ? mkSxR2() : mkSx();
  let atrasoMin = 0;
  if (rodada === 1) {
    atrasoMin = ge.inteiro(ATRASO_SALA1_R1[0], ATRASO_SALA1_R1[1]);
    cirurgias.forEach(s => { if (s.sala === 1) s.stH += atrasoMin / 60; });
  }

  const title = rodada === 2 ? 'PLANTÃO LEAN' : 'PLANTÃO TRAVADO';
  const r2Msg = rodada === 2 ? ' FERRAMENTAS LEAN ATIVAS: Bed Huddle, Discharge Lounge, Fast Track, Surgical Smoothing, Fluxista, Alta Segura, Fluxo Rápido e PCP.' : '';
  const log: LogEntry[] = [{ msg: `${title} iniciado! DE 8/15, ENF 71/85, UTI 13/15. Ocupação hospitalar: 84%.${r2Msg}`, type: 'info', t: MINUTO_INICIO }];
  if (atrasoMin > 0) log.push({ msg: `ATRASO: a sala 1 começou ${atrasoMin} min atrasada e as cirurgias dela foram adiadas.`, type: 'warning', t: MINUTO_INICIO });
  if (rodada === 2) log.push({ msg: 'BED HUDDLE 7h: previsão de cerca de 45 pacientes, cirurgias redistribuídas e pico das 11h às 14h.', type: 'info', t: MINUTO_INICIO });

  return {
    versao: 0,
    rodada,
    minuto: MINUTO_INICIO,
    rng: ge.estado(),
    pacientes,
    cirurgias,
    stats: { ...STATS_ZERO },
    eventos: { ...EVENTOS_ZERO },
    flags: {},
    proximaChegada: chegadas[0]?.minuto ?? MINUTO_FIM + 1,
    agenda: { chegadas, altas },
    chegadasProcessadas: 0,
    ferramentas: { nirUsos: 0, nirEspera: 0, fcUsos: 0, fcLiberado: false },
    log,
    proximoId,
    carga: cargaZero(),
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

  const P: PacienteSim[] = estado.pacientes.map(p => ({ ...p }));
  const S: Stats = { ...estado.stats };
  const E: Events = { ...estado.eventos };
  const R: Record<string, boolean> = { ...estado.flags };
  const ferramentas = { ...estado.ferramentas };
  const cirurgias = estado.cirurgias.map(s => ({ ...s }));
  const carga = copiarCarga(estado.carga);
  const tomo = TOMOGRAFO[estado.rodada];
  const lab = LABORATORIO[estado.rodada];
  const emAvaliacao = (p: PacienteSim): boolean => (p.sector === 'de' || p.sector === 'fast_track') && !p.ready && !p.obsProlong;
  const rpaReservada = (): number => contar(P, 'rpa') + cirurgias.filter(s => s.st === 'andamento').length;

  const deteriorar = (p: PacienteSim, tipo: TipoOcorrencia, msg: string): void => {
    p.det = true; p.detMin = cm; p.sev = PIORA[p.sev]; S.dets++; carga.alertas.deterioracao++;
    registrar(ctx, tipo, msg, 'warning', { som: 'det', pacienteId: p.id });
  };
  const obito = (p: PacienteSim, tipo: TipoOcorrencia, msg: string): void => {
    p.dead = true; p.sector = 'obito'; p.ready = false; p.bStart = null; S.deaths++; carga.alertas.obito++;
    registrar(ctx, tipo, msg, 'danger', { som: 'death', flashObito: true, pacienteId: p.id });
  };

  // ── Eventos aleatórios ────────────────────────────────────

  // Parada cardíaca (mesma frequência nas duas rodadas)
  if (ch >= 9 && ch < 16 && !E.pcr && rand() < P_PCR) {
    E.pcr = true; E.pcrEnd = cm + PCR_DURACAO_MIN;
    registrar(ctx, 'pcr', 'PARADA CARDÍACA no DE! Uma maca fica bloqueada por 1 h.', 'danger');
  }
  if (E.pcr && cm >= E.pcrEnd) { E.pcr = false; registrar(ctx, 'pcr_fim', 'Parada resolvida. Maca liberada.', 'success'); }

  // Tomógrafo: atrasa todos os que ainda não estão prontos e os que chegarem durante a parada
  if (ch >= 8 && ch < 14 && !E.tomo && rand() < P_TOMOGRAFO) {
    E.tomo = true; E.tomoEnd = cm + tomo.duracao;
    P.forEach(p => { if (emAvaliacao(p)) p.deNeed += tomo.acrescimo; });
    if (isR2) registrar(ctx, 'tomografo', `TOMÓGRAFO EM MANUTENÇÃO PREVENTIVA: volta em ${horas(tomo.duracao)}. Quem está em avaliação espera mais ${tomo.acrescimo} min pela decisão.`, 'warning');
    else registrar(ctx, 'tomografo', `TOMÓGRAFO QUEBRADO! Todos em avaliação no DE esperam mais ${tomo.acrescimo} min pela decisão.`, 'danger');
  }
  if (E.tomo && cm >= E.tomoEnd) { E.tomo = false; registrar(ctx, 'tomografo_fim', 'Tomógrafo reparado.', 'success'); }

  // Laboratório com atraso
  if (ch >= 9 && ch < 16 && !E.lab && rand() < lab.p) {
    E.lab = true; E.labEnd = cm + lab.duracao;
    const affected = P.filter(emAvaliacao).slice(0, rnd(2, 4));
    affected.forEach(p => { p.deNeed += lab.acrescimo; p.labDelay = true; });
    registrar(ctx, 'laboratorio', `ATRASO NO LABORATÓRIO! ${plural(affected.length, 'paciente aguarda', 'pacientes aguardam')} resultado (mais ${lab.acrescimo} min).`, 'warning');
  }
  if (E.lab && cm >= E.labEnd) {
    E.lab = false;
    P.forEach(p => { if (p.labDelay) p.labDelay = false; });
    registrar(ctx, 'laboratorio_fim', 'Laboratório normalizado.', 'success');
  }

  // Paciente social (atraso de familiares). Sem paciente elegível, tenta de novo depois.
  if (ch >= 10 && ch < 17 && !E.social && rand() < P_SOCIAL) {
    const ef = P.find(altaEnfPronta);
    if (ef) {
      E.social = true;
      ef.social = true; ef.socialDelay = isR2 ? SOCIAL_DURACAO_R2 : rnd(SOCIAL_DURACAO_R1[0], SOCIAL_DURACAO_R1[1]); S.socB++;
      registrar(ctx, 'social',
        `ATRASO DA FAMÍLIA: o leito de ${ef.name} fica bloqueado por cerca de ${horas(ef.socialDelay)}.${isR2 ? ' Alta Segura acionada: bloqueio reduzido a 1 h.' : ''}`,
        isR2 ? 'info' : 'warning', { pacienteId: ef.id });
    }
  }

  // Segundo caso social (sem responsável)
  if (ch >= 13 && ch < 16 && !E.famDelay && rand() < P_SOCIAL_FAMILIA) {
    const ef = P.find(altaEnfPronta);
    if (ef) {
      E.famDelay = true;
      ef.social = true; ef.socialDelay = isR2 ? SOCIAL_DURACAO_R2 : rnd(SOCIAL_FAMILIA_DURACAO_R1[0], SOCIAL_FAMILIA_DURACAO_R1[1]); S.socB++;
      registrar(ctx, 'bloqueio_social',
        `BLOQUEIO SOCIAL: ${ef.name} está sem responsável e o leito fica preso por cerca de ${horas(ef.socialDelay)}!${isR2 ? ' Alta Segura acionada: bloqueio reduzido a 1 h.' : ''}`,
        isR2 ? 'info' : 'warning', { pacienteId: ef.id });
    }
  }

  // Emergência cirúrgica do DE (RPA conta as cirurgias em andamento como reservadas)
  if (ch >= 9 && ch < 16 && rand() < P_EMERGENCIA_CIRURGICA) {
    const emg = P.find(p => p.sector === 'de' && p.sev === 'red' && !p.dead && !p.postOp && !p.foraDoPerfil && !p.transferenciaAte);
    if (emg) {
      carga.emergencias++;
      if (rpaReservada() >= CAP.rpa) carga.emergenciasSemSala++;
      if (rpaReservada() < CAP.rpa) {
        emg.sector = 'rpa'; emg.postOp = true; emg.ready = true; emg.dest = 'uti'; emg.bStart = null; emg.bMin = 0;
        emg.name = `EMG-${emg.name.split(' ')[0]}`;
        registrar(ctx, 'emergencia_cirurgica', `EMERGÊNCIA CIRÚRGICA: ${emg.name} foi operado e está na RPA.`, 'danger', { som: 'cascade', pacienteId: emg.id });
      } else {
        obito(emg, 'emergencia_obito', `SEM VAGA NA RPA PARA A EMERGÊNCIA CIRÚRGICA! Óbito evitável de ${emg.name}.`);
      }
    }
  }

  // Observação prolongada
  if (ch >= 9 && ch < 15 && rand() < P_OBS_PROLONGADA) {
    const pp = P.find(p => p.sector === 'de' && !p.ready && !p.obsProlong && !p.foraDoPerfil);
    if (pp) {
      pp.obsProlong = true; pp.obsEnd = cm + rnd(300, 480); pp.deNeed = 99999;
      registrar(ctx, 'obs_prolongada', `OBSERVAÇÃO PROLONGADA: ${pp.name} vai ocupar a maca por cerca de ${horas(pp.obsEnd - cm)}.`, 'warning', { pacienteId: pp.id });
    }
  }
  P.forEach(p => {
    if (p.obsProlong && cm >= p.obsEnd) {
      p.obsProlong = false; p.ready = true; p.dest = 'alta_de';
      registrar(ctx, 'obs_fim', `${p.name} terminou a observação e pode receber alta.`, 'success', { pacienteId: p.id });
    }
  });

  // ── Chegadas da agenda ────────────────────────────────────
  let processadas = estado.chegadasProcessadas;
  const chegadas = estado.agenda.chegadas;
  let surtoAgora = false;
  while (processadas < chegadas.length && chegadas[processadas]!.minuto <= cm) {
    const c = chegadas[processadas]!;
    processadas++;
    const np = paraPacienteSim(criarPaciente(ctx.proximoId++, c.nome, 'triagem', c.dest, c.sev, false, c.deNeed));
    np.arrMin = cm;
    if (c.foraDoPerfil) { np.foraDoPerfil = true; np.dest = 'transferencia'; }
    if (E.tomo) np.deNeed += tomo.acrescimo;
    if (E.lab) { np.deNeed += LAB_ACRESCIMO_CHEGADA; np.labDelay = true; }
    P.push(np);
    if (c.surto) surtoAgora = true;
  }
  if (surtoAgora) {
    E.surto = true;
    registrar(ctx, 'surto', 'SURTO! Três pacientes chegam ao mesmo tempo!', 'danger', { som: 'cascade' });
  }
  const proximaChegada = chegadas[processadas]?.minuto ?? MINUTO_FIM + 1;

  // ── Deterioração em leito inadequado (paciente de UTI internado na ENF) ──
  P.forEach(p => {
    if (p.leitoInadequado && p.sector === 'enf' && !p.dead && !p.det && rand() < P_DET_LEITO_INADEQUADO) {
      if (contar(P, 'uti') >= CAP.uti) {
        deteriorar(p, 'retorno_de', `RETORNO AO DE: ${p.name} piorou em leito inadequado e não há vaga na UTI. Controle de danos.`);
        // Volta pela fila com prioridade máxima: só entra no DE se houver maca (ou sala vermelha)
        p.sector = 'triagem'; p.leitoInadequado = false; p.retorno = true; p.arrMin = cm; p.bStart = null; p.bMin = 0;
      } else {
        deteriorar(p, 'deterioracao_leito_inadequado', `${p.name} piorou em LEITO INADEQUADO (paciente de UTI na enfermaria)!`);
      }
    }
  });

  // ── Fila de Manchester: triagem/corredor → Fast Track ou DE ──
  const pcrB = E.pcr ? 1 : 0;
  const fila = P.filter(naFila).sort(ordemFila);
  for (const p of fila) {
    let destino: SetorSim | null = null;
    if (isR2 && p.sev === 'green' && !p.retorno && contar(P, 'fast_track') < FAST_TRACK_VAGAS) destino = 'fast_track';
    else if (contar(P, 'de') < CAP.de - pcrB) destino = 'de';
    else if (p.sev === 'red' && contar(P, 'de') < CAP.de - pcrB + SALA_VERMELHA_EXTRA) destino = 'de';
    if (!destino) continue;
    p.sector = destino;
    p.entradaMin = cm;
    if (destino === 'fast_track') { p.deNeed = Math.round(p.deNeed * FAST_TRACK_FATOR_DECISAO); carga.automatico.fastTrack++; }
    if (!p.retorno && p.slaOk === null) p.slaOk = cm - p.arrMin <= ALVO_ESPERA[p.sev];
    p.retorno = false;
  }

  // ── Avaliação no DE (mesmo multiplicador de lotação nas duas rodadas) ──
  const mult = hospMult(contar(P, 'enf') + contar(P, 'enf_extra'), contar(P, 'uti'), false);
  P.forEach(p => {
    if (emAvaliacao(p)) {
      p.deSpent += mult;
      if (p.deSpent >= p.deNeed) {
        p.ready = true;
        if (p.labDelay) p.labDelay = false;
        if (p.foraDoPerfil) {
          registrar(ctx, 'fora_do_perfil', `FORA DO PERFIL: ${p.name} precisa de um recurso que o hospital não tem e aguarda transferência (NIR).`, 'warning', { pacienteId: p.id });
        }
      }
    }
  });

  // R2: Fluxista — alta automática do DE e do Fast Track a cada 20 min (conta como liberação do DE)
  if (isR2 && cm % FLUXISTA_INTERVALO_MIN === 0) {
    const fluxPts = P.filter(p => (p.sector === 'de' || p.sector === 'fast_track') && p.ready && p.dest === 'alta_de');
    fluxPts.forEach((p, i) => {
      p.sector = 'alta'; S.disc++; S.libDE++; carga.automatico.fluxista++;
      registrar(ctx, 'fluxista', `Fluxista: alta automática de ${p.name}.`, 'success', i === 0 ? { som: 'fluxista', pacienteId: p.id } : { pacienteId: p.id });
    });
  }

  // R2: Protocolo de fluxo rápido — DE lotado acelera as decisões
  if (isR2 && contar(P, 'de') >= Math.round(CAP.de * FLUXO_RAPIDO_OCUPACAO)) {
    P.forEach(p => { if (p.sector === 'de' && !p.ready && !p.obsProlong) p.deSpent += FLUXO_RAPIDO_BONUS; });
    if (!R.pullLog) { R.pullLog = true; registrar(ctx, 'fluxo_rapido', 'PROTOCOLO DE FLUXO RÁPIDO ATIVO: decisões aceleradas no DE.', 'success'); }
  }

  if (ferramentas.nirEspera > 0) ferramentas.nirEspera = Math.max(0, ferramentas.nirEspera - 1);

  // NIR: transferência concluída libera a maca
  P.forEach(p => {
    if (p.transferenciaAte > 0 && !p.dead && cm >= p.transferenciaAte) {
      p.sector = 'alta'; p.ready = false; p.bStart = null; p.transferenciaAte = 0; p.transferido = true;
      registrar(ctx, 'nir_concluido', `NIR: ${p.name} foi transferido para outro hospital. Maca liberada.`, 'success', { som: 'disc', pacienteId: p.id });
    }
  });

  // ── Boarding: risco de deteriorar depois do limiar da gravidade ──
  P.forEach(p => {
    if (!emBoarding(p)) return;
    if (!p.bStart) p.bStart = cm;
    p.bMin = cm - p.bStart;
    S.boardHrs += 1 / 60;
    if (!p.det && p.bMin >= LIMIAR_RISCO_BOARDING[p.sev] && rand() < P_DET_BOARDING) {
      deteriorar(p, 'deterioracao', `DETERIORAÇÃO: ${p.name} piorou depois de ${fmtHora(p.bMin)} em boarding!`);
    }
  });

  // Espera na triagem/corredor além do tempo-alvo
  P.forEach(p => {
    if (!naFila(p) || p.retorno) return;
    const espera = cm - p.arrMin;
    if (espera <= ALVO_ESPERA[p.sev]) return;
    if (p.slaOk === null) p.slaOk = false;
    if (!p.det && rand() < P_DET_ESPERA) {
      deteriorar(p, 'deterioracao_espera', `DETERIORAÇÃO: ${p.name} piorou depois de esperar ${espera} min por atendimento.`);
    }
  });

  // Óbito: só quem já deteriorou e continua esperando
  P.forEach(p => {
    if (!p.det || p.dead || p.detMin === null || cm - p.detMin < OBITO_APOS_DET_MIN) return;
    if (emBoarding(p)) {
      if (rand() < P_OBITO) obito(p, 'obito', `ÓBITO EVITÁVEL: ${p.name} morreu depois de ${fmtHora(p.bMin)} em boarding.`);
    } else if (naFila(p)) {
      if (rand() < P_OBITO) obito(p, 'obito_espera', `ÓBITO EVITÁVEL: ${p.name} morreu esperando atendimento.`);
    }
  });

  // Dados reais — overlay educativo (1x cada)
  if (S.boardHrs >= 2 && !R.factBoard) { R.factBoard = true; registrar(ctx, 'dado_real', 'Dados reais: boarding acima de 2 h aumenta em 20% o risco de eventos adversos.', 'fact'); }
  if (S.dets >= 1 && !R.factDet) { R.factDet = true; registrar(ctx, 'dado_real', 'Estudos mostram que cada hora de boarding acima de 4 h aumenta a mortalidade em 2%.', 'fact'); }
  if (S.deaths >= 1 && !R.factDeath) { R.factDeath = true; registrar(ctx, 'dado_real', 'Em hospitais com ocupação acima de 95%, a mortalidade cresce 8% a cada 10% de boarding adicional.', 'fact'); }
  if (S.cxCan >= 1 && !R.factCx) { R.factCx = true; registrar(ctx, 'dado_real', 'Cirurgias canceladas por falta de leito custam em média R$ 15.000 por caso.', 'fact'); }

  // Corredor: DE cheio e mais de 2 na triagem → o menos urgente vai para o corredor
  if (contar(P, 'de') >= CAP.de - pcrB && contar(P, 'triagem') > 2) {
    const tc = P.filter(p => p.sector === 'triagem' && p.sev !== 'red' && !p.retorno).sort(ordemFila).pop();
    if (tc && rand() < P_IR_AO_CORREDOR) { tc.sector = 'corredor'; carga.alertas.corredor++; registrar(ctx, 'corredor', `${tc.name} foi para o CORREDOR: não há macas disponíveis!`, 'warning', { pacienteId: tc.id }); }
  }
  // LWBS: corredor acima do limite → paciente de baixa complexidade vai embora
  if (contar(P, 'corredor') > LWBS_LIMITE_CORREDOR) {
    const lw = P.filter(p => p.sector === 'corredor' && p.dest === 'alta_de' && !p.dead).sort(ordemFila).pop();
    if (lw && rand() < P_LWBS) {
      lw.sector = 'alta'; lw.slaOk = false; S.lwbs++; carga.alertas.lwbs++;
      registrar(ctx, 'lwbs', `${lw.name} SAIU SEM ATENDIMENTO (LWBS)!`, 'danger', { pacienteId: lw.id });
    }
  }

  // Contagem regressiva do bloqueio social e do bloqueio por efeito cascata
  P.forEach(p => {
    if (p.social && p.socialDelay > 0) {
      p.socialDelay--;
      if (p.socialDelay <= 0) { p.social = false; registrar(ctx, 'social_fim', `${p.name}: bloqueio social resolvido, alta liberada.`, 'success', { pacienteId: p.id }); }
    }
    if (p.blocked && p.bloqueioAte > 0 && cm >= p.bloqueioAte) {
      p.blocked = false; p.bloqueioAte = 0; p.dischReady = true; p.prep = 0;
      registrar(ctx, 'bloqueio_fim', `${p.name}: alta desbloqueada; o leito volta a girar.`, 'success', { pacienteId: p.id });
    }
  });

  // ── Altas programadas: mesmos pacientes, horário conforme a rodada ──
  for (const chave of ORDEM_LOTES) {
    const cfg = LOTES_ALTA[chave];
    const hora = isR2 ? cfg.horaR2 : cfg.horaR1;
    if (cm < hora * 60 || R[chave]) continue;
    R[chave] = true;
    const lote = estado.agenda.altas.find(l => l.chave === chave);
    const prontos: PacienteSim[] = [];
    for (const item of lote?.pacientes ?? []) {
      const p = P.find(x => x.id === item.id);
      if (!p || p.sector !== cfg.setor || p.dischReady || p.blocked || p.social || p.dead) continue;
      p.dischReady = true;
      p.prep = isR2 ? 0 : item.prepR1;
      if (cfg.setor === 'uti') p.dest = 'enf';
      if (isR2) carga.automatico.dischargeLounge++;
      prontos.push(p);
    }
    const n = prontos.length;
    if (cfg.setor === 'uti') {
      prontos.forEach(p => registrar(ctx, 'round_uti', `Alta da UTI: ${p.name} pode descer para a ENF (step-down).${isR2 ? '' : ' Preparo de cerca de 1 h.'}`, 'info', { pacienteId: p.id }));
    } else if (chave === 'enf1') {
      if (isR2) registrar(ctx, 'round_enf', `BED HUDDLE ${hora}h: ${plural(n, 'alta prescrita', 'altas prescritas')}. Discharge Lounge: os leitos são liberados na hora.`, 'success');
      else registrar(ctx, 'round_enf', `ROUND MÉDICO ${hora}h: ${plural(n, 'alta prescrita', 'altas prescritas')}. Preparo estimado: 2 a 3 h. TARDE DEMAIS!`, 'warning');
    } else if (chave === 'enf2') {
      registrar(ctx, 'round_enf', `ROUND ${hora}h: ${plural(n, 'alta prescrita', 'altas prescritas')}.${isR2 ? ' Liberação imediata.' : ' Preparo de 1h30 a 2 h.'}`, 'success');
    } else if (n > 0) {
      registrar(ctx, 'round_enf', `ROUND ${hora}h: ${plural(n, 'alta esporádica', 'altas esporádicas')}.${isR2 ? ' Liberação imediata.' : ''}`, 'info');
    }
  }

  P.forEach(p => { if (p.prep > 0) p.prep--; });

  // ── Centro cirúrgico: decisão no horário de início ────────
  cirurgias.forEach(s => {
    if (s.st === 'scheduled' && cm >= inicioCirurgia(s)) {
      const leitoLivre = s.dest === 'uti' ? contar(P, 'uti') < CAP.uti : contar(P, 'enf') < CAP.enf;
      const altaPronta = s.dest === 'uti'
        ? P.some(p => p.sector === 'uti' && p.dischReady && p.prep <= 0)
        : P.some(altaEnfPronta);
      if (rpaReservada() < CAP.rpa && (leitoLivre || altaPronta)) {
        s.st = 'andamento';
        if (!leitoLivre) carga.automatico.cirurgiasViabilizadas++;
        registrar(ctx, 'cirurgia_iniciada', `${s.label} iniciada (sala ${s.sala}).`, 'info');
      } else {
        s.st = 'cancelled'; S.cxCan++; carga.alertas.cancelamento++;
        const disch = P.find(altaEnfPronta);
        if (disch) {
          disch.dischReady = false; disch.blocked = true; disch.bloqueioAte = cm + BLOQUEIO_CASCATA_MIN;
          registrar(ctx, 'cirurgia_cancelada', `${s.label} cancelada antes de iniciar: sem leito/RPA. ${disch.name} perde a alta por ${horas(BLOQUEIO_CASCATA_MIN)}. EFEITO CASCATA.`, 'danger',
            { som: 'cascade', pacienteId: disch.id, cascata: { texto: `${s.label} cancelada → ${disch.name} perde a alta → leito não gira`, duracaoMs: 8000 } });
        } else {
          registrar(ctx, 'cirurgia_cancelada', `${s.label} cancelada antes de iniciar: sem leito/RPA.`, 'danger',
            { som: 'cascade', cascata: { texto: 'Cirurgia cancelada → menos giro → mais boarding', duracaoMs: 6000 } });
        }
      }
    }
    if (s.st === 'andamento' && cm >= fimCirurgia(s) && contar(P, 'rpa') < CAP.rpa) {
      s.st = 'done';
      const np = paraPacienteSim(criarPaciente(ctx.proximoId++, `PO-${s.label.replace('Cx ', '')}`, 'rpa', s.dest, s.dest === 'uti' ? 'red' : 'orange', true));
      np.postOp = true;
      np.arrMin = cm;
      P.push(np);
      registrar(ctx, 'cirurgia_concluida', `${np.name} chegou à RPA e precisa de leito na ${s.dest === 'uti' ? 'UTI' : 'ENF'}.`, 'info', { pacienteId: np.id });
    }
  });

  P.forEach(p => { p.risco = calcularRisco(p, cm); });

  // Alerta: DE lotado (conta cada vez que as macas acabam)
  const deCheio = contar(P, 'de') >= CAP.de - pcrB;
  if (deCheio && !R.deCheio) {
    carga.alertas.deLotado++;
    registrar(ctx, 'de_lotado', 'DE LOTADO: todas as macas estão ocupadas.', 'danger');
  }
  R.deCheio = deCheio;

  if (cm >= MINUTO_FIM) registrar(ctx, 'fim', 'Plantão encerrado!', 'success');

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
      agenda: estado.agenda,
      chegadasProcessadas: processadas,
      ferramentas,
      log: anexarLog(estado.log, ctx.ocorrencias),
      proximoId: ctx.proximoId,
      carga,
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

/** Destinos que o grupo pode escolher para o paciente (sem checar lotação). */
export function destinosPossiveis(estado: EstadoSimulacao, pacienteId: number): Sector[] {
  const p = estado.pacientes.find(x => x.id === pacienteId);
  if (!p || p.dead) return [];
  const t: Sector[] = [];
  if (naFila(p)) t.push('de');
  if ((p.sector === 'de' || p.sector === 'fast_track') && p.ready) {
    if (p.dest === 'alta_de') t.push('alta');
    if (p.dest === 'enf') t.push('enf');
    if (p.dest === 'uti') { t.push('uti'); t.push('enf'); }
  }
  if (altaEnfPronta(p)) t.push('alta');
  if (p.sector === 'uti' && p.dischReady && p.prep <= 0) t.push(p.dest === 'enf' ? 'enf' : 'alta');
  if (p.sector === 'rpa' && p.ready) { if (p.dest === 'enf') t.push('enf'); if (p.dest === 'uti') { t.push('uti'); t.push('enf'); } }
  if (p.sector === 'enf_extra') t.push('enf');
  return t;
}

function erro(codigo: ErroAcao['codigo'], msg: string): ErroAcao {
  return { erro: msg, codigo };
}

function concluirAcao(estado: EstadoSimulacao, mudancas: Partial<EstadoSimulacao>, ocorrencias: Ocorrencia[]): ResultadoPasso {
  const carga = copiarCarga(estado.carga);
  for (const o of ocorrencias) {
    if (!o.decisao) continue;
    carga.decisoes++;
    if (o.decisao === 'produtiva') carga.produtivas++; else carga.reativas++;
  }
  const novo: EstadoSimulacao = { ...estado, ...mudancas, carga, versao: estado.versao + 1 };
  novo.log = anexarLog(estado.log, ocorrencias);
  return { estado: novo, ocorrencias };
}

function substituir(P: readonly PacienteSim[], id: number, f: (p: PacienteSim) => PacienteSim, minuto: number): PacienteSim[] {
  return P.map(p => {
    if (p.id !== id) return p;
    const novo = f(p);
    return { ...novo, risco: calcularRisco(novo, minuto) };
  });
}

function oc(estado: EstadoSimulacao, tipo: TipoOcorrencia, msg: string, nivel: LogType, extra: Extra = {}): Ocorrencia {
  return { minuto: estado.minuto, tipo, msg, nivel, ...extra };
}

/** Nome do setor com artigo e gênero, para a concordância das mensagens. */
const SETOR_TEXTO: Partial<Record<SetorSim, { nome: string; artigo: 'o' | 'a' }>> = {
  de: { nome: 'DE', artigo: 'o' }, enf: { nome: 'ENF', artigo: 'a' }, uti: { nome: 'UTI', artigo: 'a' },
  rpa: { nome: 'RPA', artigo: 'a' }, enf_extra: { nome: 'CORREDOR DA ENFERMARIA', artigo: 'o' },
  fast_track: { nome: 'FAST TRACK', artigo: 'o' }, triagem: { nome: 'TRIAGEM', artigo: 'a' }, corredor: { nome: 'CORREDOR', artigo: 'o' },
};

function setorComArtigo(setor: SetorSim): string {
  const t = SETOR_TEXTO[setor];
  return t ? `${t.artigo} ${t.nome}` : setor;
}

function setorLotado(setor: SetorSim): string {
  const t = SETOR_TEXTO[setor];
  return t ? `${t.nome} ${t.artigo === 'a' ? 'LOTADA' : 'LOTADO'}!` : `${setor} sem vaga!`;
}

function verificarLotacao(estado: EstadoSimulacao, destino: SetorSim): ErroAcao | null {
  if (destino === 'alta') return null;
  if (contar(estado.pacientes, destino) >= capacidadeSetor(estado, destino)) {
    return erro('lotado', setorLotado(destino));
  }
  return null;
}

function mover(estado: EstadoSimulacao, p: PacienteSim, destino: Sector): ResultadoPasso | ErroAcao {
  if (!destinosPossiveis(estado, p.id).includes(destino)) return erro('destino_invalido', destino === 'alta' ? `${p.name} ainda não pode receber alta.` : `${p.name} não pode ir para ${setorComArtigo(destino)} agora.`);
  const lotado = verificarLotacao(estado, destino);
  if (lotado) return lotado;
  const inadequado = p.dest === 'uti' && destino === 'enf' && p.sector !== 'uti';
  if (inadequado) return erro('confirmar_leito_inadequado', `${p.name} precisa de UTI. Confirme a internação em leito inadequado na enfermaria.`);

  const isProd = destino === 'alta' || destino === 'enf' || (destino === 'uti' && p.dest === 'uti');
  const decisao = isProd ? 'produtiva' as const : 'reativa' as const;
  let stats = estado.stats;
  let ocorrencia: Ocorrencia;
  if (destino === 'alta') {
    const isHospDisc = p.sector === 'enf';
    const isDe = p.sector === 'de' || p.sector === 'fast_track';
    stats = { ...stats, disc: stats.disc + 1, altaHosp: stats.altaHosp + (isHospDisc ? 1 : 0), libDE: stats.libDE + (isDe ? 1 : 0) };
    ocorrencia = oc(estado, 'alta', `${p.name} recebeu ${isHospDisc ? 'alta hospitalar' : 'alta do DE'}.`, 'success', { som: 'disc', pacienteId: p.id, decisao });
  } else {
    ocorrencia = oc(estado, 'movimento', `${p.name} foi para ${setorComArtigo(destino)}.`, 'info', { pacienteId: p.id, decisao });
  }
  const sev: Severity = p.sector === 'uti' && destino === 'enf' && p.dischReady ? 'green' : p.sev;
  const entrouNoDe = destino === 'de' && naFila(p);
  const pacientes = substituir(estado.pacientes, p.id, x => ({
    ...x, sector: destino, sev, ready: false, dischReady: false, bStart: null, bMin: 0, leitoInadequado: false, obsProlong: false,
    ...(entrouNoDe ? {
      entradaMin: estado.minuto,
      slaOk: x.slaOk ?? (x.retorno ? null : estado.minuto - x.arrMin <= ALVO_ESPERA[x.sev]),
      retorno: false,
    } : {}),
  }), estado.minuto);
  return concluirAcao(estado, { pacientes, stats }, [ocorrencia]);
}

function confirmarLeitoInadequado(estado: EstadoSimulacao, p: PacienteSim): ResultadoPasso | ErroAcao {
  const candidato = p.dest === 'uti' && p.sector !== 'uti' && destinosPossiveis(estado, p.id).includes('enf');
  if (!candidato) return erro('destino_invalido', `${p.name} não é paciente de UTI à espera de leito.`);
  const lotado = verificarLotacao(estado, 'enf');
  if (lotado) return lotado;
  const pacientes = substituir(estado.pacientes, p.id, x => ({ ...x, sector: 'enf', ready: false, dischReady: false, bStart: null, bMin: 0, leitoInadequado: true }), estado.minuto);
  const stats = { ...estado.stats, offS: estado.stats.offS + 1 };
  return concluirAcao(estado, { pacientes, stats }, [
    oc(estado, 'leito_inadequado', `LEITO INADEQUADO: ${p.name}, paciente de UTI, foi internado na enfermaria. Risco elevado!`, 'warning', { pacienteId: p.id, decisao: 'reativa' }),
  ]);
}

function nir(estado: EstadoSimulacao, p: PacienteSim): ResultadoPasso | ErroAcao {
  const f = estado.ferramentas;
  if (f.nirUsos >= NIR_MAX_USOS) return erro('ferramenta_indisponivel', `NIR esgotado: o limite de ${NIR_MAX_USOS} usos foi atingido.`);
  if (p.transferenciaAte > 0) return erro('destino_invalido', `${p.name} já está com a transferência em andamento.`);
  if (f.nirEspera > 0) return erro('ferramenta_indisponivel', `NIR em espera: disponível de novo em ${f.nirEspera} min.`);
  if (!emBoarding(p)) return erro('destino_invalido', 'O NIR só vale para paciente pronto no DE à espera de transferência ou de leito na ENF ou na UTI.');
  // Na R1 a regulação é lenta (sorteada pelo gerador de eventos); na R2, rápida, mas com espera entre usos.
  const g = criarGerador(estado.rng);
  const duracao = estado.rodada === 2 ? NIR_TRANSFERENCIA_R2_MIN : g.inteiro(NIR_TRANSFERENCIA_R1_MIN[0], NIR_TRANSFERENCIA_R1_MIN[1]);
  const pacientes = substituir(estado.pacientes, p.id, x => ({ ...x, dest: 'transferencia', transferenciaAte: estado.minuto + duracao }), estado.minuto);
  const ferramentas = { ...f, nirUsos: f.nirUsos + 1, nirEspera: estado.rodada === 2 ? NIR_ESPERA_MIN : 0 };
  return concluirAcao(estado, { pacientes, ferramentas, rng: g.estado() }, [
    oc(estado, 'nir', `NIR acionado: transferência de ${p.name} em andamento, previsão de ${horasOuMin(duracao)} (${f.nirUsos + 1}/${NIR_MAX_USOS} usos). O paciente continua no DE até sair.`, 'info', { pacienteId: p.id, decisao: 'produtiva' }),
  ]);
}

function fullCapacity(estado: EstadoSimulacao, p: PacienteSim): ResultadoPasso | ErroAcao {
  const f = estado.ferramentas;
  if (estado.rodada !== 2) return erro('ferramenta_indisponivel', 'O PCP (Full Capacity) só está disponível no Plantão Lean.');
  if (!f.fcLiberado) return erro('ferramenta_indisponivel', 'PCP (Full Capacity) negado: aguarda autorização da diretoria.');
  if (!emBoarding(p) || p.dest !== 'enf') return erro('destino_invalido', 'O PCP (Full Capacity) só vale para paciente pronto no DE à espera de leito na ENF.');
  if (contar(estado.pacientes, 'enf_extra') >= ENF_EXTRA_VAGAS) return erro('lotado', `CORREDOR DA ENFERMARIA LOTADO: são só ${ENF_EXTRA_VAGAS} vagas.`);
  const pacientes = substituir(estado.pacientes, p.id, x => ({ ...x, sector: 'enf_extra', ready: false, bStart: null, bMin: 0 }), estado.minuto);
  const ferramentas = { ...f, fcUsos: f.fcUsos + 1 };
  return concluirAcao(estado, { pacientes, ferramentas }, [
    oc(estado, 'full_capacity', `PCP: ${p.name} foi internado no corredor da enfermaria. Maca do DE liberada.`, 'success', { pacienteId: p.id, decisao: 'reativa' }),
  ]);
}

export function aplicarAcao(estado: EstadoSimulacao, acao: Acao): ResultadoPasso | ErroAcao {
  if (estado.minuto >= MINUTO_FIM) return erro('fim_de_jogo', 'Plantão encerrado.');
  const p = estado.pacientes.find(x => x.id === acao.pacienteId);
  if (!p || p.dead) return erro('paciente_inexistente', 'Paciente não encontrado.');
  switch (acao.tipo) {
    case 'mover': return mover(estado, p, acao.destino);
    case 'confirmarLeitoInadequado': return confirmarLeitoInadequado(estado, p);
    case 'nir': return nir(estado, p);
    case 'fullCapacity': return fullCapacity(estado, p);
  }
}

export function ehErro(r: ResultadoPasso | ErroAcao): r is ErroAcao {
  return 'erro' in r;
}

/** Facilitador libera o PCP/Full Capacity. Só tem efeito na R2. */
export function liberarFullCapacity(estado: EstadoSimulacao): ResultadoPasso {
  if (estado.rodada !== 2 || estado.ferramentas.fcLiberado) return { estado, ocorrencias: [] };
  return concluirAcao(estado, { ferramentas: { ...estado.ferramentas, fcLiberado: true } }, [
    oc(estado, 'full_capacity_liberado', `A DIRETORIA AUTORIZOU o PCP (Full Capacity): ${ENF_EXTRA_VAGAS} vagas no corredor da enfermaria.`, 'success'),
  ]);
}

/**
 * Facilitador revoga o PCP/Full Capacity. Os pacientes já internados no corredor
 * da enfermaria ficam onde estão; só novas internações pelo PCP deixam de valer.
 */
export function revogarFullCapacity(estado: EstadoSimulacao): ResultadoPasso {
  if (estado.rodada !== 2 || !estado.ferramentas.fcLiberado) return { estado, ocorrencias: [] };
  return concluirAcao(estado, { ferramentas: { ...estado.ferramentas, fcLiberado: false } }, [
    oc(estado, 'full_capacity_revogado', 'A DIRETORIA SUSPENDEU o PCP (Full Capacity): os pacientes já no corredor da enfermaria continuam internados, mas não há novas vagas.', 'warning'),
  ]);
}

// ── Leituras ────────────────────────────────────────────────

export function atendidosNoAlvo(estado: EstadoSimulacao): number {
  return estado.pacientes.filter(p => p.slaOk === true).length;
}

export function pontuacao(estado: EstadoSimulacao): number {
  return calcScore({ ...estado.stats, atendidosNoAlvo: atendidosNoAlvo(estado) });
}

export function slaPct(estado: EstadoSimulacao): number {
  let ok = 0;
  let total = 0;
  for (const p of estado.pacientes) {
    if (p.slaOk === null) continue;
    total++;
    if (p.slaOk) ok++;
  }
  return total === 0 ? 100 : Math.round((ok / total) * 100);
}

export function metricas(estado: EstadoSimulacao): Metricas {
  const P = estado.pacientes;
  const S = estado.stats;
  const C = estado.carga;
  const brd = P.filter(emBoarding);
  const avgB = brd.length > 0 ? Math.round(brd.reduce((a, p) => a + p.bMin, 0) / brd.length) : 0;
  return {
    dis: S.disc, det: S.dets, dth: S.deaths, cxC: S.cxCan, lw: S.lwbs, leitoInadequado: S.offS, soc: S.socB, bH: S.boardHrs,
    deOcc: contar(P, 'de'), enfOcc: contar(P, 'enf'), utiOcc: contar(P, 'uti'), rpaOcc: contar(P, 'rpa'),
    boarding: brd.length, avgB, corredor: contar(P, 'corredor'),
    altaHosp: S.altaHosp, libDE: S.libDE,
    slaPct: slaPct(estado),
    triagemOcc: contar(P, 'triagem'),
    fastTrackOcc: contar(P, 'fast_track'),
    enfExtraOcc: contar(P, 'enf_extra'),
    aguardandoTransferencia: P.filter(p => emBoarding(p) && p.dest === 'transferencia').length,
    decisoes: C.decisoes,
    decisoesProdutivas: C.produtivas,
    decisoesReativas: C.reativas,
    alertas: Object.values(C.alertas).reduce((a, n) => a + n, 0),
    autoFluxista: C.automatico.fluxista,
    autoDischargeLounge: C.automatico.dischargeLounge,
    autoFastTrack: C.automatico.fastTrack,
    autoCirurgiasViabilizadas: C.automatico.cirurgiasViabilizadas,
    emergencias: C.emergencias,
    emergenciasSemSala: C.emergenciasSemSala,
  };
}

/** Aviso de RPA quase cheia antes da próxima cirurgia começar. */
export function alertaRpa(estado: EstadoSimulacao): string | null {
  const cm = estado.minuto;
  const reservada = contar(estado.pacientes, 'rpa') + estado.cirurgias.filter(s => s.st === 'andamento').length;
  const nxt = estado.cirurgias.find(s => s.st === 'scheduled' && cm < inicioCirurgia(s));
  if (!nxt || reservada < 2) return null;
  const mL = inicioCirurgia(nxt) - cm;
  return mL > 0 && mL <= 45 ? `RPA ${reservada}/${CAP.rpa} (com cirurgias em andamento) — ${nxt.label} começa em ${mL} min` : null;
}

export function encerrado(estado: EstadoSimulacao): boolean {
  return estado.minuto >= MINUTO_FIM;
}
