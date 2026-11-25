/**
 * Semente da partida a partir da turma: a mesma para todos os grupos e para as
 * duas rodadas (mesma demanda, comparação justa). FNV-1a de 32 bits.
 * O telão usa a mesma semente para tocar as chegadas no ritmo da sala.
 */
export function sementeDaTurma(turmaId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < turmaId.length; i++) {
    h ^= turmaId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
