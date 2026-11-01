import { afterEach, describe, expect, it, vi } from 'vitest';
import { initSentry } from '../sentry';

describe('initSentry sem DSN', () => {
  afterEach(() => vi.restoreAllMocks());

  it('não escreve no console.log (em produção fica em silêncio)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    initSentry('teste');
    expect(log).not.toHaveBeenCalled();
    // Em desenvolvimento (o ambiente dos testes), só um aviso informativo.
    expect(info).toHaveBeenCalledTimes(import.meta.env.DEV ? 1 : 0);
  });
});
