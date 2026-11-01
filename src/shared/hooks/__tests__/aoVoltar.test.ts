import { describe, expect, it, vi } from 'vitest';
import { aoVoltar } from '../aoVoltar';

function documentoFalso(visibilityState: string) {
  const alvo = new EventTarget() as EventTarget & { visibilityState: string };
  alvo.visibilityState = visibilityState;
  return alvo;
}

describe('aoVoltar', () => {
  it('chama a ação quando a aba volta a ficar visível e quando a rede volta', () => {
    const janela = new EventTarget();
    const documento = documentoFalso('hidden');
    const acao = vi.fn();
    const cancelar = aoVoltar(acao, { janela, documento });
    documento.dispatchEvent(new Event('visibilitychange'));
    expect(acao).not.toHaveBeenCalled();
    documento.visibilityState = 'visible';
    documento.dispatchEvent(new Event('visibilitychange'));
    janela.dispatchEvent(new Event('online'));
    expect(acao).toHaveBeenCalledTimes(2);
    cancelar();
    documento.dispatchEvent(new Event('visibilitychange'));
    janela.dispatchEvent(new Event('online'));
    expect(acao).toHaveBeenCalledTimes(2);
  });

  it('sem window e document (testes, SSR) não quebra', () => {
    expect(() => aoVoltar(() => {}, { janela: null, documento: null })()).not.toThrow();
  });
});
