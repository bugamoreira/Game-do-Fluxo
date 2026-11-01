// ============================================================
// Cópia local do jogo e sessão do grupo, no localStorage deste computador.
//
// - Cópia local: estado completo da simulação, salvo a cada passo. Na
//   reconexão, é a primeira fonte (docs/design.md §5, "Regras de transição").
// - Sessão local: código da turma, grupo e token, para reconectar ao mesmo
//   grupo depois de fechar a aba ou recarregar.
//
// Toda leitura passa por Zod. Conteúdo corrompido ou de versão antiga do app
// é descartado (e apagado) sem quebrar a tela. Falha do armazenamento
// (modo privado, cota cheia) nunca derruba o jogo.
// ============================================================

import {
  CopiaLocalSchema,
  SessaoLocalSchema,
  VERSAO_FORMATO_COPIA,
  type CopiaLocal,
  type EstadoBaseSync,
  type SessaoLocal,
} from '../schemas';

export const CHAVE_COPIA = 'simulador:copia';
export const CHAVE_SESSAO = 'simulador:sessao';

/** Subconjunto do Storage usado aqui (permite injetar um falso nos testes). */
export type ArmazenamentoChaveValor = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function armazenamentoPadrao(): ArmazenamentoChaveValor | null {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null; // acesso ao localStorage pode lançar em navegador restrito
  }
}

function ler<T>(
  chave: string,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  arm: ArmazenamentoChaveValor | null,
): T | null {
  if (!arm) return null;
  try {
    const bruto = arm.getItem(chave);
    if (bruto === null) return null;
    const r = schema.safeParse(JSON.parse(bruto));
    if (r.success) return r.data;
  } catch {
    // JSON inválido ou armazenamento indisponível: cai no descarte abaixo
  }
  try {
    arm.removeItem(chave);
  } catch {
    // nada a fazer
  }
  return null;
}

function gravar(chave: string, valor: unknown, arm: ArmazenamentoChaveValor | null): boolean {
  if (!arm) return false;
  try {
    arm.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false; // cota cheia ou modo privado: o jogo segue, só sem cópia local
  }
}

function apagar(chave: string, arm: ArmazenamentoChaveValor | null): void {
  try {
    arm?.removeItem(chave);
  } catch {
    // nada a fazer
  }
}

export const copiaLocal = {
  /** Salva o estado. Devolve `false` se o armazenamento recusou. */
  salvar(
    token: string,
    estado: EstadoBaseSync,
    agora = Date.now(),
    arm: ArmazenamentoChaveValor | null = armazenamentoPadrao(),
  ): boolean {
    const copia = { formato: VERSAO_FORMATO_COPIA, token, salvoEm: agora, estado };
    return gravar(CHAVE_COPIA, copia, arm);
  },

  /**
   * Lê a cópia válida. Com `token`, só devolve se a cópia for desse grupo.
   * Cópia corrompida é apagada e devolve `null`.
   */
  ler(token?: string, arm: ArmazenamentoChaveValor | null = armazenamentoPadrao()): CopiaLocal | null {
    const copia = ler(CHAVE_COPIA, CopiaLocalSchema, arm);
    if (!copia) return null;
    if (token !== undefined && copia.token !== token) return null;
    return copia;
  },

  limpar(arm: ArmazenamentoChaveValor | null = armazenamentoPadrao()): void {
    apagar(CHAVE_COPIA, arm);
  },
};

export const sessaoLocal = {
  salvar(sessao: Omit<SessaoLocal, 'formato'>, arm: ArmazenamentoChaveValor | null = armazenamentoPadrao()): boolean {
    return gravar(CHAVE_SESSAO, { formato: VERSAO_FORMATO_COPIA, ...sessao }, arm);
  },

  /** Sessão salva; com `codigo`, só se for da mesma turma. */
  ler(codigo?: string, arm: ArmazenamentoChaveValor | null = armazenamentoPadrao()): SessaoLocal | null {
    const s = ler(CHAVE_SESSAO, SessaoLocalSchema, arm);
    if (!s) return null;
    if (codigo !== undefined && s.codigo.toUpperCase() !== codigo.trim().toUpperCase()) return null;
    return s;
  },

  limpar(arm: ArmazenamentoChaveValor | null = armazenamentoPadrao()): void {
    apagar(CHAVE_SESSAO, arm);
  },
};

/**
 * Escolhe o estado para restaurar na reconexão: o mais recente (maior versão)
 * entre a cópia local e a do servidor, desde que seja da rodada pedida.
 */
export function escolherEstadoParaRestaurar<E extends EstadoBaseSync>(
  rodada: 1 | 2,
  local: E | null | undefined,
  servidor: E | null | undefined,
): E | null {
  const candidatos = [local, servidor].filter((e): e is E => e != null && e.rodada === rodada);
  if (candidatos.length === 0) return null;
  return candidatos.reduce((a, b) => (b.versao > a.versao ? b : a));
}
