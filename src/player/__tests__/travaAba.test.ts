import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESPERA_MS, TravaAba, type CanalAbas } from '../jogo/travaAba';

/** Barramento falso: entrega cada mensagem às outras abas, de forma assíncrona como o navegador. */
function barramento() {
  const canais = new Set<CanalAbas>();
  return () => {
    const canal: CanalAbas = {
      onmessage: null,
      postMessage(m) {
        for (const c of canais) if (c !== canal) queueMicrotask(() => c.onmessage?.({ data: m }));
      },
      close() {
        canais.delete(canal);
      },
    };
    canais.add(canal);
    return canal;
  };
}

describe('TravaAba (duas abas do mesmo grupo)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a primeira aba fica com o grupo; a segunda vê que ele já está aberto em outra aba', async () => {
    const abrir = barramento();
    const a = new TravaAba('g1', 'a', abrir);
    a.iniciar();
    await vi.advanceTimersByTimeAsync(ESPERA_MS + 1);
    expect(a.situacao).toBe('dona');
    const b = new TravaAba('g1', 'b', abrir);
    b.iniciar();
    await vi.advanceTimersByTimeAsync(ESPERA_MS + 1);
    expect(b.situacao).toBe('outra');
    expect(a.situacao).toBe('dona');
  });

  it('assumir aqui passa o jogo para esta aba e a outra para', async () => {
    const abrir = barramento();
    const a = new TravaAba('g1', 'a', abrir);
    a.iniciar();
    await vi.advanceTimersByTimeAsync(ESPERA_MS + 1);
    const b = new TravaAba('g1', 'b', abrir);
    b.iniciar();
    await vi.advanceTimersByTimeAsync(ESPERA_MS + 1);
    const mudancasA: string[] = [];
    a.assinar(s => mudancasA.push(s));
    b.assumir();
    await vi.advanceTimersByTimeAsync(1);
    expect(b.situacao).toBe('dona');
    expect(a.situacao).toBe('outra');
    expect(mudancasA).toEqual(['outra']);
  });

  it('grupos diferentes não se travam', async () => {
    const abrir = barramento();
    const a = new TravaAba('g1', 'a', abrir);
    const b = new TravaAba('g2', 'b', abrir);
    a.iniciar();
    b.iniciar();
    await vi.advanceTimersByTimeAsync(ESPERA_MS + 1);
    expect([a.situacao, b.situacao]).toEqual(['dona', 'dona']);
  });

  it('duas abas abertas ao mesmo tempo: só uma fica com o grupo', async () => {
    const abrir = barramento();
    const a = new TravaAba('g1', 'a', abrir);
    const b = new TravaAba('g1', 'b', abrir);
    a.iniciar();
    b.iniciar();
    await vi.advanceTimersByTimeAsync(ESPERA_MS + 1);
    expect([a.situacao, b.situacao].sort()).toEqual(['dona', 'outra']);
  });

  it('sem BroadcastChannel, a aba roda o jogo como antes', () => {
    const a = new TravaAba('g1', 'a', () => null);
    a.iniciar();
    expect(a.situacao).toBe('dona');
  });
});
