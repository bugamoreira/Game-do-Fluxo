// Envio e leitura do estado do jogo do grupo (RPCs `enviar_estado`, `obter_estado`,
// `registrar_serie`, `registrar_eventos`). Todas exigem o token do grupo.

import { z } from 'zod';
import {
  EVENTOS_POR_LOTE,
  EstadoSimulacaoTransporteSchema,
  EventoJogoSchema,
  MetricasSchema,
  MinutoSchema,
  RespostaObterEstadoSchema,
  RodadaSchema,
  TokenSchema,
  type EstadoBaseSync,
  type EstadoSimulacaoTransporte,
  type EventoJogo,
  type NumerosPorChave,
  type Rodada,
} from '../schemas';
import { TokenInvalido } from './erros';
import { RPC, chamarEValidar, chamarRpc, validarEntrada } from './rpc';

/** Placar resumido que acompanha o estado (motor: `pontuacao(estado)` e `metricas(estado)`). */
export interface ResumoPlacar<M extends NumerosPorChave<M> = Record<string, number>> {
  pontuacao: number;
  metricas: M;
}

const ResumoPlacarSchema = z.object({ pontuacao: z.number(), metricas: MetricasSchema });

function tokenValido(token: string): string {
  const r = TokenSchema.safeParse(token);
  if (!r.success) throw new TokenInvalido();
  return r.data;
}

export const syncService = {
  /**
   * Envia o estado completo e o placar resumido. O servidor recusa versão ≤ guardada
   * e rodada que não é a atual (aceita até 30 s depois do "Encerrar").
   * @throws {VersaoAntiga} o servidor já tem versão igual ou mais nova
   * @throws {RodadaInvalida} a rodada não está em andamento
   * @throws {TokenInvalido} token desconhecido ou grupo removido
   * @throws {SemConexao} rede
   */
  async enviarEstado<E extends EstadoBaseSync, M extends NumerosPorChave<M>>(
    token: string,
    estado: E,
    resumo: ResumoPlacar<M>,
  ): Promise<void> {
    const e = validarEntrada(EstadoSimulacaoTransporteSchema, estado);
    const r = validarEntrada(ResumoPlacarSchema, resumo);
    await chamarRpc(RPC.enviarEstado, {
      p_token: tokenValido(token),
      p_rodada: e.rodada,
      p_minuto: e.minuto,
      p_versao: e.versao,
      p_estado: e,
      p_pontuacao: r.pontuacao,
      p_metricas: r.metricas,
    });
  },

  /**
   * Último estado salvo no servidor para a rodada (sem rodada: a atual), ou `null`.
   * @throws {TokenInvalido}
   * @throws {SemConexao}
   * @throws {RespostaInvalida} estado salvo corrompido
   */
  async obterEstado(token: string, rodada?: Rodada): Promise<EstadoSimulacaoTransporte | null> {
    return chamarEValidar(
      RPC.obterEstado,
      { p_token: tokenValido(token), p_rodada: rodada === undefined ? null : validarEntrada(RodadaSchema, rodada) },
      RespostaObterEstadoSchema,
    );
  },

  /**
   * Registra um ponto da série de métricas (a cada 30 min simulados). Reenvio do mesmo minuto não duplica.
   * @throws {TokenInvalido} | {RodadaInvalida} | {SemConexao}
   */
  async registrarSerie<M extends NumerosPorChave<M>>(
    token: string,
    rodada: Rodada,
    minuto: number,
    metricas: M,
  ): Promise<void> {
    await chamarRpc(RPC.registrarSerie, {
      p_token: tokenValido(token),
      p_rodada: validarEntrada(RodadaSchema, rodada),
      p_minuto: validarEntrada(MinutoSchema, minuto),
      p_metricas: validarEntrada(MetricasSchema, metricas),
    });
  },

  /**
   * Registra ocorrências marcantes do plantão (óbitos, cancelamentos, surto...). Só inclui;
   * envia em lotes de até 50. Use `chave` para o reenvio não duplicar.
   * @throws {TokenInvalido} | {RodadaInvalida} | {SemConexao} | {ErroServico} (`LIMITE_EXCEDIDO`)
   */
  async registrarEventos(token: string, rodada: Rodada, eventos: EventoJogo[]): Promise<void> {
    if (eventos.length === 0) return;
    const t = tokenValido(token);
    const r = validarEntrada(RodadaSchema, rodada);
    const validos = validarEntrada(z.array(EventoJogoSchema), eventos);
    for (let i = 0; i < validos.length; i += EVENTOS_POR_LOTE) {
      await chamarRpc(RPC.registrarEventos, {
        p_token: t,
        p_rodada: r,
        p_eventos: validos.slice(i, i + EVENTOS_POR_LOTE),
      });
    }
  },
};
