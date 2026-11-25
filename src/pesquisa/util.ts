// Utilidades das páginas da pesquisa (DOM puro, sem framework).
import { DadosInvalidos, ErroSimulador, NaoAutorizado, SemConexao } from '../shared/services/erros';

type Filho = Node | string | null | undefined | false;

/** Cria um elemento com atributos e filhos (texto sempre como texto, nunca HTML). */
export function el(tag: string, attrs: Record<string, string> = {}, ...filhos: Filho[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const f of filhos) if (f !== null && f !== undefined && f !== false) e.append(f);
  return e;
}

export function lerLocal(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave) || null;
  } catch {
    return null;
  }
}

export function gravarLocal(chave: string, valor: string): void {
  try {
    if (valor) window.localStorage.setItem(chave, valor);
    else window.localStorage.removeItem(chave);
  } catch {
    /* navegador sem armazenamento: segue sem rascunho */
  }
}

export function mensagemErro(e: unknown): string {
  if (e instanceof SemConexao) return 'Sem conexão no momento. Suas respostas estão guardadas; tente enviar de novo.';
  if (e instanceof NaoAutorizado) return 'Entre com a conta do facilitador.';
  if (e instanceof DadosInvalidos) return e.message || 'Confira as respostas e tente de novo.';
  if (e instanceof ErroSimulador && e.message) return e.message;
  return 'Não foi possível concluir. Tente de novo.';
}
