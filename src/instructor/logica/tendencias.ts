// Mini-tendência da pontuação por grupo durante a rodada (StatTile).
// O ranking só traz o valor atual; o painel guarda os últimos pontos que viu.

import type { ItemRanking } from '../../shared/schemas';

export interface Ponto {
  minuto: number;
  pontuacao: number;
}

/** Quantos pontos guardar por grupo (cerca de um a cada 30 min de plantão). */
export const PONTOS_TENDENCIA = 12;
export const PASSO_MINUTOS = 30;

export type Historico = ReadonlyMap<string, readonly Ponto[]>;

/**
 * Acrescenta ao histórico os itens novos de uma rodada: um ponto quando o minuto
 * avança pelo menos `PASSO_MINUTOS` (o último ponto é sempre atualizado).
 * Devolve o mesmo objeto se nada mudou.
 */
export function acrescentar(historico: Historico, itens: ItemRanking[]): Historico {
  let mudou = false;
  const proximo = new Map(historico);
  for (const item of itens) {
    const pontos = proximo.get(item.grupoId) ?? [];
    const ultimo = pontos[pontos.length - 1];
    const penultimo = pontos[pontos.length - 2];
    const novo = { minuto: item.minuto, pontuacao: item.pontuacao };
    if (ultimo && ultimo.minuto === novo.minuto && ultimo.pontuacao === novo.pontuacao) continue;
    let lista: Ponto[];
    if (ultimo && novo.minuto < ultimo.minuto)
      lista = [novo]; // a rodada recomeçou
    // O último ponto é provisório até ficar PASSO_MINUTOS depois do anterior.
    else if (ultimo && penultimo && ultimo.minuto - penultimo.minuto < PASSO_MINUTOS)
      lista = [...pontos.slice(0, -1), novo];
    else lista = [...pontos, novo];
    proximo.set(item.grupoId, lista.slice(-PONTOS_TENDENCIA));
    mudou = true;
  }
  return mudou ? proximo : historico;
}

/** Variação da pontuação em relação ao ponto de cerca de 1 h atrás (ou ao mais antigo). */
export function variacaoUmaHora(pontos: readonly Ponto[] | undefined): number | undefined {
  if (!pontos || pontos.length < 2) return undefined;
  const atual = pontos[pontos.length - 1]!;
  const alvo = atual.minuto - 60;
  const referencia = [...pontos].reverse().find((p) => p.minuto <= alvo) ?? pontos[0]!;
  return atual.pontuacao - referencia.pontuacao;
}
