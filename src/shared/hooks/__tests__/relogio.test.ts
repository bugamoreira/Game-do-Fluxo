import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelogioServidor, calcularMinutoServidor } from '../relogio';
import { ControladorEstadoTurma } from '../controladores';
import { SemConexao } from '../../services/erros';
import type { EstadoTurma } from '../../schemas';

const INICIO = Date.parse('2026-11-01T12:00:00.000Z');

describe('calcularMinutoServidor', () => {
  it('420 + segundos desde o início da rodada', () => {
    expect(calcularMinutoServidor({ rodadaInicioMs: INICIO, pausaAcumuladaMs: 0, agoraServidorMs: INICIO })).toBe(420);
    expect(calcularMinutoServidor({ rodadaInicioMs: INICIO, pausaAcumuladaMs: 0, agoraServidorMs: INICIO + 59_999 })).toBe(479);
  });

  it('desconta a pausa acumulada', () => {
    expect(
      calcularMinutoServidor({ rodadaInicioMs: INICIO, pausaAcumuladaMs: 120_000, agoraServidorMs: INICIO + 180_000 }),
    ).toBe(480);
  });

  it('pausa em curso congela no início da pausa', () => {
    const p = { rodadaInicioMs: INICIO, pausaAcumuladaMs: 0, pausadaEmMs: INICIO + 100_000 };
    expect(calcularMinutoServidor({ ...p, agoraServidorMs: INICIO + 100_000 })).toBe(520);
    expect(calcularMinutoServidor({ ...p, agoraServidorMs: INICIO + 900_000 })).toBe(520);
  });

  it('limitado a 420..1140', () => {
    expect(calcularMinutoServidor({ rodadaInicioMs: INICIO, pausaAcumuladaMs: 0, agoraServidorMs: INICIO - 5000 })).toBe(420);
    expect(calcularMinutoServidor({ rodadaInicioMs: INICIO, pausaAcumuladaMs: 0, agoraServidorMs: INICIO + 3_600_000 })).toBe(1140);
  });
});

describe('RelogioServidor', () => {
  it('desvio = hora do servidor − hora local na resposta', () => {
    const r = new RelogioServidor();
    expect(r.agora(0)).toBeNull();
    r.registrar(new Date(INICIO).toISOString(), INICIO + 3_600_000); // local 1 h adiantado
    expect(r.desvioMs).toBe(-3_600_000);
    expect(r.agora(INICIO + 3_605_000)).toBe(INICIO + 5000);
  });

  it('desconta metade do tempo de ida e volta da consulta', () => {
    const r = new RelogioServidor();
    // Enviada em local 0, respondida em local 800: o servidor leu a hora no meio (400).
    r.registrar(new Date(INICIO).toISOString(), 800, 0);
    expect(r.desvioMs).toBe(INICIO - 400);
  });

  it('prefere a medição recente com menor ida e volta', () => {
    const r = new RelogioServidor();
    r.registrar(new Date(INICIO + 1000).toISOString(), 1100, 900); // RTT 200: desvio INICIO
    r.registrar(new Date(INICIO + 5000).toISOString(), 7000, 3000); // RTT 4000: desvio INICIO
    expect(r.desvioMs).toBe(INICIO);
    // Uma resposta lenta e assimétrica não desloca o relógio.
    r.registrar(new Date(INICIO + 9000).toISOString(), 11_000, 8000); // RTT 3000, estimativa INICIO - 500
    expect(r.desvioMs).toBe(INICIO);
  });
});

// ── Controlador: relógio corrigido, pausa e queda de rede ──────

function turmaBase(extra: Partial<EstadoTurma> = {}): Omit<EstadoTurma, 'horaServidor'> {
  return {
    id: 't1',
    codigo: 'CBMEDE',
    nome: 'CBMEDE 2026',
    status: 'rodada1',
    rodada: 1,
    rodadaInicio: new Date(INICIO).toISOString(),
    pausada: false,
    pausadaEm: null,
    pausaAcumuladaMs: 0,
    fullCapacityLiberado: false,
    musicaMudo: false,
    grupos: [],
    ...extra,
  };
}

describe.each([
  ['adiantado 1 h', 3_600_000],
  ['atrasado 7 min', -420_000],
  ['certo', 0],
])('ControladorEstadoTurma com relógio local %s', (_, desvioLocalMs) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INICIO + 30_000 + desvioLocalMs); // servidor está 30 s após o início
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('minuto do plantão segue o servidor, anda sem rede e congela na pausa', async () => {
    const horaServidor = () => Date.now() - desvioLocalMs;
    let turma = turmaBase();
    let rede = true;
    const buscar = vi.fn(async (): Promise<EstadoTurma> => {
      if (!rede) throw new SemConexao();
      return { ...turma, horaServidor: new Date(horaServidor()).toISOString() };
    });
    const c = new ControladorEstadoTurma('CBMEDE', 1000, { buscar });
    c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.instantaneo().minutoServidor).toBe(450);
    expect(c.instantaneo().conexao).toBe('online');

    await vi.advanceTimersByTimeAsync(10_000); // servidor em +40 s
    expect(c.instantaneo().minutoServidor).toBe(460);

    // Rede cai: o relógio continua andando com o último desvio, e a turma é mantida.
    rede = false;
    await vi.advanceTimersByTimeAsync(5_000); // +45 s
    expect(c.instantaneo().minutoServidor).toBe(465);
    expect(c.instantaneo().turma?.codigo).toBe('CBMEDE');
    expect(c.instantaneo().conexao).not.toBe('online');

    // Volta a rede com a turma pausada em +45 s: congela.
    rede = true;
    turma = turmaBase({ pausada: true, pausadaEm: new Date(INICIO + 45_000).toISOString() });
    c.tentarAgora();
    await vi.advanceTimersByTimeAsync(20_000); // +65 s
    expect(c.instantaneo().minutoServidor).toBe(465);
    expect(c.instantaneo().conexao).toBe('online');

    // Retoma: 20 s de pausa acumulada; em +75 s de relógio, 55 s de plantão.
    turma = turmaBase({ pausaAcumuladaMs: 20_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.instantaneo().minutoServidor).toBe(475);

    c.parar();
  });
});

describe('ControladorEstadoTurma: pausa não deixa ninguém à frente (ensaio E2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INICIO + 30_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('teto do motor = última leitura + no máximo 1 s; relógio exibido não volta', async () => {
    let turma = turmaBase();
    let segurar = false;
    let liberar: (() => void) | null = null;
    const buscar = vi.fn(async (): Promise<EstadoTurma> => {
      const resposta = { ...turma, horaServidor: new Date(Date.now()).toISOString() };
      if (segurar) await new Promise<void>((r) => { liberar = r; });
      return resposta;
    });
    const c = new ControladorEstadoTurma('CBMEDE', 1000, { buscar });
    c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.instantaneo().minutoServidor).toBe(450);
    expect(c.instantaneo().minutoTeto).toBe(450);

    await vi.advanceTimersByTimeAsync(900);
    // Extrapolado: ainda 450 (0,9 s). Teto = leitura (+30 s) + 0,9 s = 450.
    expect(c.instantaneo().minutoTeto).toBe(450);

    // O facilitador pausa em +31,5 s; a próxima consulta demora (servidor lento).
    await vi.advanceTimersByTimeAsync(100); // +31 s: leitura ainda sem pausa
    turma = turmaBase({ pausada: true, pausadaEm: new Date(INICIO + 31_500).toISOString() });
    segurar = true; // a consulta de +32 s lê a pausa e fica presa
    await vi.advanceTimersByTimeAsync(1000); // +32 s, leitura presa
    await vi.advanceTimersByTimeAsync(3000); // +35 s
    // O relógio exibido extrapolou até 455, mas o teto do motor parou em +31 s + 1 s.
    expect(c.instantaneo().minutoServidor).toBeGreaterThan(452);
    expect(c.instantaneo().minutoTeto).toBeLessThanOrEqual(452);

    // A resposta chega: servidor diz pausado em 451. O motor nunca passou de 452
    // (no máximo 1 tique à frente) e o relógio exibido segura, sem voltar.
    const exibidoAntes = c.instantaneo().minutoServidor!;
    segurar = false;
    (liberar as (() => void) | null)?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.instantaneo().minutoServidor).toBe(exibidoAntes);
    expect(c.instantaneo().minutoTeto).toBe(451);

    // Retoma com 5 s de pausa acumulada: o relógio exibido só volta a andar quando alcança.
    turma = turmaBase({ pausaAcumuladaMs: 5_000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.instantaneo().minutoServidor).toBe(exibidoAntes);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.instantaneo().minutoServidor).toBeGreaterThan(exibidoAntes);
    c.parar();
  });

  it('sem rede (consulta falhou), o teto sai e o motor segue o relógio extrapolado', async () => {
    let rede = true;
    const buscar = vi.fn(async (): Promise<EstadoTurma> => {
      if (!rede) throw new SemConexao();
      return { ...turmaBase(), horaServidor: new Date(Date.now()).toISOString() };
    });
    const c = new ControladorEstadoTurma('CBMEDE', 1000, { buscar });
    c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.instantaneo().minutoTeto).toBe(450);
    rede = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.instantaneo().conexao).not.toBe('online');
    expect(c.instantaneo().minutoTeto).toBeNull();
    expect(c.instantaneo().minutoServidor).toBe(460);
    rede = true;
    c.tentarAgora();
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.instantaneo().minutoTeto).not.toBeNull();
    c.parar();
  });

  it('nova rodada zera o relógio monotônico', async () => {
    let turma = turmaBase({ rodadaInicio: new Date(INICIO - 600_000).toISOString() });
    const buscar = vi.fn(async (): Promise<EstadoTurma> => ({ ...turma, horaServidor: new Date(Date.now()).toISOString() }));
    const c = new ControladorEstadoTurma('CBMEDE', 1000, { buscar });
    c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.instantaneo().minutoServidor).toBe(1050);
    turma = turmaBase({ status: 'rodada2', rodada: 2, rodadaInicio: new Date(Date.now()).toISOString() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.instantaneo().minutoServidor).toBeLessThan(425);
    c.parar();
  });
});

describe('ControladorEstadoTurma fora de rodada', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INICIO);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('minuto é null em debrief e pausada sem pausadaEm congela no último minuto', async () => {
    let turma = turmaBase({ status: 'debrief' });
    const buscar = vi.fn(async (): Promise<EstadoTurma> => ({ ...turma, horaServidor: new Date(Date.now()).toISOString() }));
    const c = new ControladorEstadoTurma('CBMEDE', 1000, { buscar });
    c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.instantaneo().minutoServidor).toBeNull();

    turma = turmaBase();
    await vi.advanceTimersByTimeAsync(5000);
    expect(c.instantaneo().minutoServidor).toBe(425);

    turma = turmaBase({ pausada: true, pausadaEm: undefined });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.instantaneo().minutoServidor).toBe(426); // congelou logo depois da pausa ser vista
    c.parar();
  });

  it('para ao parar(): nenhuma consulta depois de desmontar', async () => {
    const buscar = vi.fn(async (): Promise<EstadoTurma> => ({ ...turmaBase(), horaServidor: new Date().toISOString() }));
    const c = new ControladorEstadoTurma('CBMEDE', 1000, { buscar });
    c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    c.parar();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
