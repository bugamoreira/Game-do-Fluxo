// Mensagem para a tela a partir de um erro dos services. Os erros tipados já
// trazem a frase em português; qualquer outro vira um texto padrão (nunca o
// texto técnico, que pode vir em inglês).

import { ErroSimulador, RespostaInvalida } from '../../shared/services/erros';

export const MENSAGEM_PADRAO = 'Não foi possível concluir a ação. Tente de novo em alguns segundos.';

export function mensagemDeErro(e: unknown): string {
  if (e instanceof RespostaInvalida)
    return 'O servidor respondeu num formato inesperado. Tente de novo; se persistir, avise a equipe técnica.';
  if (e instanceof ErroSimulador && e.message) return e.message;
  return MENSAGEM_PADRAO;
}
