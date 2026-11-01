// Instância única do store do jogo neste computador, o hook de leitura e o relógio.

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { criarStoreJogo, type AcoesStoreJogo, type EstadoStoreJogo } from './storeJogo';
import { TIQUE_JOGO_MS } from './sincronia';

export const storeJogo = criarStoreJogo();

export function useJogo<T>(seletor: (s: EstadoStoreJogo & AcoesStoreJogo) => T): T {
  return useStore(storeJogo, seletor);
}

/**
 * Relógio do jogo: a cada tique pergunta até onde o motor pode andar
 * (`obterAlvo` devolve `null` para ficar parado) e avança o store.
 */
export function useRelogioDoJogo(ativo: boolean, obterAlvo: (minutoLocal: number) => number | null): void {
  const alvoRef = useRef(obterAlvo);
  useEffect(() => {
    alvoRef.current = obterAlvo;
  }, [obterAlvo]);

  useEffect(() => {
    if (!ativo) return;
    const id = window.setInterval(() => {
      const estado = storeJogo.getState().estado;
      if (!estado) return;
      const alvo = alvoRef.current(estado.minuto);
      if (alvo !== null) storeJogo.getState().avancarPara(alvo);
    }, TIQUE_JOGO_MS);
    return () => window.clearInterval(id);
  }, [ativo]);
}
