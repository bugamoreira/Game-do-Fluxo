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
    entradaLiberada: false,
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
