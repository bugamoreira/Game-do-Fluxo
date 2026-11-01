import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ensaio E2: com a CPU apertada o laço do Tone congelava a página e enchia o
// console. Aqui o Tone é um falso controlável: relógio de áudio manual,
// instrumentos que contam (ou recusam) as notas e um Transport observável.
const tone = vi.hoisted(() => {
  const relogio = { agora: 0 };
  const notas: { tempo: number }[] = [];
  const falha = { ativa: false };
  function instrumento() {
    return {
      connect() { return this; },
      dispose() { /* noop */ },
      triggerAttackRelease(...args: unknown[]) {
        if (falha.ativa) throw new TypeError("Cannot read properties of undefined (reading 'time')");
        const tempo = args.find((a, i) => i > 0 && typeof a === 'number' && a > 1) as number | undefined;
        notas.push({ tempo: tempo ?? Number.NaN });
      },
    };
  }
  function param() {
    return { rampTo: vi.fn(), cancelScheduledValues: vi.fn() };
  }
  class No {
    gain = param();
    frequency = param();
    connect() { return this; }
    toDestination() { return this; }
    dispose() { /* noop */ }
  }
  const transporte = {
    estado: 'stopped' as 'started' | 'stopped' | 'paused',
    get state() { return transporte.estado; },
    bpm: { rampTo: vi.fn() },
    start: vi.fn(() => { transporte.estado = 'started'; }),
    pause: vi.fn(() => { transporte.estado = 'paused'; }),
    stop: vi.fn(() => { transporte.estado = 'stopped'; }),
  };
  return { relogio, notas, falha, instrumento, No, transporte, start: vi.fn(async () => {}) };
});

vi.mock('tone', () => {
  const Inst = function () { return tone.instrumento(); } as unknown as new () => object;
  return {
    start: tone.start,
    now: () => tone.relogio.agora,
    getTransport: () => tone.transporte,
    Time: () => ({ toSeconds: () => 0.15 }),
    Gain: tone.No,
    Limiter: tone.No,
    Reverb: tone.No,
    Filter: tone.No,
    PolySynth: Inst,
    Synth: Inst,
    MonoSynth: Inst,
    NoiseSynth: Inst,
    MembraneSynth: Inst,
    FMSynth: Inst,
    // Se o módulo ainda usar o laço do Transport, nada toca neste falso.
    Loop: class { start() { return this; } dispose() { /* noop */ } },
  };
});

import { ESPERA_DISJUNTOR_MS, MAX_NOTAS_PASSO, __estadoMusica, __reiniciarMusica, musica } from '../music';

// Ambiente de teste sem DOM: um `document` mínimo com visibilidade e eventos.
const documentoFalso = Object.assign(new EventTarget(), { visibilityState: 'visible' as 'visible' | 'hidden' });

function definirVisibilidade(v: 'visible' | 'hidden') {
  documentoFalso.visibilityState = v;
  documentoFalso.dispatchEvent(new Event('visibilitychange'));
}

/** Avança relógio de áudio e temporizadores juntos, em passos de 50 ms. */
function tocarPor(segundos: number) {
  const passos = Math.round(segundos / 0.05);
  for (let i = 0; i < passos; i++) {
    tone.relogio.agora += 0.05;
    vi.advanceTimersByTime(50);
  }
}

let aviso: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', documentoFalso);
  documentoFalso.visibilityState = 'visible';
  __reiniciarMusica();
  tone.relogio.agora = 10;
  tone.notas.length = 0;
  tone.falha.ativa = false;
  tone.transporte.estado = 'stopped';
  aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __reiniciarMusica();
  aviso.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function ligar(rodada: 1 | 2 = 1, tensao = 0.95) {
  await musica.iniciar();
  musica.atualizar({ rodada, tensao, rodando: true });
}

describe('sequenciador resistente a CPU apertada', () => {
  it('toca notas com o relógio andando, nunca no passado', async () => {
    await ligar();
    tocarPor(3);
    expect(tone.notas.length).toBeGreaterThan(10);
    // Cada nota foi agendada para agora ou adiante (tolerância de um tique de 50 ms).
    expect(__estadoMusica().sequenciador).toBe(true);
  });

  it('não agenda em rajada após um congelamento: descarta os passos atrasados', async () => {
    await ligar();
    tocarPor(1);
    const antes = tone.notas.length;
    // A página ficou 5 s parada: o relógio de áudio andou, os temporizadores não.
    tone.relogio.agora += 5;
    vi.advanceTimersByTime(50);
    const rajada = tone.notas.length - antes;
    // Sem recuperação: no máximo alguns passos de antecedência, nunca 5 s de música.
    expect(rajada).toBeLessThanOrEqual(4 * MAX_NOTAS_PASSO);
    for (const n of tone.notas.slice(antes)) expect(n.tempo).toBeGreaterThanOrEqual(tone.relogio.agora - 0.2);
  });

  it('limita as vozes por passo', async () => {
    await ligar(1, 1);
    tocarPor(4);
    // Nenhum instante recebe mais que o teto de vozes (acordes contam por nota).
    const porTempo = new Map<number, number>();
    for (const n of tone.notas) porTempo.set(n.tempo, (porTempo.get(n.tempo) ?? 0) + 1);
    expect(Math.max(...porTempo.values())).toBeLessThanOrEqual(MAX_NOTAS_PASSO);
  });

  it('engasgos repetidos abrem o disjuntor e ele religa limpo depois', async () => {
    await ligar();
    tocarPor(0.5);
    for (let i = 0; i < 3; i++) {
      tone.relogio.agora += 2;
      vi.advanceTimersByTime(50);
    }
    expect(__estadoMusica().disjuntor).toEqual({ aberto: true, motivo: 'engasgo' });
    expect(__estadoMusica().sequenciador).toBe(false);
    const parado = tone.notas.length;
    tocarPor(2);
    expect(tone.notas.length).toBe(parado);
    // Depois da espera volta sozinho, sem tocar o que ficou para trás.
    tone.relogio.agora += ESPERA_DISJUNTOR_MS / 1000;
    vi.advanceTimersByTime(ESPERA_DISJUNTOR_MS);
    expect(__estadoMusica().disjuntor.aberto).toBe(false);
    const religou = tone.notas.length;
    tocarPor(1);
    expect(tone.notas.length - religou).toBeGreaterThan(0);
    expect(tone.notas.length - religou).toBeLessThan(80);
  });

  it('erros do áudio são engolidos, registrados uma vez e abrem o disjuntor', async () => {
    await ligar();
    tone.falha.ativa = true;
    expect(() => tocarPor(3)).not.toThrow();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(__estadoMusica().disjuntor).toEqual({ aberto: true, motivo: 'erro' });
    expect(() => musica.efeito('death')).not.toThrow();
    expect(() => musica.atualizar({ rodada: 2, tensao: 0.2, rodando: true })).not.toThrow();
  });

  it('aba oculta pausa sem acumular; ao voltar, retoma do agora', async () => {
    await ligar(2, 0.1);
    tocarPor(1);
    definirVisibilidade('hidden');
    expect(__estadoMusica().disjuntor).toEqual({ aberto: true, motivo: 'oculta' });
    const parado = tone.notas.length;
    // Oculta por 60 s: nada toca e nada fica na fila.
    tone.relogio.agora += 60;
    vi.advanceTimersByTime(60_000);
    expect(tone.notas.length).toBe(parado);
    definirVisibilidade('visible');
    expect(__estadoMusica().disjuntor.aberto).toBe(false);
    tocarPor(0.5);
    const novas = tone.notas.slice(parado);
    expect(novas.length).toBeGreaterThan(0);
    expect(novas.length).toBeLessThan(40);
    for (const n of novas) expect(n.tempo).toBeGreaterThanOrEqual(70 - 0.01);
  });

  it('atualizações iguais a cada consulta não reenviam rampas', async () => {
    await ligar(1, 0.3);
    const contar = () => tone.transporte.bpm.rampTo.mock.calls.length;
    const antes = contar();
    for (let i = 0; i < 20; i++) musica.atualizar({ rodada: 1, tensao: 0.3, rodando: true });
    expect(contar()).toBe(antes);
  });
});
