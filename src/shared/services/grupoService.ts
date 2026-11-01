// Entrada do grupo na turma (RPC `entrar_grupo`). Regras: docs/schema.md, "Regras de entrada".

import { z } from 'zod';
import { RespostaEntrarGrupoSchema, TokenSchema, type Entrada } from '../schemas';
import { RespostaInvalida } from './erros';
import { RPC, chamarEValidar, validarEntrada } from './rpc';
import { normalizarCodigo } from './turmaService';

/** Caracteres de formatação invisíveis ou de direção de texto (mesma regra de `interno.normalizar_nome`). */
export const INVISIVEIS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/;
const LETRA_OU_DIGITO = /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/g;

const NomeGrupoSchema = z
  .string()
  .refine((s) => !INVISIVEIS.test(s), { message: 'O nome do grupo tem caracteres invisíveis. Digite o nome de novo.' })
  .trim()
  .transform((s) => s.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(2, { message: 'O nome do grupo precisa ter de 2 a 30 caracteres.' })
      .max(30, { message: 'O nome do grupo precisa ter de 2 a 30 caracteres.' })
      .refine((s) => (s.match(LETRA_OU_DIGITO) ?? []).length >= 2, {
        message: 'O nome do grupo precisa ter ao menos 2 letras ou números.',
      }),
  );

export const grupoService = {
  /**
   * Entra (ou reconecta) o grupo na turma.
   * Com `tokenLocal` deste computador, reconecta ao mesmo grupo (o token não muda)
   * e devolve o estado salvo no servidor. O `token` devolvido é sempre o que vale:
   * o novo, quando o servidor gerou um, ou o próprio `tokenLocal`.
   * @throws {DadosInvalidos} nome inválido (mensagem pronta para a tela)
   * @throws {TurmaNaoEncontrada} código inexistente
   * @throws {EntradaFechada} rodada em andamento sem entrada liberada, ou turma encerrada
   * @throws {GrupoJaAtivo} nome em uso por outro computador, sem reconexão liberada
   * @throws {TurmaCheia} limite de grupos atingido
   * @throws {SemConexao} rede
   */
  async entrar(codigo: string, nome: string, tokenLocal?: string | null): Promise<Entrada> {
    const nomeValido = validarEntrada(NomeGrupoSchema, nome);
    // Token local corrompido não deve impedir a entrada: vai como ausente.
    const token = tokenLocal && TokenSchema.safeParse(tokenLocal).success ? tokenLocal : null;
    const r = await chamarEValidar(
      RPC.entrarGrupo,
      { p_codigo: normalizarCodigo(codigo), p_nome: nomeValido, p_token: token },
      RespostaEntrarGrupoSchema,
    );
    const tokenQueVale = r.token ?? token;
    if (!tokenQueVale) throw new RespostaInvalida(RPC.entrarGrupo, 'Servidor não devolveu token para grupo novo');
    return {
      turmaId: r.turmaId,
      status: r.status,
      rodada: r.rodada,
      grupo: r.grupo,
      token: tokenQueVale,
      reconectado: r.reconectado,
      estadoSalvo: r.estadoSalvo ?? null,
    };
  },
};
