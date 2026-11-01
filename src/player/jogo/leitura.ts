// ============================================================
// Leitura do estado do motor para a tela: quem aparece em cada setor, o que
// o paciente está esperando, rótulos dos destinos e o evento ativo mais grave.
// Funções puras; as regras do jogo continuam no motor.
// ============================================================

import {
  ENF_EXTRA_VAGAS,
  FAST_TRACK_VAGAS,
  NIR_MAX_USOS,
  alertaRpa,
  type EstadoSimulacao,
  type PacienteSim,
  type SetorSim,
} from '../../shared/lib/simulation';
import { CAP } from '../../shared/lib/constants';
import type { Sector } from '../../shared/types/game';
import { duracaoCurta, horaDoPlantao } from '../../shared/components/ui/cx';

export function noSetor(estado: EstadoSimulacao, setor: SetorSim): PacienteSim[] {
  return estado.pacientes.filter(p => p.sector === setor && !p.dead);
}

export function emBoarding(p: PacienteSim): boolean {
  return p.sector === 'de' && p.ready && !p.dead && (p.dest === 'enf' || p.dest === 'uti' || p.dest === 'transferencia');
}

export function emTransferencia(p: PacienteSim): boolean {
  return p.transferenciaAte > 0 && !p.dead;
}

/** Pacientes da ENF que pedem decisão ou atenção (os 85 leitos não cabem na tela). */
export function enfermariaEmFoco(estado: EstadoSimulacao): PacienteSim[] {
  return noSetor(estado, 'enf')
    .filter(p => p.dischReady || p.leitoInadequado || p.det || p.social || p.blocked)
    .sort((a, b) => Number(b.dischReady && b.prep <= 0) - Number(a.dischReady && a.prep <= 0) || a.id - b.id);
}

/** Ordem de exibição no DE: prontos e em risco primeiro. */
export function ordenarDe(lista: PacienteSim[]): PacienteSim[] {
  const peso = (p: PacienteSim) => (p.risco === 'alto' ? 0 : p.ready ? 1 : p.risco === 'atencao' ? 2 : 3);
  return [...lista].sort((a, b) => peso(a) - peso(b) || b.bMin - a.bMin || a.arrMin - b.arrMin);
}

export interface Lotacao {
  ocupacao: number;
  capacidade: number;
}

export function lotacao(estado: EstadoSimulacao, setor: 'de' | 'enf' | 'uti' | 'rpa' | 'fast_track' | 'enf_extra'): Lotacao {
  // DE: 15 macas no cartão; a maca presa na parada cardíaca aparece como selo (ver GradeSetores).
  const capacidade = setor === 'fast_track' ? FAST_TRACK_VAGAS : setor === 'enf_extra' ? ENF_EXTRA_VAGAS : CAP[setor];
  return { ocupacao: noSetor(estado, setor).length, capacidade };
}

/** Ocupação hospitalar (ENF + UTI sobre 100 leitos), em %. */
export function ocupacaoHospitalar(estado: EstadoSimulacao): number {
  return Math.round(((noSetor(estado, 'enf').length + noSetor(estado, 'uti').length) / (CAP.enf + CAP.uti)) * 100);
}

const NOME_DESTINO: Record<string, string> = { enf: 'enfermaria', uti: 'UTI', alta_de: 'alta', alta_enf: 'alta', step_down: 'enfermaria', transferencia: 'transferência' };

/** Frase curta do que o paciente está esperando agora. */
export function situacaoDoPaciente(p: PacienteSim, minuto: number): string {
  if (emTransferencia(p)) return `Transferência pelo NIR em andamento: saída prevista às ${horaDoPlantao(p.transferenciaAte)}.`;
  if (p.sector === 'triagem' || p.sector === 'corredor') return `Aguardando maca no DE há ${duracaoCurta(minuto - p.arrMin)}.`;
  if (p.obsProlong) return 'Em observação prolongada no DE.';
  if ((p.sector === 'de' || p.sector === 'fast_track') && !p.ready) return p.labDelay ? 'Em avaliação, aguardando exame.' : 'Em avaliação no DE.';
  if (p.foraDoPerfil && p.dest === 'transferencia') return `Fora do perfil do hospital: precisa de transferência pelo NIR (aguarda há ${duracaoCurta(p.bMin)}).`;
  if (emBoarding(p)) return `Pronto para ${NOME_DESTINO[p.dest] ?? p.dest}: em boarding há ${duracaoCurta(p.bMin)}.`;
  if ((p.sector === 'de' || p.sector === 'fast_track') && p.ready) return 'Pronto para alta do DE.';
  if (p.sector === 'rpa') return p.ready ? `Pós-operatório pronto para ${NOME_DESTINO[p.dest] ?? p.dest}.` : 'Pós-operatório em recuperação.';
  if (p.social) return 'Alta bloqueada: problema social.';
  if (p.blocked) return 'Alta bloqueada pelo cancelamento cirúrgico (efeito cascata).';
  if (p.dischReady && p.prep > 0) return `Alta prescrita: preparo termina em ${duracaoCurta(p.prep)}.`;
  if (p.dischReady && p.sector === 'uti') return 'Alta da UTI: pode descer para a enfermaria.';
  if (p.dischReady) return 'Alta pronta: libere o leito.';
  if (p.leitoInadequado) return 'Paciente de UTI internado na enfermaria (leito inadequado).';
  if (p.sector === 'enf_extra') return 'No corredor da enfermaria (PCP): leve para um leito quando vagar.';
  return 'Internado.';
}

/** Texto do botão de destino para este paciente. */
export function rotuloDestino(p: PacienteSim, destino: Sector): string {
  switch (destino) {
    case 'de': return 'Levar ao DE';
    case 'alta': return p.sector === 'enf' ? 'Dar alta hospitalar' : p.sector === 'uti' ? 'Dar alta da UTI' : 'Dar alta do DE';
    case 'uti': return 'Internar na UTI';
    case 'enf':
      if (p.sector === 'uti') return 'Descer para a ENF (step-down)';
      if (p.sector === 'enf_extra') return 'Levar a um leito da ENF';
      if (p.dest === 'uti') return 'ENF em leito inadequado';
      return 'Internar na ENF';
    default: return destino;
  }
}

export interface EstadoNir {
  usos: number;
  max: number;
  espera: number;
  /** Pode usar no paciente selecionado agora. */
  podeNoSelecionado: boolean;
  emAndamento: PacienteSim[];
}

export function estadoNir(estado: EstadoSimulacao, selecionado: PacienteSim | null): EstadoNir {
  const f = estado.ferramentas;
  const livre = f.nirUsos < NIR_MAX_USOS && f.nirEspera <= 0;
  return {
    usos: f.nirUsos,
    max: NIR_MAX_USOS,
    espera: f.nirEspera,
    podeNoSelecionado: livre && selecionado !== null && emBoarding(selecionado) && !emTransferencia(selecionado),
    emAndamento: estado.pacientes.filter(emTransferencia).sort((a, b) => a.transferenciaAte - b.transferenciaAte),
  };
}

export function podePcpNoSelecionado(estado: EstadoSimulacao, selecionado: PacienteSim | null): boolean {
  return (
    estado.rodada === 2 &&
    estado.ferramentas.fcLiberado &&
    selecionado !== null &&
    emBoarding(selecionado) &&
    selecionado.dest === 'enf' &&
    !emTransferencia(selecionado)
  );
}

export interface EventoAtivo {
  rotulo: string;
  titulo: string;
  texto: string;
  icone: 'alerta' | 'raio' | 'relogio' | 'tubo';
}

/** O que acontece agora e merece o cartão escuro (no máximo um, o mais grave). */
export function eventoAtivo(estado: EstadoSimulacao): EventoAtivo | null {
  const m = estado.minuto;
  const e = estado.eventos;
  if (e.pcr) {
    return { rotulo: 'Evento ativo', titulo: 'Parada cardíaca no DE', texto: `Uma maca fica bloqueada até as ${horaDoPlantao(e.pcrEnd)}. Abra espaço: quem já pode subir ou ter alta?`, icone: 'alerta' };
  }
  const surto = estado.log.find(l => l.msg.startsWith('SURTO'));
  if (surto && m - surto.t <= 30) {
    return { rotulo: 'Evento ativo', titulo: 'Surto: 3 pacientes chegaram juntos', texto: 'A fila cresceu de uma vez. Libere macas no DE agora: altas e internações prontas primeiro.', icone: 'raio' };
  }
  if (e.tomo) {
    return {
      rotulo: 'Evento ativo',
      titulo: estado.rodada === 2 ? 'Tomógrafo em manutenção' : 'Tomógrafo quebrado',
      texto: `As decisões no DE vão demorar mais até as ${horaDoPlantao(e.tomoEnd)}. Priorize quem já está pronto.`,
      icone: 'relogio',
    };
  }
  const rpa = alertaRpa(estado);
  if (rpa) return { rotulo: 'Centro cirúrgico', titulo: 'RPA quase cheia', texto: `${rpa}. Tire o pós-operatório da RPA para não cancelar a cirurgia.`, icone: 'alerta' };
  if (e.lab) return { rotulo: 'Evento ativo', titulo: 'Atraso no laboratório', texto: `Resultados atrasados até as ${horaDoPlantao(e.labEnd)}.`, icone: 'tubo' };
  const deteriorados = estado.pacientes.filter(p => emBoarding(p) && p.det).length;
  if (deteriorados > 0) {
    return { rotulo: 'Risco agora', titulo: deteriorados === 1 ? '1 paciente deteriorou em boarding' : `${deteriorados} pacientes deterioraram em boarding`, texto: 'Sem leito, o próximo passo é o óbito evitável. Libere um leito ou use o NIR.', icone: 'alerta' };
  }
  return null;
}

/** Próxima cirurgia agendada (para o cartão do centro cirúrgico). */
export function proximaCirurgia(estado: EstadoSimulacao) {
  return estado.cirurgias
    .filter(s => s.st === 'scheduled')
    .sort((a, b) => a.stH - b.stH)[0] ?? null;
}
