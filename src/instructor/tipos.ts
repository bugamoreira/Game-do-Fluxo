import type { EstadoTurma, EventoTurma, ItemRanking, PontoSerieTurma } from '../shared/schemas';
import type { AcaoAula, GrupoPainel, ProximaAcao } from './logica/fases';

/** Ações que as telas pedem ao painel; o painel decide se confirma antes. */
export type AcaoPainel =
  | { tipo: AcaoAula }
  | { tipo: 'pausar' }
  | { tipo: 'musica' }
  | { tipo: 'entrada' }
  | { tipo: 'revogarFullCapacity' }
  | { tipo: 'reconexao'; grupo: GrupoPainel }
  | { tipo: 'remover'; grupo: GrupoPainel }
  | { tipo: 'copiarLink'; link: string };

/** O que toda tela de fase recebe. */
export interface PropsTela {
  turma: EstadoTurma;
  minuto: number | null;
  grupos: GrupoPainel[];
  ranking: ItemRanking[];
  proxima: ProximaAcao;
  /** Chave da ação em andamento (para mostrar espera no botão certo). */
  ocupado: string | null;
  acionar: (acao: AcaoPainel) => void;
  /** Link do relatório já gerado nesta sessão. */
  linkRelatorio: string | null;
  origem: string;
  /** Séries de métricas da turma (`series_turma`); `null` enquanto não houver leitura. */
  series: PontoSerieTurma[] | null;
  /** Eventos da turma, mais recentes primeiro (`eventos_turma`); `null` enquanto não houver leitura. */
  eventos: EventoTurma[] | null;
}

/** Chave de "ocupado" de uma ação (uma por botão). */
export function chaveAcao(a: AcaoPainel): string {
  return 'grupo' in a ? `${a.tipo}:${a.grupo.id}` : a.tipo;
}
