// Relatório da turma: gerado pelo facilitador, lido por qualquer pessoa com o link.

import { RelatorioSchema, SlugSchema, type Relatorio, type RelatorioGerado } from '../schemas';
import { RelatorioNaoEncontrado } from './erros';
import { facilitadorService } from './facilitadorService';
import { RPC, chamarEValidar } from './rpc';

export const relatorioService = {
  /**
   * Congela os dados da turma encerrada, passa-a para `arquivada` e devolve o slug
   * público e a turma. Chamar de novo devolve o mesmo slug.
   * Atalho para `facilitadorService.gerarRelatorio`.
   * @throws {TransicaoInvalida} turma ainda não encerrada
   * @throws {NaoAutorizado} | {SemConexao} | {RespostaInvalida}
   */
  async gerar(turmaId: string, versaoRegras?: string, local?: string): Promise<RelatorioGerado> {
    return facilitadorService.gerarRelatorio(turmaId, { versaoRegras, local });
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
