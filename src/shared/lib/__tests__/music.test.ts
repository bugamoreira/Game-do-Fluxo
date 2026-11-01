import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tone mockado: qualquer classe vira um objeto "faz-tudo" (métodos encadeáveis,
// parâmetros com rampTo). O que interessa aqui é o estado interno do módulo.
const tone = vi.hoisted(() => {
  const rampas: { valor: unknown }[] = [];
  function coringa(): unknown {
    const cache = new Map<PropertyKey, unknown>();
    const alvo = function () { /* noop */ };
    const proxy: unknown = new Proxy(alvo, {
      get(_t, prop) {
        if (prop === 'then') return undefined;
        if (prop === 'rampTo') return (valor: unknown) => { rampas.push({ valor }); return proxy; };
        if (prop === 'toSeconds') return () => 0.1;
        if (!cache.has(prop)) cache.set(prop, coringa());
        return cache.get(prop);
      },
      apply: () => proxy,
      construct: () => coringa() as object,
    });
    return proxy;
  }
  const transporte = {
    estado: 'stopped' as 'started' | 'stopped' | 'paused',
    get state() { return transporte.estado; },
    bpm: { rampTo: vi.fn() },
    start: vi.fn(() => { transporte.estado = 'started'; }),
    pause: vi.fn(() => { transporte.estado = 'paused'; }),
  };
  return { coringa, transporte, rampas, start: vi.fn(async () => {}) };
});

vi.mock('tone', () => {
  const c = tone.coringa;
  return {
    start: tone.start,
    now: () => 0,
    getTransport: () => tone.transporte,
    Time: c(),
    Gain: c(),
    Limiter: c(),
    Reverb: c(),
    Filter: c(),
    PolySynth: c(),
    Synth: c(),
    MonoSynth: c(),
    NoiseSynth: c(),
    MembraneSynth: c(),
    FMSynth: c(),
    Loop: c(),
  };
});

import {
  LIMIAR_CRISE,
  SimsMusic,
  __estadoMusica,
  __reiniciarMusica,
  andamento,
  escolherModo,
  musica,
  planoDeCamadas,
  tensaoDoPlacar,
} from '../music';

beforeEach(() => {
  __reiniciarMusica();
  tone.start.mockClear();
  tone.transporte.start.mockClear();
  tone.transporte.estado = 'stopped';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('regras da trilha', () => {
  it('rodada 1 escolhe Travado, tenso ou crise pela tensão', () => {
    expect(escolherModo({ rodada: 1, tensao: 0.2, rodando: true })).toBe('travado');
    expect(escolherModo({ rodada: 1, tensao: 0.6, rodando: true })).toBe('tenso');
    expect(escolherModo({ rodada: 1, tensao: LIMIAR_CRISE, rodando: true })).toBe('crise');
  });

  it('crise tem histerese: não sai por uma oscilação pequena', () => {
    expect(escolherModo({ rodada: 1, tensao: 0.8, rodando: true }, 'crise')).toBe('crise');
    expect(escolherModo({ rodada: 1, tensao: 0.8, rodando: true }, 'tenso')).toBe('tenso');
    expect(escolherModo({ rodada: 1, tensao: 0.6, rodando: true }, 'crise')).toBe('tenso');
  });

  it('rodada 2 é sempre Lean, sem modo crise', () => {
    expect(escolherModo({ rodada: 2, tensao: 1, rodando: true })).toBe('lean');
    expect(escolherModo({ rodada: 2, tensao: 0, rodando: true })).toBe('lean');
  });

  it('sem rodada em andamento, silêncio', () => {
    expect(escolherModo({ rodada: 1, tensao: 1, rodando: false })).toBe('silencio');
  });

  it('Travado acelera com a tensão; Lean mantém o andamento', () => {
    expect(andamento({ rodada: 1, tensao: 0.1, rodando: true })).toBeLessThan(andamento({ rodada: 1, tensao: 0.7, rodando: true }));
    expect(andamento({ rodada: 1, tensao: 0.95, rodando: true })).toBeGreaterThan(andamento({ rodada: 1, tensao: 0.8, rodando: true }));
    expect(andamento({ rodada: 2, tensao: 0, rodando: true })).toBe(andamento({ rodada: 2, tensao: 1, rodando: true }));
  });

  it('Travado ganha camadas com a tensão; Lean ganha camadas com o fluxo (tensão baixa)', () => {
    const soma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    const tCalmo = planoDeCamadas({ rodada: 1, tensao: 0.1, rodando: true });
    const tTenso = planoDeCamadas({ rodada: 1, tensao: 0.7, rodando: true });
    expect(soma(tTenso.travado)).toBeGreaterThan(soma(tCalmo.travado));
    expect(tCalmo.travado.crise).toBe(0);
    expect(planoDeCamadas({ rodada: 1, tensao: 0.9, rodando: true }).travado.crise).toBe(1);

    const lBom = planoDeCamadas({ rodada: 2, tensao: 0.05, rodando: true });
    const lRuim = planoDeCamadas({ rodada: 2, tensao: 0.9, rodando: true });
    expect(soma(lBom.lean)).toBeGreaterThan(soma(lRuim.lean));
    expect(lRuim.lean.pulso).toBe(1); // o pulso nunca some
    expect(soma(lBom.travado)).toBe(0);
  });

  it('tensão do placar: óbito pesa na R1 e pouco na R2', () => {
    expect(tensaoDoPlacar({}, 1)).toBe(0);
    const base = { boarding: 6, deOcc: 14 };
    expect(tensaoDoPlacar({ ...base, dth: 1 }, 1)).toBeGreaterThan(tensaoDoPlacar({ ...base, dth: 1 }, 2));
    expect(tensaoDoPlacar({ boarding: 99, deOcc: 99, corredor: 99, dth: 9 }, 1)).toBe(1);
  });
});

describe('musica', () => {
  it('iniciar é idempotente e aguarda Tone.start()', async () => {
    const a = musica.iniciar();
    const b = musica.iniciar();
    await Promise.all([a, b]);
    await musica.iniciar();
    expect(tone.start).toHaveBeenCalledTimes(1);
    expect(__estadoMusica().iniciado).toBe(true);
  });

  it('se o navegador recusar, permite tentar de novo', async () => {
    tone.start.mockRejectedValueOnce(new Error('sem gesto'));
    await expect(musica.iniciar()).rejects.toThrow();
    expect(__estadoMusica().iniciado).toBe(false);
    await musica.iniciar();
    expect(__estadoMusica().iniciado).toBe(true);
    expect(tone.start).toHaveBeenCalledTimes(2);
  });

  it('o estado enviado antes do clique é aplicado quando o áudio liga', async () => {
    musica.atualizar({ rodada: 1, tensao: 0.95, rodando: true });
    expect(__estadoMusica().modo).toBe('crise');
    expect(tone.transporte.start).not.toHaveBeenCalled();
    await musica.iniciar();
    expect(tone.transporte.start).toHaveBeenCalled();
    expect(__estadoMusica().modo).toBe('crise');
  });

  it('troca de modo conforme rodada e tensão', async () => {
    await musica.iniciar();
    musica.atualizar({ rodada: 1, tensao: 0.3, rodando: true });
    expect(__estadoMusica().modo).toBe('travado');
    musica.atualizar({ rodada: 1, tensao: 0.9, rodando: true });
    expect(__estadoMusica().modo).toBe('crise');
    musica.atualizar({ rodada: 2, tensao: 0.9, rodando: true });
    expect(__estadoMusica().modo).toBe('lean');
    musica.atualizar({ rodada: 2, tensao: 0.9, rodando: false });
    expect(__estadoMusica().modo).toBe('silencio');
  });

  it('pausa o transporte só depois do fade', async () => {
    vi.useFakeTimers();
    await musica.iniciar();
    musica.atualizar({ rodada: 1, tensao: 0.3, rodando: true });
    expect(tone.transporte.estado).toBe('started');
    musica.atualizar({ rodada: 1, tensao: 0.3, rodando: false });
    expect(tone.transporte.estado).toBe('started');
    vi.advanceTimersByTime(5000);
    expect(tone.transporte.estado).toBe('paused');
  });

  it('tensão fora da faixa é limitada a 0..1', () => {
    musica.atualizar({ rodada: 1, tensao: 7, rodando: true });
    expect(__estadoMusica().config.tensao).toBe(1);
    musica.atualizar({ rodada: 1, tensao: Number.NaN, rodando: true });
    expect(__estadoMusica().config.tensao).toBe(0);
  });

  it('mudo vale antes e depois de iniciar', async () => {
    expect(musica.estaMudo()).toBe(false);
    musica.definirMudo(true);
    expect(musica.estaMudo()).toBe(true);
    await musica.iniciar();
    expect(musica.estaMudo()).toBe(true);
    musica.definirMudo(false);
    expect(musica.estaMudo()).toBe(false);
  });

  it('efeitos antes de iniciar ou no mudo não quebram', async () => {
    expect(() => musica.efeito('death')).not.toThrow();
    await musica.iniciar();
    musica.definirMudo(true);
    expect(() => musica.efeito('fluxista')).not.toThrow();
    musica.definirMudo(false);
    for (const som of ['death', 'det', 'disc', 'cascade', 'fluxista', 'nir', 'alta'] as const) {
      expect(() => musica.efeito(som)).not.toThrow();
    }
  });
});

describe('SimsMusic (adaptador antigo)', () => {
  it('update converte o placar e toggleMute alterna o mudo', () => {
    SimsMusic.update({ deOcc: 14, boarding: 6, deaths: 1, isR2: false, run: true });
    expect(__estadoMusica().config.rodada).toBe(1);
    expect(__estadoMusica().modo).toBe('crise');
    SimsMusic.update({ deOcc: 14, boarding: 6, deaths: 1, isR2: true, run: true });
    expect(__estadoMusica().modo).toBe('lean');
    expect(SimsMusic.toggleMute()).toBe(true);
    expect(SimsMusic.isMuted()).toBe(true);
    expect(SimsMusic.toggleMute()).toBe(false);
  });
});
