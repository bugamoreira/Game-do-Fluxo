// ============================================================
// Tipos do motor da simulação (contrato B1 — docs/contratos.md §1)
// ============================================================

import type { Events, LogEntry, LogType, Patient, Round, Sector, SfxType, Stats, Surgery } from '../../types/game';

export type Rodada = Round;

export interface Ferramentas {
  /** NIR usados (máx. 3, só R2) */
  nirUsos: number;
  /** Minutos que faltam para o NIR poder ser usado de novo */
  nirEspera: number;
  /** Full Capacity usados (máx. 2, só R2) */
  fcUsos: number;
  /** Diretoria (facilitador) autorizou o Full Capacity */
  fcLiberado: boolean;
}

/** Tudo o que é preciso para continuar o jogo de onde parou (serializável em JSON). */
export interface EstadoSimulacao {
  /** Incrementa a cada passo ou ação */
  versao: number;
  rodada: Rodada;
  /** Minuto do dia: 420 (7h) a 1140 (19h) */
  minuto: number;
  /** Estado do gerador mulberry32 */
  rng: number;
  pacientes: Patient[];
  cirurgias: Surgery[];
  stats: Stats;
  eventos: Events;
  /** Rounds e mensagens já disparados; `ccBlocked` = sala 4 reservada para emergências */
  flags: Record<string, boolean>;
  /** Minuto da próxima chegada espontânea */
  proximaChegada: number;
  ferramentas: Ferramentas;
  /** Últimas 60 entradas, a mais recente primeiro */
  log: LogEntry[];
  /** Próximo id de paciente (extensão do contrato: ids não se repetem mesmo após NIR) */
  proximoId: number;
}

export type Acao =
  | { tipo: 'mover'; pacienteId: number; destino: Sector }
  | { tipo: 'confirmarForaDoPerfil'; pacienteId: number }
  | { tipo: 'nir'; pacienteId: number }
  | { tipo: 'fullCapacity'; pacienteId: number };

export type TipoOcorrencia =
  | 'inicio'
  | 'fim'
  | 'pcr' | 'pcr_fim'
  | 'tomografo' | 'tomografo_fim'
  | 'laboratorio' | 'laboratorio_fim'
  | 'surto'
  | 'social' | 'bloqueio_social' | 'social_fim'
  | 'emergencia_cirurgica' | 'emergencia_obito' | 'emergencia_espera'
  | 'obs_prolongada' | 'obs_fim'
  | 'fluxista' | 'fluxo_rapido'
  | 'deterioracao' | 'obito'
  | 'deterioracao_fora_do_perfil' | 'retorno_de'
  | 'dado_real'
  | 'corredor' | 'lwbs'
  | 'round_enf' | 'round_uti'
  | 'cirurgia_cancelada' | 'cirurgia_concluida'
  | 'alta' | 'movimento' | 'fora_do_perfil'
  | 'nir' | 'full_capacity' | 'full_capacity_liberado';

/** Algo que aconteceu num passo ou ação: vira entrada de log, som e eventos_jogo. */
export interface Ocorrencia {
  minuto: number;
  tipo: TipoOcorrencia;
  /** Mensagem do log, em português */
  msg: string;
  nivel: LogType;
  som?: SfxType;
  pacienteId?: number;
  /** Faixa de efeito cascata (hoje `setCascade` + timeout) */
  cascata?: { texto: string; duracaoMs: number };
  /** Piscar a tela de vermelho (hoje `setDeathFlash`) */
  flashObito?: boolean;
  /** Classificação da decisão do grupo (painel pós-rodada) */
  decisao?: 'produtiva' | 'reativa';
}

export interface ResultadoPasso {
  estado: EstadoSimulacao;
  ocorrencias: Ocorrencia[];
}

export type CodigoErroAcao =
  | 'fim_de_jogo'
  | 'paciente_inexistente'
  | 'destino_invalido'
  | 'lotado'
  | 'confirmar_fora_do_perfil'
  | 'ferramenta_indisponivel';

export interface ErroAcao {
  erro: string;
  codigo: CodigoErroAcao;
}

/** Mesmo formato do placar atual (`game_state.metrics`). */
export interface Metricas {
  dis: number;
  det: number;
  dth: number;
  cxC: number;
  lw: number;
  off: number;
  soc: number;
  bH: number;
  deOcc: number;
  enfOcc: number;
  utiOcc: number;
  rpaOcc: number;
  boarding: number;
  avgB: number;
  corredor: number;
  altaHosp: number;
  libDE: number;
}

export interface OpcoesEstadoInicial {
  /** Sala 4 reservada para emergências cirúrgicas (hoje só no modo solo). Padrão: falso. */
  ccBlocked?: boolean;
}

/** Robô de decisão: olha o estado e devolve a próxima ação, ou null para não fazer nada. */
export type Estrategia = (estado: EstadoSimulacao) => Acao | null;
