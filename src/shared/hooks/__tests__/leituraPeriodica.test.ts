import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NaoAutorizado } from '../../services/erros';
import { LeituraPeriodica } from '../leituraPeriodica';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('LeituraPeriodica', () => {
  it('uma recusa (NaoAutorizado) não trava para sempre: tenta de novo depois da espera', async () => {
    const ler = vi.fn().mockRejectedValueOnce(new NaoAutorizado()).mockResolvedValue(['ok']);
    const aoLer = vi.fn();
    const aoRecusar = vi.fn();
    const l = new LeituraPeriodica({ intervaloMs: 2000, ler, aoLer, aoRecusar, esperaRecusaMs: 10_000 });
    l.iniciar();
    await vi.advanceTimersByTimeAsync(1);
    expect(aoRecusar).toHaveBeenCalledTimes(1);
    expect(l.recusado).toBe(true);
    await vi.advanceTimersByTimeAsync(8000);
    expect(ler).toHaveBeenCalledTimes(1); // suspensa durante a espera
    await vi.advanceTimersByTimeAsync(4000);
    expect(aoLer).toHaveBeenCalledWith(['ok']);
    expect(l.recusado).toBe(false);
    l.parar();
  });

  it('a sessão mudou: reautorizar lê na hora', async () => {
    const ler = vi.fn().mockRejectedValueOnce(new NaoAutorizado()).mockResolvedValue(1);
    const aoLer = vi.fn();
    const l = new LeituraPeriodica({ intervaloMs: 2000, ler, aoLer, esperaRecusaMs: 60_000 });
    l.iniciar();
    await vi.advanceTimersByTimeAsync(2500);
    l.reautorizar();
    await vi.advanceTimersByTimeAsync(1);
    expect(aoLer).toHaveBeenCalledWith(1);
    l.parar();
  });

  it('não sobrepõe leituras: com o servidor lento, a próxima só sai quando a anterior volta', async () => {
    let emVoo = 0;
    let maximo = 0;
    const ler = vi.fn(async () => {
      emVoo++;
      maximo = Math.max(maximo, emVoo);
      await new Promise(r => setTimeout(r, 5000));
      emVoo--;
      return 1;
    });
    const l = new LeituraPeriodica({ intervaloMs: 1000, ler, aoLer: () => {} });
    l.iniciar();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(maximo).toBe(1);
    l.parar();
  });

  it('resposta que chega depois de parar é descartada', async () => {
    let resolver: (v: number) => void = () => {};
    const ler = vi.fn(() => new Promise<number>(r => (resolver = r)));
    const aoLer = vi.fn();
    const l = new LeituraPeriodica({ intervaloMs: 1000, ler, aoLer });
    l.iniciar();
    l.parar();
    resolver(7);
    await vi.advanceTimersByTimeAsync(1);
    expect(aoLer).not.toHaveBeenCalled();
  });
});
