import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControladorRanking, ControladorSincronizacao, type DependenciasSync } from '../controladores';
import { ErroServico, RodadaInvalida, SemConexao, TokenInvalido, VersaoAntiga } from '../../services/erros';
import type { EstadoBaseSync, EstadoSimulacaoTransporte } from '../../schemas';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
const est = (versao: number, rodada: 1 | 2 = 1): EstadoSimulacaoTransporte => ({ versao, rodada, minuto: 420 + versao });
const resumir = (e: EstadoBaseSync) => ({ pontuacao: e.versao * 10, metricas: { dth: 0 } });

function montar(over: Partial<DependenciasSync> = {}) {
  const deps = {
    enviarEstado: vi.fn<DependenciasSync['enviarEstado']>().mockResolvedValue(undefined),
    registrarSerie: vi.fn<DependenciasSync['registrarSerie']>().mockResolvedValue(undefined),
    registrarEventos: vi.fn<DependenciasSync['registrarEventos']>().mockResolvedValue(undefined),
    salvarCopia: vi.fn<DependenciasSync['salvarCopia']>(),
    ...over,
  };
  const c = new ControladorSincronizacao(TOKEN, deps);
  c.definirResumir(resumir);
  return { c, deps };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ControladorSincronizacao', () => {
  it('guarda cópia local a cada mudança e envia só a versão mais recente a cada 2 s', async () => {
    const { c, deps } = montar();
    c.iniciar();
    c.definirEstado(est(1));
    c.definirEstado(est(2));
    expect(deps.salvarCopia).toHaveBeenCalledTimes(2);
    expect(deps.salvarCopia).toHaveBeenLastCalledWith(TOKEN, est(2));

    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.enviarEstado).toHaveBeenCalledTimes(1);
    expect(deps.enviarEstado).toHaveBeenLastCalledWith(TOKEN, est(2), { pontuacao: 20, metricas: { dth: 0 } });
    expect(c.instantaneo().ultimaSincronizacao).toBeInstanceOf(Date);

    // Sem versão nova, não reenvia.
    await vi.advanceTimersByTimeAsync(6000);
    expect(deps.enviarEstado).toHaveBeenCalledTimes(1);

    c.definirEstado(est(3));
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.enviarEstado).toHaveBeenCalledTimes(2);
    c.parar();
  });

  it('rodada nova envia mesmo com versão menor', async () => {
    const { c, deps } = montar();
    c.iniciar();
    c.definirEstado(est(50, 1));
    await vi.advanceTimersByTimeAsync(2000);
    c.definirEstado(est(0, 2));
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.enviarEstado).toHaveBeenLastCalledWith(TOKEN, est(0, 2), expect.anything());
    c.parar();
  });

  it('sem rede: backoff, offline, nunca expulsa; ao voltar envia o estado mais recente', async () => {
    let rede = false;
    const enviarEstado = vi.fn(async () => {
      if (!rede) throw new SemConexao();
    });
    const { c, deps } = montar({ enviarEstado });
    c.iniciar();
    c.definirEstado(est(1));
    await vi.advanceTimersByTimeAsync(2000); // falha 1
    expect(c.instantaneo().conexao).toBe('reconectando');
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000); // falhas 2..5
    expect(enviarEstado).toHaveBeenCalledTimes(5);
    expect(c.instantaneo().conexao).toBe('offline');

    // O jogo segue: cópia local continua sendo salva.
    c.definirEstado(est(9));
    expect(deps.salvarCopia).toHaveBeenLastCalledWith(TOKEN, est(9));

    rede = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(c.instantaneo().conexao).toBe('online');
    expect(enviarEstado).toHaveBeenLastCalledWith(TOKEN, est(9), expect.anything());
    expect(c.instantaneo().erro).toBeNull();
    c.parar();
  });

  it('não sobrepõe envios quando o servidor demora', async () => {
    let soltar: () => void = () => {};
    const enviarEstado = vi.fn(() => new Promise<void>((r) => (soltar = r)));
    const { c } = montar({ enviarEstado });
    c.iniciar();
    c.definirEstado(est(1));
    await vi.advanceTimersByTimeAsync(2000);
    c.definirEstado(est(2));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(enviarEstado).toHaveBeenCalledTimes(1);
    soltar();
    await vi.advanceTimersByTimeAsync(2000);
    expect(enviarEstado).toHaveBeenCalledTimes(2);
    c.parar();
  });

  it('versão antiga: não insiste na mesma versão', async () => {
    const enviarEstado = vi.fn().mockRejectedValueOnce(new VersaoAntiga()).mockResolvedValue(undefined);
    const { c } = montar({ enviarEstado });
    c.iniciar();
    c.definirEstado(est(4));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(enviarEstado).toHaveBeenCalledTimes(1);
    expect(c.instantaneo().erro).toBeInstanceOf(VersaoAntiga);
    expect(c.instantaneo().conexao).toBe('online');
    c.parar();
  });

  it('rodada encerrada (RODADA_INVALIDA): não insiste na mesma versão', async () => {
    const enviarEstado = vi.fn().mockRejectedValue(new RodadaInvalida());
    const { c } = montar({ enviarEstado });
    c.iniciar();
    c.definirEstado(est(720));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(enviarEstado).toHaveBeenCalledTimes(1);
    expect(c.instantaneo().conexao).toBe('online');
    c.parar();
  });

  it('token inválido: expõe o erro e continua tentando, sem limpar nada', async () => {
    const enviarEstado = vi.fn().mockRejectedValue(new TokenInvalido());
    const { c, deps } = montar({ enviarEstado });
    c.iniciar();
    c.definirEstado(est(1));
    await vi.advanceTimersByTimeAsync(6000);
    expect(enviarEstado.mock.calls.length).toBeGreaterThan(1);
    expect(c.instantaneo().erro).toBeInstanceOf(TokenInvalido);
    expect(deps.salvarCopia).toHaveBeenCalledTimes(1);
    c.parar();
  });

  it('erro de negócio persistente no envio do estado não trava a fila de série e eventos', async () => {
    const enviarEstado = vi.fn().mockRejectedValue(new ErroServico('Envios muito próximos.', undefined, 'LIMITE_EXCEDIDO'));
    const { c, deps } = montar({ enviarEstado });
    c.iniciar();
    c.definirEstado(est(1));
    c.registrarSerie(1, 450, { dth: 0 });
    c.registrarEventos(1, [{ minuto: 451, tipo: 'surto' }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.registrarSerie).toHaveBeenCalledTimes(1);
    expect(deps.registrarEventos).toHaveBeenCalledTimes(1);
    expect(c.instantaneo().pendentes).toBe(0);
    expect(c.instantaneo().erro).toBeInstanceOf(ErroServico);
    c.parar();
  });

  it('sem rede no envio do estado, a fila espera (não adianta tentar)', async () => {
    const enviarEstado = vi.fn().mockRejectedValue(new SemConexao());
    const { c, deps } = montar({ enviarEstado });
    c.iniciar();
    c.definirEstado(est(1));
    c.registrarSerie(1, 450, { dth: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.registrarSerie).not.toHaveBeenCalled();
    expect(c.instantaneo().pendentes).toBe(1);
    c.parar();
  });

  it('fila de série e eventos sobrevive à queda de rede e sai em ordem', async () => {
    let rede = false;
    const registrarSerie = vi.fn(async () => {
      if (!rede) throw new SemConexao();
    });
    const { c, deps } = montar({ registrarSerie });
    c.iniciar();
    c.registrarSerie(1, 450, { dth: 0 });
    c.registrarEventos(1, [{ minuto: 451, tipo: 'obito', mensagem: 'Óbito no corredor' }]);
    c.registrarEventos(1, []); // ignorado
    expect(c.instantaneo().pendentes).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.instantaneo().pendentes).toBe(2);

    rede = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.instantaneo().pendentes).toBe(0);
    expect(deps.registrarEventos).toHaveBeenCalledTimes(1);
    c.parar();
  });

  it('registro recusado pelo servidor sai da fila (não trava as próximas)', async () => {
    const registrarSerie = vi.fn().mockRejectedValueOnce(new ErroServico()).mockResolvedValue(undefined);
    const { c } = montar({ registrarSerie });
    c.iniciar();
    c.registrarSerie(1, 450, {});
    c.registrarSerie(1, 480, {});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.instantaneo().pendentes).toBe(0);
    expect(registrarSerie).toHaveBeenCalledTimes(2);
    c.parar();
  });

  it('para ao parar()', async () => {
    const { c, deps } = montar();
    c.iniciar();
    c.definirEstado(est(1));
    c.parar();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(deps.enviarEstado).not.toHaveBeenCalled();
  });
});

describe('ControladorRanking', () => {
  it('mantém o último ranking sem rede e volta a online', async () => {
    const item = { grupoId: 'g1', nome: 'Azul', cor: '#1d4ed8', rodada: 1 as const, pontuacao: 10, metricas: {}, minuto: 500 };
    const buscar = vi.fn().mockResolvedValueOnce([item]).mockRejectedValueOnce(new SemConexao()).mockResolvedValue([]);
    const c = new ControladorRanking('CBMEDE', 1000, buscar);
    c.iniciar();
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.instantaneo().itens).toEqual([item]);
    expect(c.instantaneo().conexao).toBe('reconectando');
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.instantaneo().itens).toEqual([]);
    expect(c.instantaneo().conexao).toBe('online');
    c.parar();
  });
});
