export * from './types';
export {
  criarEstadoInicial, passo, avancarAte, aplicarAcao, destinosPossiveis, pontuacao, metricas,
  liberarFullCapacity, alertaRpa, capacidadeSetor, encerrado, ehErro,
  MINUTO_INICIO, MINUTO_FIM, LOG_MAX, NIR_MAX_USOS, NIR_ESPERA_MIN, FC_MAX_USOS,
} from './motor';
export { passivo, puxaFluxo, seguraNoPs, foraDoPerfil, ESTRATEGIAS, simularPartida } from './estrategias';
export type { ResultadoPartida } from './estrategias';
