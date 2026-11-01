// ============================================================
// Tipos do motor da simulação (contrato B1 — docs/contratos.md §1)
// ============================================================

import type { Destination, Events, LogEntry, LogType, Patient, Round, Sector, Severity, SfxType, Stats, Surgery, SurgeryStatus } from '../../types/game';

export type Rodada = Round;

/**
 * Setores do motor. Além dos de `Sector`: `fast_track` (área dos verdes na R2, 4 vagas),
 * `enf_extra` (corredor da enfermaria do PCP/Full Capacity, 2 vagas) e `obito` (saiu do leito).
 */
/** `cc`: paciente numa sala operatória (emergência em cirurgia ou pós-operatório aguardando vaga na RPA). */
export type SetorSim = Sector | 'fast_track' | 'enf_extra' | 'obito' | 'cc';

/** Halo de risco na tela. */
export type Risco = 'baixo' | 'atencao' | 'alto';

/** Destino do paciente; `transferencia` = fora do perfil do hospital, só sai por NIR. */
export type DestinoSim = Destination | 'transferencia';

export interface PacienteSim extends Omit<Patient, 'sector' | 'dest' | 'offSvc'> {
  sector: SetorSim;
  dest: DestinoSim;
  /** Paciente de UTI internado na ENF por falta de leito (antigo `offSvc`) */
  leitoInadequado: boolean;
  /** Necessidade que o hospital não atende (ex.: hemodinâmica, cirurgia oncológica): precisa de transferência */
  foraDoPerfil: boolean;
  /** NIR acionado: minuto previsto de saída (0 = sem transferência em andamento). Continua no DE até lá. */
  transferenciaAte: number;
  /** Saiu do hospital por transferência (NIR) */
  transferido: boolean;
  risco: Risco;
  /** Entrou no DE dentro do tempo-alvo? null = ainda não decidido (ou paciente do censo inicial) */
  slaOk: boolean | null;
  /** Minuto em que entrou no DE/Fast Track */
  entradaMin: number | null;
  /** Minuto em que deteriorou */
  detMin: number | null;
  /** Voltou ao DE (deteriorou fora do perfil): prioridade máxima na fila */
  retorno: boolean;
  /** Alta bloqueada por efeito cascata até este minuto (0 = sem prazo) */
  bloqueioAte: number;
  /** Emergência cirúrgica aguardando sala operatória livre (fica no DE, com risco alto) */
  emergenciaCx?: boolean;
  /** Minuto em que a emergência cirúrgica foi indicada */
  emergenciaDesde?: number | null;
  /** Minuto em que a emergência entrou na sala operatória */
  emergenciaInicioCx?: number | null;
}

/** `aguardando_rpa`: a cirurgia terminou e o paciente segue na sala até abrir vaga na RPA. */
export type StatusCirurgia = SurgeryStatus | 'andamento' | 'aguardando_rpa';

export interface CirurgiaSim extends Omit<Surgery, 'st'> {
  st: StatusCirurgia;
  /** Minuto em que começou de fato (atrasa se a sala estiver ocupada) */
  inicioReal?: number | null;
}

export type StatusSala = 'livre' | 'cirurgia' | 'aguardando_rpa';

/** Uma das salas operatórias do centro cirúrgico (estado exposto à tela). */
export interface SalaCirurgica {
  numero: number;
  status: StatusSala;
  /** Rótulo de quem ocupa a sala (ex.: "Cx Eletiva 2", "EMG-Ana"); null se livre */
  ocupante: string | null;
  /** Cirurgia eletiva na sala (id em `cirurgias`), se for o caso */
  cirurgiaId: number | null;
  /** Paciente na sala (emergência em cirurgia, ou qualquer pós-operatório aguardando RPA) */
  pacienteId: number | null;
  inicio: number | null;
  /** Previsão de término da cirurgia (minuto do plantão) */
  fimPrevisto: number | null;
  dest: 'enf' | 'uti' | null;
}

export interface ChegadaPlanejada {
  minuto: number;
  sev: Severity;
  dest: 'alta_de' | 'enf' | 'uti';
  deNeed: number;
  nome: string;
  surto: boolean;
  /** Fora do perfil do hospital: fica pronto com destino "transferência" e só sai por NIR */
  foraDoPerfil: boolean;
}

export type ChaveLote = 'enf1' | 'enf2' | 'enf3' | 'uti1' | 'uti2';

export interface LoteAlta {
  chave: ChaveLote;
  pacientes: { id: number; prepR1: number }[];
}

/** Gerada da semente no início; idêntica na R1 e na R2. */
export interface Agenda {
  chegadas: ChegadaPlanejada[];
  altas: LoteAlta[];
}

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
  /** Estado do gerador de EVENTOS (a demanda vem pronta em `agenda`) */
  rng: number;
  pacientes: PacienteSim[];
  cirurgias: CirurgiaSim[];
  /** As 4 salas operatórias: ocupante, status e horário previsto */
  salas: SalaCirurgica[];
  stats: Stats;
  eventos: Events;
  /** Rounds e mensagens já disparados */
  flags: Record<string, boolean>;
  /** Minuto da próxima chegada da agenda (> 1140 quando acabou) */
  proximaChegada: number;
  /** Chegadas e lotes de alta do plantão (extensão do contrato) */
  agenda: Agenda;
  /** Quantas chegadas da agenda já entraram (extensão do contrato) */
  chegadasProcessadas: number;
  ferramentas: Ferramentas;
  /** Últimas 60 entradas, a mais recente primeiro */
  log: LogEntry[];
  /** Próximo id de paciente (extensão do contrato: ids não se repetem mesmo após NIR) */
  proximoId: number;
  /** Carga de trabalho do gestor na rodada (extensão do contrato) */
  carga: CargaGestor;
}

/** Quanto o grupo precisou decidir e apagar incêndio, e quanto as ferramentas automáticas fizeram. */
export interface CargaGestor {
  decisoes: number;
  produtivas: number;
  reativas: number;
  alertas: {
    deterioracao: number;
    obito: number;
    cancelamento: number;
    deLotado: number;
    corredor: number;
    lwbs: number;
  };
  automatico: {
    /** Altas dadas pelo Fluxista */
    fluxista: number;
    /** Leitos liberados na hora pelo Discharge Lounge (altas da R2 com preparo zero) */
    dischargeLounge: number;
    /** Verdes atendidos no Fast Track */
    fastTrack: number;
    /** Cirurgias que só começaram porque havia alta pronta liberando o leito de destino */
    cirurgiasViabilizadas: number;
  };
  /** Emergências cirúrgicas do plantão */
  emergencias: number;
  /** Emergências que não encontraram sala operatória livre e tiveram de esperar no DE */
  emergenciasSemSala: number;
}

export type Acao =
  | { tipo: 'mover'; pacienteId: number; destino: Sector }
  | { tipo: 'confirmarLeitoInadequado'; pacienteId: number }
  | { tipo: 'nir'; pacienteId: number }
  | { tipo: 'fullCapacity'; pacienteId: number };

export type TipoOcorrencia =
  | 'inicio'
  | 'fim'
  | 'pcr' | 'pcr_fim'
  | 'tomografo' | 'tomografo_fim'
  | 'laboratorio' | 'laboratorio_fim'
  | 'surto' | 'fora_do_perfil'
  | 'social' | 'bloqueio_social' | 'social_fim'
  | 'emergencia_cirurgica' | 'emergencia_obito'
  | 'obs_prolongada' | 'obs_fim'
  | 'fluxista' | 'fluxo_rapido'
  | 'deterioracao' | 'deterioracao_espera' | 'obito' | 'obito_espera'
  | 'deterioracao_leito_inadequado' | 'retorno_de' | 'de_lotado'
  | 'dado_real'
  | 'corredor' | 'lwbs'
  | 'round_enf' | 'round_uti' | 'bloqueio_fim'
  | 'cirurgia_iniciada' | 'cirurgia_cancelada' | 'cirurgia_concluida'
  | 'alta' | 'movimento' | 'leito_inadequado'
  | 'nir' | 'nir_concluido' | 'full_capacity' | 'full_capacity_liberado' | 'full_capacity_revogado'
  | 'emergencia_aguardando_sala' | 'deterioracao_emergencia' | 'cirurgia_atrasada' | 'aguardando_rpa';

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
  | 'confirmar_leito_inadequado'
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
  /** Internações em leito inadequado (antigo `off`) */
  leitoInadequado: number;
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
  /** % de pacientes que entraram no DE dentro do tempo-alvo de Manchester */
  slaPct: number;
  triagemOcc: number;
  fastTrackOcc: number;
  enfExtraOcc: number;
  /** Fora do perfil esperando transferência */
  aguardandoTransferencia: number;
  decisoes: number;
  decisoesProdutivas: number;
  decisoesReativas: number;
  /** Deteriorações + óbitos + cancelamentos + vezes que o DE lotou + idas ao corredor + LWBS */
  alertas: number;
  autoFluxista: number;
  autoDischargeLounge: number;
  autoFastTrack: number;
  autoCirurgiasViabilizadas: number;
  emergencias: number;
  emergenciasSemSala: number;
  /** Emergências cirúrgicas esperando sala agora (no DE) */
  emergenciasAguardandoSala: number;
  /** Eletivas que começaram depois do horário (sala ocupada) */
  cxAtrasadas: number;
  /** Salas operatórias ocupadas por paciente que já operou e espera vaga na RPA */
  salasAguardandoRpa: number;
}

/** Robô de decisão: olha o estado e devolve a próxima ação, ou null para não fazer nada. */
export type Estrategia = (estado: EstadoSimulacao) => Acao | null;
