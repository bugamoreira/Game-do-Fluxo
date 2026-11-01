// Entrada do grupo na turma (RPC `entrar_grupo`). Regras: docs/schema.md, "Regras de entrada".

import { z } from 'zod';
import { CodigoAcessoSchema, RespostaEntrarGrupoSchema, TokenSchema, type Entrada } from '../schemas';
import { CodigoAcessoInvalido, RespostaInvalida } from './erros';
import { RPC, chamarRpc, validar, validarEntrada } from './rpc';
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

const RecusaAcessoSchema = z.object({
  erro: z.literal('CODIGO_ACESSO_INVALIDO'),
  detalhe: z.string().min(1).optional(),
});

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
   * @throws {CodigoAcessoInvalido} grupo novo ou reconexão liberada sem o código de acesso certo
   * @throws {ErroServico} `LIMITE_EXCEDIDO`: muitas tentativas com código errado (aguardar 1 minuto)
   * @throws {SemConexao} rede
   */
  async entrar(codigo: string, nome: string, tokenLocal?: string | null, codigoAcesso?: string | null): Promise<Entrada> {
    const nomeValido = validarEntrada(NomeGrupoSchema, nome);
    const acesso = codigoAcesso?.trim() ? validarEntrada(CodigoAcessoSchema, codigoAcesso.trim()) : null;
    // Token local corrompido não deve impedir a entrada: vai como ausente.
    const token = tokenLocal && TokenSchema.safeParse(tokenLocal).success ? tokenLocal : null;
    const bruto = await chamarRpc(RPC.entrarGrupo, {
      p_codigo: normalizarCodigo(codigo),
      p_nome: nomeValido,
      p_token: token,
      p_acesso: acesso,
    });
    // Código errado volta como resposta (não exceção) para o servidor contar as tentativas.
    const recusa = RecusaAcessoSchema.safeParse(bruto);
    if (recusa.success) throw new CodigoAcessoInvalido(recusa.data.detalhe);
    const r = validar(RespostaEntrarGrupoSchema, bruto, RPC.entrarGrupo);
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
