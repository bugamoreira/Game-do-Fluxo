// Relatório da turma: gerado pelo facilitador, lido por qualquer pessoa com o link.

import { z } from 'zod';
import { IdSchema, RelatorioGeradoSchema, RelatorioSchema, SlugSchema, type Relatorio } from '../schemas';
import { RelatorioNaoEncontrado } from './erros';
import { RPC, chamarEValidar, validarEntrada } from './rpc';

export const relatorioService = {
  /**
   * Congela os dados da turma encerrada, passa-a para `arquivada` e devolve o slug
   * público. Chamar de novo devolve o mesmo slug.
   * @throws {TransicaoInvalida} turma ainda não encerrada
   * @throws {NaoAutorizado} | {SemConexao} | {RespostaInvalida}
   */
  async gerar(turmaId: string, versaoRegras?: string): Promise<{ slug: string }> {
    return chamarEValidar(
      RPC.gerarRelatorio,
      {
        p_turma_id: validarEntrada(IdSchema, turmaId),
        p_versao_regras: versaoRegras === undefined ? null : validarEntrada(z.string().max(40), versaoRegras),
      },
      RelatorioGeradoSchema,
    );
  },

  /**
   * Relatório pelo slug do link.
   * @throws {RelatorioNaoEncontrado} slug malformado ou inexistente
   * @throws {SemConexao} | {RespostaInvalida}
   */
  async obter(slug: string): Promise<Relatorio> {
    const s = SlugSchema.safeParse(slug.trim());
    if (!s.success) throw new RelatorioNaoEncontrado();
    const relatorio = await chamarEValidar(RPC.obterRelatorio, { p_slug: s.data }, RelatorioSchema);
    if (!relatorio) throw new RelatorioNaoEncontrado();
    return relatorio;
  },
};
