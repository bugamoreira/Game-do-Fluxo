// ============================================================
// Robôs de decisão — usados na sessão de pontuação e no ensaio
// Cada estratégia é pura: (estado) => Acao | null
// ============================================================

import type { Patient, Sector } from '../../types/game';
import {
  aplicarAcao, capacidadeSetor, criarEstadoInicial, destinosPossiveis, ehErro,
  metricas, MINUTO_FIM, passo, pontuacao,
} from './motor';
import type { Acao, Estrategia, EstadoSimulacao, Metricas, OpcoesEstadoInicial, Rodada } from './types';

function temVaga(estado: EstadoSimulacao, setor: Sector): boolean {
  if (setor === 'alta') return true;
  return estado.pacientes.filter(p => p.sector === setor).length < capacidadeSetor(estado, setor);
}

function podeIr(estado: EstadoSimulacao, p: Patient, destino: Sector): boolean {
  return destinosPossiveis(estado, p.id).includes(destino) && temVaga(estado, destino);
}

function mover(p: Patient, destino: Sector): Acao {
  return { tipo: 'mover', pacienteId: p.id, destino };
}

/** Pacientes do setor, o que espera há mais tempo primeiro. */
function doSetor(estado: EstadoSimulacao, setor: Sector): Patient[] {
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
function internar(estado: EstadoSimulacao, filtro: (p: Patient) => boolean = () => true): Acao | null {
  const candidatos = doSetor(estado, 'de').filter(p => p.ready && !p.dead && (p.dest === 'enf' || p.dest === 'uti') && filtro(p));
  for (const p of candidatos) {
    const destino: Sector = p.dest === 'uti' ? 'uti' : 'enf';
    if (podeIr(estado, p, destino)) return mover(p, destino);
  }
  return null;
}

function altaDe(estado: EstadoSimulacao): Acao | null {
  const p = doSetor(estado, 'de').find(x => podeIr(estado, x, 'alta'));
  return p ? mover(p, 'alta') : null;
}

function liberarRpa(estado: EstadoSimulacao): Acao | null {
  for (const p of doSetor(estado, 'rpa')) {
    const destino: Sector = p.dest === 'uti' ? 'uti' : 'enf';
    if (podeIr(estado, p, destino)) return mover(p, destino);
  }
  return null;
}

function corredorParaDe(estado: EstadoSimulacao): Acao | null {
  const p = doSetor(estado, 'corredor').find(x => podeIr(estado, x, 'de'));
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

/** Puxa o fluxo: altas de ENF/UTI, depois internações, depois altas do DE, depois tira pós-op da RPA. */
export const puxaFluxo: Estrategia = estado =>
  primeira(estado, [altaEnf, stepDownUti, e => internar(e), altaDe, liberarRpa, corredorParaDe]);

/** Segura no PS: só dá alta do DE e interna apenas quem está perto de deteriorar (boarding ≥ 150 min). */
export const seguraNoPs: Estrategia = estado =>
  primeira(estado, [altaDe, e => internar(e, p => p.bMin >= 150)]);

/** Como puxaFluxo, mas quando a UTI lota manda o paciente de UTI para a ENF (fora do perfil). */
export const foraDoPerfil: Estrategia = estado => {
  const a = puxaFluxo(estado);
  if (a) return a;
  if (temVaga(estado, 'uti') || !temVaga(estado, 'enf')) return null;
  const p = doSetor(estado, 'de').find(x => x.ready && !x.dead && x.dest === 'uti');
  return p ? { tipo: 'confirmarForaDoPerfil', pacienteId: p.id } : null;
};

export const ESTRATEGIAS: Record<string, Estrategia> = { passivo, puxaFluxo, seguraNoPs, foraDoPerfil };

export interface ResultadoPartida {
  pontuacao: number;
  metricas: Metricas;
  estado: EstadoSimulacao;
  acoes: number;
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
  opcoes: OpcoesEstadoInicial = {},
): ResultadoPartida {
  let estado = criarEstadoInicial(rodada, semente, opcoes);
  let acoes = 0;
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
  }
  return { pontuacao: pontuacao(estado), metricas: metricas(estado), estado, acoes };
}
