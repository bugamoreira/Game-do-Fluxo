// "Voltou": a rede voltou (evento `online`) ou a aba voltou a ficar visível
// (`visibilitychange`). Navegadores atrasam ou congelam timers em aba oculta;
// ao voltar, a consulta e o relógio do jogo precisam se atualizar na hora.
// Sem React (testado em __tests__/aoVoltar.test.ts).

type Alvo = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface AlvosVoltar {
  janela: Alvo | null;
  documento: (Alvo & { visibilityState?: string }) | null;
}

function alvosPadrao(): AlvosVoltar {
  return {
    janela: typeof window === 'undefined' ? null : window,
    documento: typeof document === 'undefined' ? null : document,
  };
}

/** Chama `acao` quando a rede volta ou a aba volta a ficar visível. Devolve o cancelamento. */
export function aoVoltar(acao: () => void, alvos: AlvosVoltar = alvosPadrao()): () => void {
  const { janela, documento } = alvos;
  const aoMudarVisibilidade = () => {
    if (documento?.visibilityState === undefined || documento.visibilityState === 'visible') acao();
  };
  janela?.addEventListener('online', acao);
  documento?.addEventListener('visibilitychange', aoMudarVisibilidade);
  return () => {
    janela?.removeEventListener('online', acao);
    documento?.removeEventListener('visibilitychange', aoMudarVisibilidade);
  };
}
