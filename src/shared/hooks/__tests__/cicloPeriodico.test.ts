import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CicloPeriodico, atrasoBackoff, conexaoPorFalhas, type Conexao } from '../cicloPeriodico';
import { ErroServico, SemConexao, TurmaNaoEncontrada } from '../../services/erros';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('atrasoBackoff / conexaoPorFalhas', () => {
  it('1 → 2 → 4 → 8 → 15 s e fica em 15 s', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(atrasoBackoff)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });
  it('online → reconectando → offline (a partir de 5 falhas)', () => {
    expect([0, 1, 4, 5, 9].map(conexaoPorFalhas)).toEqual(['online', 'reconectando', 'reconectando', 'offline', 'offline']);
  });
});

function montar(executar: () => Promise<boolean | void>, intervaloMs = 1000) {
  const conexoes: Conexao[] = [];
  const ciclo = new CicloPeriodico({ intervaloMs, executar, aoMudarConexao: (c) => conexoes.push(c) });
  return { ciclo, conexoes };
}

describe('CicloPeriodico', () => {
  it('consulta já ao iniciar e depois a cada intervalo', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(executar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(executar).toHaveBeenCalledTimes(4);
    ciclo.parar();
  });

  it('falha de rede: backoff 1→2→4→8→15 s, reconectando → offline, e volta a online no primeiro sucesso', async () => {
    let rede = false;
    const executar = vi.fn(async () => {
      if (!rede) throw new SemConexao();
    });
    const { ciclo, conexoes } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(0); // t=0: falha 1
    expect(ciclo.conexao).toBe('reconectando');

    const chamadasEm = async (ms: number) => {
      const antes = executar.mock.calls.length;
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(executar.mock.calls.length).toBe(antes); // ainda não
      await vi.advanceTimersByTimeAsync(1);
      expect(executar.mock.calls.length).toBe(antes + 1);
    };
    await chamadasEm(1000); // falha 2
    await chamadasEm(2000); // falha 3
    await chamadasEm(4000); // falha 4
    expect(ciclo.conexao).toBe('reconectando');
    await chamadasEm(8000); // falha 5
    expect(ciclo.conexao).toBe('offline');
    await chamadasEm(15000); // falha 6
    await chamadasEm(15000); // falha 7: teto de 15 s

    rede = true;
    await chamadasEm(15000); // sucesso
    expect(ciclo.conexao).toBe('online');
    await chamadasEm(1000); // volta ao intervalo normal
    expect(conexoes).toEqual(['reconectando', 'offline', 'online']);
    ciclo.parar();
  });

  it('nunca dispara nova consulta enquanto a anterior não voltou', async () => {
    let soltar: () => void = () => {};
    const executar = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          soltar = resolve;
        }),
    );
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(60_000);
    ciclo.tentarAgora(); // também respeita a não sobreposição
    expect(executar).toHaveBeenCalledTimes(1);

    // A resposta demorou mais que o intervalo: a próxima sai logo que ela volta, e depois no ritmo normal.
    soltar();
    await vi.advanceTimersByTimeAsync(0);
    expect(executar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(executar).toHaveBeenCalledTimes(2); // a segunda também está presa
    ciclo.parar();
  });

  it('desconta o tempo da requisição para manter a cadência', async () => {
    const executar = vi.fn(() => new Promise<void>((r) => setTimeout(r, 400)));
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(999);
    expect(executar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(executar).toHaveBeenCalledTimes(2);
    ciclo.parar();
  });

  it('erro de negócio: conexão online e intervalo normal', async () => {
    const executar = vi.fn().mockRejectedValue(new TurmaNaoEncontrada());
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(3000);
    expect(ciclo.conexao).toBe('online');
    expect(executar).toHaveBeenCalledTimes(4);
    ciclo.parar();
  });

  it('erro do servidor: recua sem mudar a conexão', async () => {
    const executar = vi.fn().mockRejectedValue(new ErroServico());
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    expect(executar).toHaveBeenCalledTimes(4);
    expect(ciclo.conexao).toBe('online');
    ciclo.parar();
  });

  it('para ao parar(): nenhuma consulta depois, e a resposta em voo é ignorada', async () => {
    let soltar: () => void = () => {};
    const aoMudarConexao = vi.fn();
    const executar = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          soltar = () => reject(new SemConexao());
        }),
    );
    const ciclo = new CicloPeriodico({ intervaloMs: 1000, executar, aoMudarConexao });
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    ciclo.parar();
    soltar();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(executar).toHaveBeenCalledTimes(1);
    expect(aoMudarConexao).not.toHaveBeenCalled();
  });

  it('reinicia depois de parar (StrictMode monta, desmonta e monta de novo)', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    ciclo.parar();
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(1000);
    expect(executar.mock.calls.length).toBeGreaterThanOrEqual(2);
    ciclo.parar();
  });

  it('tentarAgora antecipa a próxima tentativa durante o backoff', async () => {
    const executar = vi.fn().mockRejectedValueOnce(new SemConexao()).mockRejectedValueOnce(new SemConexao()).mockResolvedValue(undefined);
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(1000); // falha 1, falha 2 → espera 2 s
    expect(executar).toHaveBeenCalledTimes(2);
    ciclo.tentarAgora();
    await vi.advanceTimersByTimeAsync(0);
    expect(executar).toHaveBeenCalledTimes(3);
    expect(ciclo.conexao).toBe('online');
    ciclo.parar();
  });

  it('rodada sem nada a fazer (false) não muda a conexão', async () => {
    const executar = vi.fn().mockRejectedValueOnce(new SemConexao()).mockResolvedValue(false);
    const { ciclo } = montar(executar);
    ciclo.iniciar();
    await vi.advanceTimersByTimeAsync(1000);
    expect(executar).toHaveBeenCalledTimes(2);
    expect(ciclo.conexao).toBe('reconectando');
    ciclo.parar();
  });
});
