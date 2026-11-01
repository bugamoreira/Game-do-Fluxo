// ============================================================
// Música adaptativa do Simulador do Plantão (docs/design.md §7).
//
// Duas trilhas com identidade própria, sintetizadas com Tone.js:
//
// - Plantão Travado (rodada 1): tensão que cresce. Compasso irregular (7/8),
//   harmonia menor com notas dissonantes; conforme a tensão sobe entram mais
//   camadas e o andamento acelera. Acima de ~0,85 entra o modo crise.
// - Plantão Lean (rodada 2): fluxo. Pulso regular (4/4) e andamento fixo, tom
//   maior, timbres claros. Com a tensão baixa a música ganha camadas em vez de
//   acelerar. Não há modo crise: problemas soam, mas sem pânico.
//
// Tudo passa por rampas (camadas, troca de trilha, andamento, mudo): nada é
// cortado de uma vez. Volume moderado, com limitador na saída.
//
// A música nunca pode derrubar o jogo (ensaio D1/E2: com a CPU apertada, o
// Transport do Tone acumulava tiques e congelava a página dentro de
// Clock._loop). Por isso o sequenciador é próprio e leve: um temporizador
// agenda no máximo alguns passos à frente pelo relógio de áudio, descarta os
// atrasados em vez de recuperá-los, nunca agenda no passado e limita as notas
// por passo. Um disjuntor desliga a música quando a aba fica oculta ou quando
// há engasgos e erros repetidos, e a religa limpa depois. Toda exceção do
// áudio é engolida e registrada uma única vez no console.
//
// O navegador só libera áudio depois de um gesto do usuário: `iniciar()` deve
// ser chamado no primeiro clique. `atualizar()` e `definirMudo()` podem ser
// chamados antes; o último estado é aplicado quando o áudio liga.
// ============================================================

import * as Tone from 'tone';
import type { MusicUpdateConfig, SfxType } from '../types/game';

export type Rodada = 1 | 2;

export interface ConfigMusica {
  rodada: Rodada;
  /** 0 (plantão tranquilo) a 1 (plantão em colapso). */
  tensao: number;
  /** Falso fora de rodada ou com a rodada pausada: a música some aos poucos. */
  rodando: boolean;
}

/** Efeitos sonoros: os do motor (`SfxType`) e os positivos do Lean. */
export type SomEfeito = SfxType | 'nir' | 'alta';

export type ModoMusica = 'silencio' | 'travado' | 'tenso' | 'crise' | 'lean';

/** Nomes das camadas de cada trilha (o ganho de cada uma vai de 0 a 1). */
export type CamadaTravado = 'base' | 'pulso' | 'tique' | 'inquieto' | 'crise';
export type CamadaLean = 'base' | 'pulso' | 'arpejo' | 'sinos' | 'brilho';

export interface PlanoCamadas {
  travado: Record<CamadaTravado, number>;
  lean: Record<CamadaLean, number>;
}

// ------------------------------------------------------------
// Regras puras (testáveis sem áudio)
// ------------------------------------------------------------

export const LIMIAR_CRISE = 0.85;
/** Histerese: sai da crise só abaixo deste valor (evita alternar a cada consulta). */
export const LIMIAR_SAIDA_CRISE = 0.75;
export const LIMIAR_TENSO = 0.5;

const ANDAMENTO_LEAN = 96;
const ANDAMENTO_TRAVADO_MIN = 80;
const ANDAMENTO_TRAVADO_MAX = 118;
const ANDAMENTO_CRISE = 124;

function limitar(v: number, min = 0, max = 1): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** Escolhe o modo da trilha. `anterior` aplica a histerese da crise. */
export function escolherModo(c: ConfigMusica, anterior: ModoMusica = 'silencio'): ModoMusica {
  if (!c.rodando) return 'silencio';
  if (c.rodada === 2) return 'lean';
  const t = limitar(c.tensao);
  if (t >= LIMIAR_CRISE) return 'crise';
  if (anterior === 'crise' && t >= LIMIAR_SAIDA_CRISE) return 'crise';
  if (t >= LIMIAR_TENSO) return 'tenso';
  return 'travado';
}

/** Andamento (bpm). No Lean é fixo: o fluxo não acelera. */
export function andamento(c: ConfigMusica, modo: ModoMusica = escolherModo(c)): number {
  if (c.rodada === 2) return ANDAMENTO_LEAN;
  if (modo === 'crise') return ANDAMENTO_CRISE;
  const t = limitar(c.tensao);
  return Math.round(ANDAMENTO_TRAVADO_MIN + t * (ANDAMENTO_TRAVADO_MAX - ANDAMENTO_TRAVADO_MIN));
}

/** Rampa suave entre `de` e `ate`: 0 abaixo de `de`, 1 acima de `ate`. */
function entrada(x: number, de: number, ate: number): number {
  return limitar((x - de) / (ate - de));
}

/** Ganho de cada camada para a configuração (a trilha inativa fica toda em 0). */
export function planoDeCamadas(c: ConfigMusica, modo: ModoMusica = escolherModo(c)): PlanoCamadas {
  const t = limitar(c.tensao);
  const zeroT: Record<CamadaTravado, number> = { base: 0, pulso: 0, tique: 0, inquieto: 0, crise: 0 };
  const zeroL: Record<CamadaLean, number> = { base: 0, pulso: 0, arpejo: 0, sinos: 0, brilho: 0 };
  if (modo === 'silencio') return { travado: zeroT, lean: zeroL };

  if (modo === 'lean') {
    // Fluxo bom (tensão baixa) = mais camadas. O pulso e a base nunca saem.
    const fluxo = 1 - t;
    return {
      travado: zeroT,
      lean: {
        base: 1,
        pulso: 1,
        arpejo: entrada(fluxo, 0.3, 0.5),
        sinos: entrada(fluxo, 0.55, 0.75),
        brilho: entrada(fluxo, 0.75, 0.9),
      },
    };
  }

  const crise = modo === 'crise';
  return {
    lean: zeroL,
    travado: {
      base: 1,
      pulso: crise ? 1 : entrada(t, 0.1, 0.3),
      tique: crise ? 1 : entrada(t, 0.3, 0.5),
      inquieto: crise ? 1 : entrada(t, 0.55, 0.75),
      crise: crise ? 1 : 0,
    },
  };
}

/** Métricas do placar que interessam à música (mesmos nomes de `Metricas`). */
export interface MetricasTensao {
  boarding?: number;
  deOcc?: number;
  corredor?: number;
  dth?: number;
}

/**
 * Tensão de um plantão a partir do placar: boarding pesa mais, depois a
 * lotação do DE e o corredor. Na rodada 1, óbito empurra para a crise
 * (docs/design.md §7); na rodada 2 pesa pouco, porque o Lean não tem crise.
 */
export function tensaoDoPlacar(m: MetricasTensao, rodada: Rodada): number {
  const boarding = limitar((m.boarding ?? 0) / 8) * 0.5;
  const lotacao = limitar(((m.deOcc ?? 0) - 9) / 6) * 0.25;
  const corredor = limitar((m.corredor ?? 0) / 4) * 0.15;
  const obitos = m.dth ?? 0;
  const peso = rodada === 1 ? (obitos >= 2 ? 0.45 : obitos >= 1 ? 0.3 : 0) : Math.min(0.2, obitos * 0.1);
  return limitar(boarding + lotacao + corredor + peso);
}

// ------------------------------------------------------------
// Estado do módulo
// ------------------------------------------------------------

const VOLUME_MESTRE = 0.55; // ganho linear (~ -5 dB) antes do limitador
const RAMPA_CAMADA = 2.5; // s
const RAMPA_TROCA_TRILHA = 3.5; // s
const RAMPA_ANDAMENTO = 6; // s
const RAMPA_MUDO = 0.6; // s
const PAUSA_APOS_SILENCIO_MS = 4000;

// Sequenciador e disjuntor
/** Intervalo do temporizador que agenda os passos. */
const INTERVALO_SEQUENCIADOR_MS = 50;
/** Até onde o sequenciador agenda à frente do relógio de áudio. */
const ANTECEDENCIA_S = 0.15;
/** Passo com mais atraso que isto é descartado (não toca). */
export const TOLERANCIA_ATRASO_S = 0.2;
/** Atraso que conta como engasgo (a página ficou parada). */
export const ATRASO_ENGASGO_S = 1;
/** Máximo de passos agendados por rodada do temporizador. */
const MAX_PASSOS_POR_RODADA = 4;
/** Máximo de vozes disparadas num único passo. */
export const MAX_NOTAS_PASSO = 8;
/** Engasgos ou erros dentro da janela que abrem o disjuntor. */
export const LIMITE_ENGASGOS = 3;
export const LIMITE_ERROS = 5;
const JANELA_DISJUNTOR_MS = 30_000;
/** Depois de aberto por engasgo ou erro, o disjuntor tenta religar após este tempo. */
export const ESPERA_DISJUNTOR_MS = 10_000;

export type MotivoDisjuntor = 'oculta' | 'engasgo' | 'erro';
/** Intervalo mínimo entre dois efeitos iguais (evita avalanche com vários grupos). */
const INTERVALO_EFEITO_S = 0.35;

interface Grafo {
  mestre: Tone.Gain;
  saida: Tone.Limiter;
  trilhaTravado: Tone.Gain;
  trilhaLean: Tone.Gain;
  camadasTravado: Record<CamadaTravado, Tone.Gain>;
  camadasLean: Record<CamadaLean, Tone.Gain>;
  sfx: Tone.Gain;
  inst: Instrumentos;
  descartaveis: { dispose(): unknown }[];
}

interface Instrumentos {
  // Travado
  tPad: Tone.PolySynth;
  tFiltroPad: Tone.Filter;
  tBaixo: Tone.MonoSynth;
  tTique: Tone.NoiseSynth;
  tInquieto: Tone.Synth;
  tDrone: Tone.Synth;
  tCoracao: Tone.MembraneSynth;
  // Lean
  lPad: Tone.PolySynth;
  lBaixo: Tone.MonoSynth;
  lArpejo: Tone.Synth;
  lSinos: Tone.FMSynth;
  lBrilho: Tone.NoiseSynth;
  // Efeitos
  eSuave: Tone.PolySynth;
  eGrave: Tone.Synth;
  eSeco: Tone.Synth;
}

const estado = {
  config: { rodada: 1, tensao: 0, rodando: false } as ConfigMusica,
  modo: 'silencio' as ModoMusica,
  bpm: ANDAMENTO_TRAVADO_MIN,
  mudo: false,
  iniciado: false,
  inicio: null as Promise<void> | null,
  grafo: null as Grafo | null,
  passoTravado: 0,
  passoLean: 0,
  /** Trilha que ainda toca enquanto some, durante a troca de rodada. */
  trilhaSaindo: null as { rodada: Rodada; ate: number } | null,
  camadas: planoDeCamadas({ rodada: 1, tensao: 0, rodando: false }),
  ultimoEfeito: {} as Partial<Record<SomEfeito, number>>,
  temporizadorPausa: null as ReturnType<typeof setTimeout> | null,
  /** Andamento corrente do sequenciador (aproxima-se de `bpm` aos poucos). */
  bpmAtual: ANDAMENTO_TRAVADO_MIN,
  sequenciador: null as ReturnType<typeof setInterval> | null,
  /** Tempo de áudio (s) do próximo passo a agendar. */
  proximoPasso: 0,
  /** Vozes já disparadas no passo corrente. */
  notasNoPasso: 0,
  /** Último valor enviado a cada parâmetro (evita rampas repetidas a cada consulta). */
  aplicado: new Map<string, number>(),
  disjuntor: {
    aberto: false,
    motivo: null as MotivoDisjuntor | null,
    engasgos: [] as number[],
    erros: [] as number[],
    temporizador: null as ReturnType<typeof setTimeout> | null,
  },
  erroRegistrado: false,
  visibilidadeArmada: false,
};

// ------------------------------------------------------------
// Proteções: registro único, disjuntor e visibilidade
// ------------------------------------------------------------

/** Registra só o primeiro problema do áudio (o console não pode encher). */
function registrarUmaVez(mensagem: string, erro?: unknown): void {
  if (estado.erroRegistrado) return;
  estado.erroRegistrado = true;
  try {
    console.warn(`[música] ${mensagem}`, erro ?? '');
  } catch {
    /* noop */
  }
}

/** Executa um trecho de áudio sem deixar exceção escapar. */
function seguro(fn: () => void): void {
  try {
    fn();
  } catch (erro) {
    registrarErro(erro);
  }
}

function contarNaJanela(lista: number[]): number {
  const agora = Date.now();
  while (lista.length && agora - lista[0]! > JANELA_DISJUNTOR_MS) lista.shift();
  lista.push(agora);
  return lista.length;
}

function registrarErro(erro: unknown): void {
  registrarUmaVez('erro no áudio; a música pode pausar, o jogo segue.', erro);
  if (contarNaJanela(estado.disjuntor.erros) >= LIMITE_ERROS) abrirDisjuntor('erro');
}

function registrarEngasgo(atraso: number): void {
  registrarUmaVez(`áudio atrasado ${atraso.toFixed(1)} s; passos descartados.`);
  if (contarNaJanela(estado.disjuntor.engasgos) >= LIMITE_ENGASGOS) abrirDisjuntor('engasgo');
}

function abaOculta(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Desliga o sequenciador e silencia a saída na hora; nada fica acumulado. */
function abrirDisjuntor(motivo: MotivoDisjuntor): void {
  const d = estado.disjuntor;
  if (d.temporizador) {
    clearTimeout(d.temporizador);
    d.temporizador = null;
  }
  if (!d.aberto) {
    d.aberto = true;
    pararSequenciador();
    try {
      const g = estado.grafo;
      if (g) {
        g.mestre.gain.cancelScheduledValues(Tone.now());
        g.mestre.gain.rampTo(0, 0.05);
      }
      estado.aplicado.delete('mestre');
      const transporte = Tone.getTransport();
      if (transporte.state === 'started') transporte.pause();
    } catch (erro) {
      registrarUmaVez('erro ao pausar o áudio.', erro);
    }
    if (motivo !== 'oculta') registrarUmaVez(`música pausada (${motivo}); volta sozinha em instantes.`);
  }
  d.motivo = motivo;
  if (motivo !== 'oculta') d.temporizador = setTimeout(fecharDisjuntor, ESPERA_DISJUNTOR_MS);
}

/** Religa do zero: contadores limpos, próximo passo a partir de agora. */
function fecharDisjuntor(): void {
  const d = estado.disjuntor;
  if (d.temporizador) {
    clearTimeout(d.temporizador);
    d.temporizador = null;
  }
  if (abaOculta()) {
    d.motivo = 'oculta';
    return;
  }
  d.aberto = false;
  d.motivo = null;
  d.engasgos = [];
  d.erros = [];
  estado.aplicado.clear();
  if (estado.iniciado) seguro(aplicar);
}

function aoMudarVisibilidade(): void {
  if (abaOculta()) abrirDisjuntor('oculta');
  else if (estado.disjuntor.aberto && estado.disjuntor.motivo === 'oculta') fecharDisjuntor();
}

function armarVisibilidade(): void {
  if (estado.visibilidadeArmada || typeof document === 'undefined') return;
  estado.visibilidadeArmada = true;
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
}

// ------------------------------------------------------------
// Harmonia e padrões
// ------------------------------------------------------------

// Travado em lá menor. Os acordes "tensos" trazem a 6ª menor e o trítono.
const ACORDES_TRAVADO = [
  ['A2', 'E3', 'C4'],
  ['A2', 'F3', 'C4'],
  ['A2', 'E3', 'B3'],
  ['G#2', 'E3', 'B3'],
];
const ACORDES_TRAVADO_TENSOS = [
  ['A2', 'Eb3', 'C4'],
  ['A2', 'F3', 'B3'],
  ['G#2', 'D3', 'B3'],
  ['A2', 'Eb3', 'Bb3'],
];
const BAIXO_TRAVADO = ['A1', 'A1', 'F1', 'E1'];
/** 7/8 em semicolcheias (14 passos), agrupado 3+3+2+3+3: o ritmo "manca". */
const PASSOS_TRAVADO = 14;
const BATIDAS_BAIXO_TRAVADO = new Set([0, 3, 6, 8, 11]);
const BATIDAS_TIQUE_TRAVADO = new Set([0, 2, 5, 8, 9, 11, 13]);
const MOTIVO_INQUIETO: Record<number, string> = { 0: 'E5', 4: 'F5', 7: 'E5', 10: 'Bb4' };

// Lean em dó maior: Cmaj7 → Am7 → Fmaj7 → G6, um acorde por compasso de 4/4.
const ACORDES_LEAN = [
  ['C3', 'G3', 'B3', 'E4'],
  ['A2', 'G3', 'C4', 'E4'],
  ['F2', 'A3', 'C4', 'E4'],
  ['G2', 'B3', 'D4', 'E4'],
];
const BAIXO_LEAN = ['C2', 'A1', 'F1', 'G1'];
const QUINTA_LEAN = ['G2', 'E2', 'C2', 'D2'];
const ARPEJO_LEAN = [
  ['C5', 'E5', 'G5', 'B5'],
  ['A4', 'C5', 'E5', 'G5'],
  ['F4', 'A4', 'C5', 'E5'],
  ['G4', 'B4', 'D5', 'E5'],
];
const SINOS_LEAN: Record<number, string> = { 0: 'G5', 6: 'E5', 10: 'D5' };
const PASSOS_LEAN = 16;

// ------------------------------------------------------------
// Construção do grafo de áudio
// ------------------------------------------------------------

function ganho(destino: Tone.InputNode, valor = 0): Tone.Gain {
  return new Tone.Gain(valor).connect(destino);
}

function montarGrafo(): Grafo {
  const saida = new Tone.Limiter(-3).toDestination();
  const mestre = new Tone.Gain(0).connect(saida);
  const reverb = new Tone.Reverb({ decay: 3.2, wet: 0.3 }).connect(mestre);

  const trilhaTravado = ganho(reverb);
  const trilhaLean = ganho(reverb);
  const sfx = ganho(mestre, 0.8);

  const camadasTravado: Record<CamadaTravado, Tone.Gain> = {
    base: ganho(trilhaTravado),
    pulso: ganho(trilhaTravado),
    tique: ganho(trilhaTravado),
    inquieto: ganho(trilhaTravado),
    crise: ganho(trilhaTravado),
  };
  const camadasLean: Record<CamadaLean, Tone.Gain> = {
    base: ganho(trilhaLean),
    pulso: ganho(trilhaLean),
    arpejo: ganho(trilhaLean),
    sinos: ganho(trilhaLean),
    brilho: ganho(trilhaLean),
  };

  // --- Travado: timbres escuros, filtrados ---
  const tFiltroPad = new Tone.Filter({ type: 'lowpass', frequency: 700, Q: 0.7 }).connect(camadasTravado.base);
  const tPad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
    envelope: { attack: 1.6, decay: 0.5, sustain: 0.7, release: 2.5 },
    volume: -20,
  }).connect(tFiltroPad);
  const tBaixo = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.35, sustain: 0.1, release: 0.4 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4, baseFrequency: 90, octaves: 1.2 },
    volume: -12,
  }).connect(camadasTravado.pulso);
  const tTique = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    volume: -30,
  }).connect(camadasTravado.tique);
  const tInquieto = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0, release: 0.3 },
    volume: -22,
  }).connect(camadasTravado.inquieto);
  const tDrone = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 2, decay: 0, sustain: 1, release: 3 },
    volume: -22,
  }).connect(camadasTravado.crise);
  const tCoracao = new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
    volume: -14,
  }).connect(camadasTravado.crise);

  // --- Lean: timbres claros ---
  const lPad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 1.2, decay: 0.4, sustain: 0.8, release: 2.5 },
    volume: -20,
  }).connect(camadasLean.base);
  const lBaixo = new Tone.MonoSynth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.15, release: 0.3 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3, baseFrequency: 160, octaves: 1.5 },
    volume: -14,
  }).connect(camadasLean.pulso);
  const lArpejo = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.3 },
    volume: -21,
  }).connect(camadasLean.arpejo);
  const lSinos = new Tone.FMSynth({
    harmonicity: 3,
    modulationIndex: 4,
    envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 1.2 },
    modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.4 },
    volume: -24,
  }).connect(camadasLean.sinos);
  const lBrilho = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.002, decay: 0.03, sustain: 0, release: 0.01 },
    volume: -38,
  }).connect(camadasLean.brilho);

  // --- Efeitos ---
  const eSuave = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.35, sustain: 0, release: 0.5 },
    volume: -14,
  }).connect(sfx);
  const eGrave = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.05, decay: 0.9, sustain: 0.1, release: 1.2 },
    volume: -10,
  }).connect(sfx);
  const eSeco = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.08 },
    volume: -26,
  }).connect(sfx);

  const inst: Instrumentos = {
    tPad, tFiltroPad, tBaixo, tTique, tInquieto, tDrone, tCoracao,
    lPad, lBaixo, lArpejo, lSinos, lBrilho,
    eSuave, eGrave, eSeco,
  };

  const descartaveis = [
    ...Object.values(inst), ...Object.values(camadasTravado), ...Object.values(camadasLean),
    trilhaTravado, trilhaLean, sfx, reverb, mestre, saida,
  ];

  return { mestre, saida, trilhaTravado, trilhaLean, camadasTravado, camadasLean, sfx, inst, descartaveis };
}

// ------------------------------------------------------------
// Sequenciador (um passo = uma semicolcheia)
// ------------------------------------------------------------

/** Duração de uma semicolcheia (s) no andamento corrente. */
function semicolcheia(): number {
  return 60 / Math.max(40, estado.bpmAtual) / 4;
}

function ligarSequenciador(): void {
  if (estado.sequenciador || estado.disjuntor.aberto) return;
  estado.proximoPasso = Tone.now() + 0.05;
  estado.sequenciador = setInterval(rodarSequenciador, INTERVALO_SEQUENCIADOR_MS);
}

function pararSequenciador(): void {
  if (estado.sequenciador) clearInterval(estado.sequenciador);
  estado.sequenciador = null;
}

function avancarContadores(passos: number): void {
  estado.passoTravado = (estado.passoTravado + passos) % (PASSOS_TRAVADO * 8);
  estado.passoLean = (estado.passoLean + passos) % (PASSOS_LEAN * 4);
}

/** Andamento em rampa: aproxima-se do alvo ao longo de RAMPA_ANDAMENTO. */
function ajustarAndamento(duracao: number): void {
  const fracao = Math.min(1, duracao / RAMPA_ANDAMENTO);
  estado.bpmAtual += (estado.bpm - estado.bpmAtual) * fracao;
  if (Math.abs(estado.bpm - estado.bpmAtual) < 0.05) estado.bpmAtual = estado.bpm;
}

/**
 * Uma rodada do temporizador: descarta o que atrasou (sem recuperar) e agenda
 * no máximo alguns passos dentro da antecedência. Nunca entra em laço longo.
 */
function rodarSequenciador(): void {
  try {
    if (!estado.grafo || estado.disjuntor.aberto) return;
    const agora = Tone.now();
    if (!Number.isFinite(agora)) return;
    const atraso = agora - estado.proximoPasso;
    if (atraso > TOLERANCIA_ATRASO_S) {
      const dur = semicolcheia();
      const pulados = Math.ceil(atraso / dur);
      avancarContadores(pulados);
      estado.proximoPasso += pulados * dur;
      if (atraso > ATRASO_ENGASGO_S) {
        registrarEngasgo(atraso);
        if (estado.disjuntor.aberto) return;
      }
    }
    for (let n = 0; n < MAX_PASSOS_POR_RODADA && estado.proximoPasso < agora + ANTECEDENCIA_S; n++) {
      const dur = semicolcheia();
      tocarPasso(Math.max(estado.proximoPasso, agora));
      estado.proximoPasso += dur;
      ajustarAndamento(dur);
    }
  } catch (erro) {
    registrarErro(erro);
  }
}

function trilhaTocando(rodada: Rodada): boolean {
  if (estado.modo !== 'silencio' && estado.config.rodada === rodada) return true;
  const saindo = estado.trilhaSaindo;
  return !!saindo && saindo.rodada === rodada && Tone.now() < saindo.ate;
}

/** Dispara uma nota respeitando o teto de vozes do passo. */
function nota(vozes: number, disparar: () => void): void {
  if (estado.notasNoPasso + vozes > MAX_NOTAS_PASSO) return;
  estado.notasNoPasso += vozes;
  seguro(disparar);
}

function tocarPasso(tempo: number): void {
  const g = estado.grafo;
  if (!g) return;
  try {
    const agora = Tone.now();
    // Atrasado demais: descarta (tocar no passado só gera erro e engasgo).
    if (Number.isFinite(tempo) && tempo >= agora - TOLERANCIA_ATRASO_S) {
      const t = Math.max(tempo, agora);
      estado.notasNoPasso = 0;
      if (trilhaTocando(1)) passoTravado(g.inst, t);
      if (trilhaTocando(2)) passoLean(g.inst, t);
    }
  } catch (erro) {
    registrarErro(erro);
  }
  avancarContadores(1);
}

function passoTravado(i: Instrumentos, tempo: number): void {
  const p = estado.passoTravado;
  const passo = p % PASSOS_TRAVADO;
  const compasso = Math.floor(p / PASSOS_TRAVADO);
  const c = estado.camadas.travado;
  const tenso = estado.modo === 'tenso' || estado.modo === 'crise';
  const s16 = semicolcheia();

  // Base: troca de acorde a cada 2 compassos de 7/8.
  if (passo === 0 && compasso % 2 === 0) {
    const banco = tenso ? ACORDES_TRAVADO_TENSOS : ACORDES_TRAVADO;
    const acorde = banco[(compasso / 2) % banco.length]!;
    // Dura quase os dois compassos (28 semicolcheias); o release faz a ligação.
    nota(acorde.length, () => i.tPad.triggerAttackRelease(acorde, s16 * (PASSOS_TRAVADO * 2 - 2), tempo));
  }
  if (c.pulso > 0.01 && BATIDAS_BAIXO_TRAVADO.has(passo)) {
    const n = BAIXO_TRAVADO[Math.floor(compasso / 2) % BAIXO_TRAVADO.length]!;
    nota(1, () => i.tBaixo.triggerAttackRelease(n, s16, tempo, passo === 0 ? 0.9 : 0.6));
  }
  if (c.tique > 0.01 && BATIDAS_TIQUE_TRAVADO.has(passo)) {
    nota(1, () => i.tTique.triggerAttackRelease(s16 / 2, tempo, passo % 3 === 0 ? 0.7 : 0.4));
  }
  if (c.inquieto > 0.01) {
    const n = MOTIVO_INQUIETO[passo];
    if (n) nota(1, () => i.tInquieto.triggerAttackRelease(n, s16, tempo, 0.5));
  }
  if (c.crise > 0.01) {
    if (p % (PASSOS_TRAVADO * 4) === 0) nota(1, () => i.tDrone.triggerAttackRelease('A1', s16 * PASSOS_TRAVADO * 4, tempo));
    // Batimento cardíaco: "tum-tum" no início de cada compasso.
    if (passo === 0) nota(1, () => i.tCoracao.triggerAttackRelease('A1', s16, tempo, 0.9));
    if (passo === 2) nota(1, () => i.tCoracao.triggerAttackRelease('A1', s16, tempo, 0.55));
  }
}

function passoLean(i: Instrumentos, tempo: number): void {
  const p = estado.passoLean;
  const passo = p % PASSOS_LEAN;
  const compasso = Math.floor(p / PASSOS_LEAN);
  const grau = compasso % ACORDES_LEAN.length;
  const c = estado.camadas.lean;
  const s16 = semicolcheia();

  if (passo === 0) {
    const acorde = ACORDES_LEAN[grau]!;
    nota(acorde.length, () => i.lPad.triggerAttackRelease(acorde, s16 * PASSOS_LEAN, tempo));
  }
  // Pulso constante em colcheias: a "esteira" regulada.
  if (passo % 2 === 0) {
    const n = passo % 8 === 6 ? QUINTA_LEAN[grau]! : BAIXO_LEAN[grau]!;
    nota(1, () => i.lBaixo.triggerAttackRelease(n, s16, tempo, passo % 4 === 0 ? 0.8 : 0.5));
  }
  if (c.arpejo > 0.01 && passo % 2 === 0) {
    const notas = ARPEJO_LEAN[grau]!;
    nota(1, () => i.lArpejo.triggerAttackRelease(notas[(passo / 2) % notas.length]!, s16, tempo, 0.6));
  }
  if (c.sinos > 0.01) {
    const n = SINOS_LEAN[passo];
    if (n && compasso % 2 === 1) nota(1, () => i.lSinos.triggerAttackRelease(n, s16 * 4, tempo, 0.5));
  }
  if (c.brilho > 0.01) {
    nota(1, () => i.lBrilho.triggerAttackRelease(s16 / 4, tempo, passo % 4 === 2 ? 0.7 : 0.3));
  }
}

// ------------------------------------------------------------
// Aplicação do estado ao áudio (sempre com rampas)
// ------------------------------------------------------------

/** Rampa só quando o alvo muda: `atualizar()` chega a cada consulta (1 s). */
function rampa(chave: string, param: { rampTo(valor: number, tempo: number): unknown }, valor: number, tempo: number): void {
  if (estado.aplicado.get(chave) === valor) return;
  estado.aplicado.set(chave, valor);
  param.rampTo(valor, tempo);
}

function aplicar(): void {
  const g = estado.grafo;
  if (!g) return;
  const { config, modo } = estado;

  for (const [nome, valor] of Object.entries(estado.camadas.travado)) {
    rampa(`t:${nome}`, g.camadasTravado[nome as CamadaTravado].gain, valor, RAMPA_CAMADA);
  }
  for (const [nome, valor] of Object.entries(estado.camadas.lean)) {
    rampa(`l:${nome}`, g.camadasLean[nome as CamadaLean].gain, valor, RAMPA_CAMADA);
  }

  const tocando = modo !== 'silencio';
  rampa('trilhaTravado', g.trilhaTravado.gain, tocando && config.rodada === 1 ? 1 : 0, RAMPA_TROCA_TRILHA);
  rampa('trilhaLean', g.trilhaLean.gain, tocando && config.rodada === 2 ? 1 : 0, RAMPA_TROCA_TRILHA);

  // Na crise o pad abre um pouco (mais áspero); no resto fica abafado.
  rampa('filtroPad', g.inst.tFiltroPad.frequency, modo === 'crise' ? 1400 : modo === 'tenso' ? 1000 : 700, RAMPA_CAMADA);

  aplicarMestre();

  if (tocando) {
    if (estado.temporizadorPausa) {
      clearTimeout(estado.temporizadorPausa);
      estado.temporizadorPausa = null;
    }
    ligarSequenciador();
  } else if (!estado.temporizadorPausa && estado.sequenciador) {
    // Para o sequenciador só depois que as rampas terminarem (sem corte audível).
    estado.temporizadorPausa = setTimeout(() => {
      estado.temporizadorPausa = null;
      if (estado.modo === 'silencio') pararSequenciador();
    }, PAUSA_APOS_SILENCIO_MS);
  }
}

function aplicarMestre(): void {
  const g = estado.grafo;
  if (!g || estado.disjuntor.aberto) return;
  rampa('mestre', g.mestre.gain, estado.mudo ? 0 : VOLUME_MESTRE, RAMPA_MUDO);
}

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------

async function iniciar(): Promise<void> {
  if (estado.inicio) return estado.inicio;
  estado.inicio = (async () => {
    await Tone.start();
    if (!estado.grafo) {
      estado.grafo = montarGrafo();
      estado.aplicado.clear();
    }
    estado.iniciado = true;
    armarVisibilidade();
    if (abaOculta()) abrirDisjuntor('oculta');
    // Aplica o que chegou antes do clique (inclusive o mudo).
    seguro(aplicar);
  })();
  try {
    await estado.inicio;
  } catch (erro) {
    // Navegador recusou (sem gesto): permite tentar de novo no próximo clique.
    estado.inicio = null;
    throw erro;
  }
}

function atualizar(c: ConfigMusica): void {
  seguro(() => atualizarSemProtecao(c));
}

function atualizarSemProtecao(c: ConfigMusica): void {
  const config: ConfigMusica = { rodada: c.rodada === 2 ? 2 : 1, tensao: limitar(c.tensao), rodando: !!c.rodando };
  const anterior = estado.config;
  const modo = escolherModo(config, estado.modo);

  if (anterior.rodada !== config.rodada && estado.modo !== 'silencio') {
    estado.trilhaSaindo = { rodada: anterior.rodada, ate: Tone.now() + RAMPA_TROCA_TRILHA + 0.5 };
  }

  estado.config = config;
  estado.modo = modo;
  estado.bpm = andamento(config, modo);
  estado.camadas = planoDeCamadas(config, modo);
  if (estado.iniciado) aplicar();
}

/** Problemas no Lean soam sem pânico: mais graves e curtos, sem dissonância seca. */
function efeito(som: SomEfeito): void {
  const g = estado.grafo;
  if (!estado.iniciado || estado.mudo || !g || estado.disjuntor.aberto) return;
  const agora = Tone.now();
  const ultimo = estado.ultimoEfeito[som];
  if (ultimo !== undefined && agora - ultimo < INTERVALO_EFEITO_S) return;
  estado.ultimoEfeito[som] = agora;

  const t = agora + 0.05;
  const lean = estado.config.rodada === 2;
  const { eSuave, eGrave, eSeco } = g.inst;
  try {
    switch (som) {
      case 'death':
        if (lean) {
          eGrave.triggerAttackRelease('D2', '4n', t, 0.6);
        } else {
          eGrave.triggerAttackRelease('C2', '2n', t, 0.9);
          eGrave.triggerAttackRelease('F#1', '2n', t + 0.22, 0.8);
        }
        break;
      case 'det':
        if (lean) {
          eSuave.triggerAttackRelease(['A4', 'C5'], '8n', t, 0.4);
        } else {
          // Alerta seco: três toques curtos e baixos.
          eSeco.triggerAttackRelease('A4', '32n', t, 0.6);
          eSeco.triggerAttackRelease('Eb4', '32n', t + 0.16, 0.6);
          eSeco.triggerAttackRelease('A4', '32n', t + 0.32, 0.6);
        }
        break;
      case 'cascade':
        if (lean) {
          eGrave.triggerAttackRelease('G2', '8n', t, 0.5);
        } else {
          eGrave.triggerAttackRelease('F2', '8n', t, 0.8);
          eGrave.triggerAttackRelease('B1', '4n', t + 0.25, 0.8);
        }
        break;
      case 'disc':
        eSuave.triggerAttackRelease(['E5', 'G5'], '16n', t, 0.5);
        eSuave.triggerAttackRelease(['G5', 'C6'], '8n', t + 0.08, 0.5);
        break;
      case 'alta':
        if (lean) {
          eSuave.triggerAttackRelease('C6', '16n', t, 0.45);
          eSuave.triggerAttackRelease('E6', '8n', t + 0.09, 0.45);
        } else {
          eSuave.triggerAttackRelease('E5', '16n', t, 0.35);
        }
        break;
      case 'fluxista':
        eSuave.triggerAttackRelease('C5', '16n', t, 0.5);
        eSuave.triggerAttackRelease('E5', '16n', t + 0.08, 0.5);
        eSuave.triggerAttackRelease('G5', '16n', t + 0.16, 0.5);
        eSuave.triggerAttackRelease(['C6', 'E6'], '8n', t + 0.24, 0.45);
        break;
      case 'nir':
        eSuave.triggerAttackRelease(['G4', 'D5'], '8n', t, 0.45);
        eSuave.triggerAttackRelease(['C5', 'G5'], '4n', t + 0.14, 0.45);
        break;
    }
  } catch (erro) {
    registrarErro(erro);
  }
}

function definirMudo(mudo: boolean): void {
  estado.mudo = !!mudo;
  seguro(aplicarMestre);
}

function estaMudo(): boolean {
  return estado.mudo;
}

export const musica = { iniciar, atualizar, efeito, definirMudo, estaMudo };

/** Só para testes: retrato do estado interno. */
export function __estadoMusica() {
  return {
    iniciado: estado.iniciado,
    mudo: estado.mudo,
    modo: estado.modo,
    bpm: estado.bpm,
    config: { ...estado.config },
    camadas: estado.camadas,
    sequenciador: estado.sequenciador !== null,
    disjuntor: { aberto: estado.disjuntor.aberto, motivo: estado.disjuntor.motivo },
    passoTravado: estado.passoTravado,
  };
}

/** Só para testes: volta ao estado inicial (descarta o grafo). */
export function __reiniciarMusica(): void {
  if (estado.temporizadorPausa) clearTimeout(estado.temporizadorPausa);
  if (estado.disjuntor.temporizador) clearTimeout(estado.disjuntor.temporizador);
  pararSequenciador();
  if (estado.visibilidadeArmada && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
  }
  estado.grafo?.descartaveis.forEach((n) => {
    try { n.dispose(); } catch { /* noop */ }
  });
  Object.assign(estado, {
    config: { rodada: 1, tensao: 0, rodando: false },
    modo: 'silencio',
    bpm: ANDAMENTO_TRAVADO_MIN,
    mudo: false,
    iniciado: false,
    inicio: null,
    grafo: null,
    passoTravado: 0,
    passoLean: 0,
    trilhaSaindo: null,
    camadas: planoDeCamadas({ rodada: 1, tensao: 0, rodando: false }),
    ultimoEfeito: {},
    temporizadorPausa: null,
    bpmAtual: ANDAMENTO_TRAVADO_MIN,
    sequenciador: null,
    proximoPasso: 0,
    notasNoPasso: 0,
    aplicado: new Map<string, number>(),
    disjuntor: { aberto: false, motivo: null, engasgos: [], erros: [], temporizador: null },
    erroRegistrado: false,
    visibilidadeArmada: false,
  });
  gestoArmado = false;
}

// ------------------------------------------------------------
// Adaptador antigo (telas que ainda importam SimsMusic) — sai na integração.
// ------------------------------------------------------------

let gestoArmado = false;

/**
 * O jogo antigo nunca chamava `init()`, por isso a música não ligava no
 * computador do grupo. O adaptador liga o áudio no primeiro clique ou tecla.
 */
function armarPrimeiroGesto(): void {
  if (gestoArmado || estado.iniciado || typeof window === 'undefined') return;
  gestoArmado = true;
  const ligar = () => {
    window.removeEventListener('pointerdown', ligar, true);
    window.removeEventListener('keydown', ligar, true);
    musica.iniciar().catch(() => {
      gestoArmado = false;
      armarPrimeiroGesto();
    });
  };
  window.addEventListener('pointerdown', ligar, true);
  window.addEventListener('keydown', ligar, true);
}

/** @deprecated use `musica`. */
export const SimsMusic = {
  init(): void {
    musica.iniciar().catch(() => armarPrimeiroGesto());
  },
  update(c: MusicUpdateConfig): void {
    armarPrimeiroGesto();
    const rodada: Rodada = c.isR2 ? 2 : 1;
    musica.atualizar({
      rodada,
      tensao: tensaoDoPlacar({ boarding: c.boarding, deOcc: c.deOcc, dth: c.deaths }, rodada),
      rodando: c.run,
    });
  },
  sfx(type: SfxType): void {
    musica.efeito(type);
  },
  toggleMute(): boolean {
    musica.definirMudo(!musica.estaMudo());
    return musica.estaMudo();
  },
  isMuted(): boolean {
    return musica.estaMudo();
  },
};
