// Pesquisa de satisfação: envio anônimo, agregados para o telão e leads para o
// facilitador logado. Toda leitura passa por RPC; a tabela não é legível.
import {
  LeadsSatisfacaoSchema,
  PainelSatisfacaoSchema,
  RespostaSatisfacaoSchema,
  type LeadSatisfacao,
  type PainelSatisfacao,
  type RespostaSatisfacao,
} from '../schemas';
import { RPC, chamarEValidar, chamarRpc, validarEntrada } from './rpc';

export const TURMA_PESQUISA = 'cbmede26';

export const satisfacaoService = {
  /** @throws {DadosInvalidos} | {LimiteExcedido} | {SemConexao} */
  async enviar(resposta: RespostaSatisfacao): Promise<void> {
    const dados = validarEntrada(RespostaSatisfacaoSchema, resposta);
    await chamarRpc(RPC.enviarSatisfacao, { p_dados: dados });
  },

  /** Agregados e comentários (sem e-mail). */
  painel(turma = TURMA_PESQUISA): Promise<PainelSatisfacao> {
    return chamarEValidar(RPC.painelSatisfacao, { p_turma: turma }, PainelSatisfacaoSchema);
  },

  /** E-mails e interesse: só facilitador logado. @throws {NaoAutorizado} */
  leads(turma = TURMA_PESQUISA): Promise<LeadSatisfacao[]> {
    return chamarEValidar(RPC.leadsSatisfacao, { p_turma: turma }, LeadsSatisfacaoSchema);
  },
};
