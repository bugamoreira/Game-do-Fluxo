// Leitura pública do estado da turma e do ranking (RPCs `estado_turma` e `ranking`).

import { z } from 'zod';
import {
  RespostaEstadoTurmaSchema,
  RespostaRankingSchema,
  type EstadoTurma,
  type ItemRanking,
} from '../schemas';
import { TurmaNaoEncontrada } from './erros';
import { RPC, chamarEValidar } from './rpc';

const CodigoSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((s) => s.toUpperCase());

/** Normaliza o código digitado (espaços, minúsculas). @throws {TurmaNaoEncontrada} se vazio */
export function normalizarCodigo(codigo: string): string {
  const r = CodigoSchema.safeParse(codigo);
  if (!r.success) throw new TurmaNaoEncontrada();
  return r.data;
}

export const turmaService = {
  /**
   * Estado da turma: status, rodada, relógio, hora do servidor, flags e grupos.
   * Com `token`, o servidor marca o grupo como presente ("conectado" = visto
   * nos últimos 15 s) e devolve `tokenValido`.
   * @throws {TurmaNaoEncontrada} código inexistente
   * @throws {SemConexao} rede
   * @throws {RespostaInvalida} formato inesperado
   */
  async estado(codigo: string, token?: string | null): Promise<EstadoTurma> {
    const turma = await chamarEValidar(
      RPC.estadoTurma,
      { p_codigo: normalizarCodigo(codigo), p_token: token ?? null },
      RespostaEstadoTurmaSchema,
    );
    if (!turma) throw new TurmaNaoEncontrada();
    return turma;
  },

  /**
   * Ranking da turma (alimenta o telão e o facilitador).
   * @throws {TurmaNaoEncontrada} código inexistente
   * @throws {SemConexao} rede
   * @throws {RespostaInvalida} formato inesperado
   */
  async ranking(codigo: string): Promise<ItemRanking[]> {
    return chamarEValidar(RPC.ranking, { p_codigo: normalizarCodigo(codigo) }, RespostaRankingSchema);
  },
};
