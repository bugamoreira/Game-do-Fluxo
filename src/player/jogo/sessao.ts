// ============================================================
// Regras puras da sessão local do grupo (quem é este computador na sala).
// Sem React e sem rede (testadas em __tests__/sessao.test.ts).
// ============================================================

import type { SessaoLocal } from '../../shared/schemas/sync.schema';

/** Nome como o servidor compara: espaços normalizados, sem diferenciar maiúsculas. */
export function chaveDoNome(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Token a enviar quando o grupo digita o nome na J1: o da sessão deste
 * computador, se ela é desta sala e desta turma e o nome bate com o dela.
 * Assim, quem recarregou a página e digitou o mesmo nome volta ao próprio
 * grupo sem precisar de liberação do facilitador.
 */
export function tokenParaNome(sessao: SessaoLocal | null, turmaId: string | null, nome: string): string | null {
  if (!sessao) return null;
  if (turmaId !== null && sessao.turmaId !== undefined && sessao.turmaId !== turmaId) return null;
  return chaveDoNome(sessao.nome) === chaveDoNome(nome) ? sessao.token : null;
}

/**
 * A sessão salva pode reentrar sozinha (sem a J1)? Só se for da mesma turma
 * que está aberta agora com este código. Sessão antiga, de outra turma com o
 * mesmo código (ou sem turma registrada), vai para a J1.
 * `turmaAtual` nulo = não foi possível consultar (sem rede): reentra com a
 * sessão, que é o caminho para o jogo seguir com a cópia local.
 */
export function podeReentrarSozinho(sessao: SessaoLocal | null, turmaAtual: string | null | undefined): boolean {
  if (!sessao) return false;
  if (turmaAtual === null) return sessao.turmaId !== undefined;
  return sessao.turmaId !== undefined && sessao.turmaId === turmaAtual;
}

/** Turma encerrada ou arquivada: o grupo fica na tela final, mesmo se o token deixar de valer. */
export function ehStatusFinal(status: string | null | undefined): boolean {
  return status === 'encerrada' || status === 'arquivada';
}

export const MENSAGEM_ACESSO_PERDIDO =
  'Este computador perdeu o acesso ao grupo (o grupo pode ter sido removido ou ter entrado em outro computador). Entre de novo com o nome do grupo e o código de acesso.';

export const MENSAGEM_TURMA_NOVA =
  'A sala começou uma nova turma. Entre de novo com o nome do grupo e o código de acesso que aparece no telão.';
