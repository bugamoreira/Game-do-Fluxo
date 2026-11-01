// ============================================================
// Robôs de decisão — usados na sessão de pontuação e no ensaio
// Cada estratégia é pura: (estado) => Acao | null
// ============================================================

import type { Sector } from '../../types/game';
import {
  aplicarAcao, capacidadeSetor, criarEstadoInicial, destinosPossiveis, ehErro,
  metricas, MINUTO_FIM, NIR_MAX_USOS, passo, pontuacao,
} from './motor';
import { CAP } from '../constants';
import type { Acao, Estrategia, EstadoSimulacao, Metricas, PacienteSim, Rodada, SetorSim } from './types';

function temVaga(estado: EstadoSimulacao, setor: Sector): boolean {
  if (setor === 'alta') return true;
  return estado.pacientes.filter(p => p.sector === setor).length < capacidadeSetor(estado, setor);
}

function podeIr(estado: EstadoSimulacao, p: PacienteSim, destino: Sector): boolean {
  return destinosPossiveis(estado, p.id).includes(destino) && temVaga(estado, destino);
}

function mover(p: PacienteSim, destino: Sector): Acao {
  return { tipo: 'mover', pacienteId: p.id, destino };
}

/** Pacientes do setor, o que espera há mais tempo primeiro. */
function doSetor(estado: EstadoSimulacao, setor: SetorSim): PacienteSim[] {
  return estado.pacientes.filter(p => p.sector === setor).sort((a, b) => b.bMin - a.bMin || a.arrMin - b.arrMin);
}

function altaEnf(estado: EstadoSimulacao): Acao | null {
  const p = doSetor(estado, 'enf').find(x => podeIr(estado, x, 'alta'));
  return p ? mover(p, 'alta') : null;
}

function stepDownUti(estado: EstadoSimulacao): Acao | null {
  for (const p of doSetor(estado, 'uti')) {
    if (podeIr(estado, p, 'enf')) return mover(p, 'enf');
    if (podeIr(estado, p, 'alta')) return mover(p, 'alta');
  }
  return null;
}

/** Internação no destino certo (ENF ou UTI); nunca fora do perfil. */
function internar(estado: EstadoSimulacao, filtro: (p: PacienteSim) => boolean = () => true): Acao | null {
  const candidatos = [...doSetor(estado, 'de'), ...doSetor(estado, 'fast_track')]
    .filter(p => p.ready && !p.dead && (p.dest === 'enf' || p.dest === 'uti') && filtro(p));
  for (const p of candidatos) {
    const destino: Sector = p.dest === 'uti' ? 'uti' : 'enf';
    if (podeIr(estado, p, destino)) return mover(p, destino);
  }
  return null;
}

function altaDe(estado: EstadoSimulacao): Acao | null {
  const p = [...doSetor(estado, 'de'), ...doSetor(estado, 'fast_track')].find(x => podeIr(estado, x, 'alta'));
  return p ? mover(p, 'alta') : null;
}

function enfExtraParaEnf(estado: EstadoSimulacao): Acao | null {
  const p = doSetor(estado, 'enf_extra').find(x => podeIr(estado, x, 'enf'));
  return p ? mover(p, 'enf') : null;
}

function liberarRpa(estado: EstadoSimulacao): Acao | null {
  for (const p of doSetor(estado, 'rpa')) {
    const destino: Sector = p.dest === 'uti' ? 'uti' : 'enf';
    if (podeIr(estado, p, destino)) return mover(p, destino);
  }
  return null;
}

function corredorParaDe(estado: EstadoSimulacao): Acao | null {
  const p = [...doSetor(estado, 'triagem'), ...doSetor(estado, 'corredor')].find(x => podeIr(estado, x, 'de'));
  return p ? mover(p, 'de') : null;
}

function primeira(estado: EstadoSimulacao, regras: Array<(e: EstadoSimulacao) => Acao | null>): Acao | null {
  for (const regra of regras) {
    const a = regra(estado);
    if (a) return a;
  }
  return null;
}

/** Não faz nada: mostra o hospital funcionando sozinho. */
export const passivo: Estrategia = () => null;

/** NIR para quem está fora do perfil do hospital (nas duas rodadas, se houver uso disponível e sem espera). */
function nirForaDoPerfil(estado: EstadoSimulacao): Acao | null {
  const f = estado.ferramentas;
  if (f.nirUsos >= NIR_MAX_USOS || f.nirEspera > 0) return null;
  const p = doSetor(estado, 'de').find(x => x.ready && !x.dead && x.foraDoPerfil && !x.transferenciaAte);
  return p ? { tipo: 'nir', pacienteId: p.id } : null;
}

/** Puxa o fluxo: NIR nos fora do perfil, altas de ENF/UTI, internações, altas do DE e pós-operatório da RPA. */
export const puxaFluxo: Estrategia = estado =>
  primeira(estado, [nirForaDoPerfil, altaEnf, stepDownUti, e => internar(e), altaDe, liberarRpa, enfExtraParaEnf, corredorParaDe]);

/** Segura no PS: só dá alta do DE e interna apenas quem está perto de deteriorar (boarding ≥ 150 min). */
export const seguraNoPs: Estrategia = estado =>
  primeira(estado, [altaDe, e => internar(e, p => p.bMin >= 150)]);

/** Como puxaFluxo, mas, quando a UTI lota, interna o paciente de UTI na enfermaria (leito inadequado). */
export const leitoInadequado: Estrategia = estado => {
  const a = puxaFluxo(estado);
  if (a) return a;
  if (temVaga(estado, 'uti') || !temVaga(estado, 'enf')) return null;
  const p = doSetor(estado, 'de').find(x => x.ready && !x.dead && x.dest === 'uti');
  return p ? { tipo: 'confirmarLeitoInadequado', pacienteId: p.id } : null;
};

export const ESTRATEGIAS: Record<string, Estrategia> = { passivo, puxaFluxo, seguraNoPs, leitoInadequado };

export interface ResultadoPartida {
  pontuacao: number;
  metricas: Metricas;
  estado: EstadoSimulacao;
  acoes: number;
  /** Primeiro minuto em que o DE ficou com todas as macas ocupadas (null = nunca) */
  deLotadoEm: number | null;
  /** Maior número de pacientes em boarding ao mesmo tempo */
  picoBoarding: number;
  /** Altas hospitalares (ENF) até 12h */
  altasAteMeioDia: number;
}

/**
 * Joga uma rodada inteira (720 minutos). A cada minuto o robô decide até `acoesPorMinuto` vezes,
 * depois o relógio anda um passo.
 */
export function simularPartida(
  estrategia: Estrategia,
  rodada: Rodada,
  semente: number,
  acoesPorMinuto = 2,
): ResultadoPartida {
  let estado = criarEstadoInicial(rodada, semente);
  let acoes = 0;
  let deLotadoEm: number | null = null;
  let picoBoarding = 0;
  let altasAteMeioDia = 0;
  while (estado.minuto < MINUTO_FIM) {
    for (let i = 0; i < acoesPorMinuto; i++) {
      const acao = estrategia(estado);
      if (!acao) break;
      const r = aplicarAcao(estado, acao);
      if (ehErro(r)) break;
      estado = r.estado;
      acoes++;
    }
    estado = passo(estado).estado;
    const m = metricas(estado);
    if (deLotadoEm === null && m.deOcc >= CAP.de) deLotadoEm = estado.minuto;
    picoBoarding = Math.max(picoBoarding, m.boarding);
    if (estado.minuto === 12 * 60) altasAteMeioDia = estado.stats.altaHosp;
  }
  return { pontuacao: pontuacao(estado), metricas: metricas(estado), estado, acoes, deLotadoEm, picoBoarding, altasAteMeioDia };
}
