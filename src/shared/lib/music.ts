// ============================================================
// SimsMusic — Tone.js adaptive music engine
// Estilo Sims Build Mode: marimba pentatonica, adaptativa ao caos
// ============================================================

import * as Tone from 'tone';
import type { MusicUpdateConfig, SfxType } from '../types/game';

type MusicMode = 'calm' | 'minor' | 'crisis';

let inited = false;
let muted = false;
let mode: MusicMode | 'INIT' = 'calm';

let mel: Tone.PolySynth | null = null;
let bass: Tone.MonoSynth | null = null;
let sfxHi: Tone.Synth | null = null;
let sfxLo: Tone.Synth | null = null;
let sfxWarn: Tone.Synth | null = null;
let sfxDisc: Tone.PolySynth | null = null;
let loopMel: Tone.Sequence | null = null;
let loopBass: Tone.Sequence | null = null;

const SCALES: Record<MusicMode, (string | null)[]> = {
  calm: [
    'C5','E5','G5','A5','G5','E5','C5','D5',
    'E5','G5','A5','C6','A5','G5','E5','C5',
  ],
  minor: [
    'A4','C5','D5','E5','G5','E5','D5','C5',
    'A4','E5','G5','A5','G5','E5','D5','A4',
  ],
  crisis: [
    'A4',null,'Eb5',null,'G5','A4',null,'Eb5',
    'G5',null,'A4',null,'C5','Eb5',null,'G5',
  ],
};

const BASS_PATTERNS: Record<MusicMode, (string | null)[]> = {
  calm:   ['C3',null,null,null,'G3',null,'A3',null],
  minor:  ['A2',null,null,null,'E3',null,'G3',null],
  crisis: ['A2','A2',null,'Eb3',null,'G2',null,'A2'],
};

function stopLoops(): void {
  if (loopMel)  { try { loopMel.stop();  loopMel.dispose();  } catch { /* noop */ } loopMel = null; }
  if (loopBass) { try { loopBass.stop(); loopBass.dispose(); } catch { /* noop */ } loopBass = null; }
}

function setMode(newMode: MusicMode): void {
  if (!inited || newMode === mode) return;
  stopLoops();
  mode = newMode;

  const scale = SCALES[newMode];
  const bassP = BASS_PATTERNS[newMode];

  loopMel = new Tone.Sequence((time, note) => {
    if (!muted && note && mel) {
      mel.triggerAttackRelease(note, '8n', time);
    }
  }, scale, '8n').start('+0.1');

  loopBass = new Tone.Sequence((time, note) => {
    if (!muted && note && bass) {
      bass.triggerAttackRelease(note, '4n', time);
    }
  }, bassP, '4n').start('+0.1');
}

function init(): void {
  if (inited) return;
  Tone.start();

  const reverb = new Tone.Reverb({ decay: 2, wet: 0.28 }).toDestination();
  const delay = new Tone.FeedbackDelay({ delayTime: '16n', feedback: 0.08, wet: 0.12 }).connect(reverb);

  mel = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.35 },
  }).connect(delay);
  mel.volume.value = -10;

  bass = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.06, decay: 0.5, sustain: 0.25, release: 1 },
    filterEnvelope: { attack: 0.06, decay: 0.3, sustain: 0.5, release: 1, baseFrequency: 80, octaves: 1.5 },
  }).connect(reverb);
  bass.volume.value = -22;

  sfxHi   = new Tone.Synth({ oscillator: { type: 'triangle' },  envelope: { attack: .001, decay: .2,  sustain: 0,  release: .3  }, volume: -14 }).toDestination();
  sfxLo   = new Tone.Synth({ oscillator: { type: 'sine' },      envelope: { attack: .08,  decay: .8,  sustain: .2, release: 1.2 }, volume: -12 }).toDestination();
  sfxWarn  = new Tone.Synth({ oscillator: { type: 'sawtooth' },  envelope: { attack: .001, decay: .12, sustain: 0,  release: .2  }, volume: -22 }).toDestination();
  sfxDisc  = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle8' }, envelope: { attack: .001, decay: .15, sustain: 0, release: .2 }, volume: -14 }).toDestination();

  Tone.getTransport().bpm.value = 100;
  Tone.getTransport().start();

  mode = 'INIT';
  setMode('calm');
  inited = true;
}

function update(config: MusicUpdateConfig): void {
  if (!inited) return;

  if (!config.run) {
    if (Tone.getTransport().state === 'started') Tone.getTransport().pause();
    return;
  }
  if (Tone.getTransport().state !== 'started') Tone.getTransport().start();

  let target: MusicMode = 'calm';
  if (!config.isR2 && config.deaths > 0)                      target = 'crisis';
  else if (config.boarding > 2 || config.deOcc >= 12)          target = 'minor';
  if (config.isR2 && target === 'crisis')                      target = 'minor';

  setMode(target);

  const bpm = config.isR2
    ? (target === 'minor' ? 106 : 96)
    : (target === 'crisis' ? 142 : target === 'minor' ? 120 : 100);

  Tone.getTransport().bpm.rampTo(bpm, 5);

  const melVol  = muted ? -Infinity : target === 'crisis' ? -7 : -10;
  const bassVol = muted ? -Infinity : target === 'crisis' ? -16 : target === 'minor' ? -18 : -22;
  if (mel)  mel.volume.rampTo(melVol, 1.5);
  if (bass) bass.volume.rampTo(bassVol, 1.5);
}

function sfx(type: SfxType): void {
  if (!inited || muted) return;
  const now = Tone.now() + 0.05;
  try {
    if (type === 'death' && sfxLo) {
      sfxLo.triggerAttackRelease('C2', '2n', now);
      sfxLo.triggerAttackRelease('G1', '2n', now + 0.15);
    } else if (type === 'det' && sfxWarn) {
      sfxWarn.triggerAttackRelease('A4', '32n', now);
      sfxWarn.triggerAttackRelease('F4', '32n', now + 0.18);
      sfxWarn.triggerAttackRelease('A4', '32n', now + 0.36);
    } else if (type === 'disc' && sfxDisc) {
      sfxDisc.triggerAttackRelease(['E5', 'G5'], '16n', now);
      sfxDisc.triggerAttackRelease(['G5', 'C6'], '8n', now + 0.08);
    } else if (type === 'cascade' && sfxLo) {
      sfxLo.triggerAttackRelease('F2', '8n', now);
      sfxLo.triggerAttackRelease('C2', '4n', now + 0.25);
    } else if (type === 'fluxista' && sfxDisc) {
      sfxDisc.triggerAttackRelease(['C5', 'E5', 'G5'], '8n', now);
    }
  } catch { /* audio not ready yet */ }
}

function toggleMute(): boolean {
  muted = !muted;
  if (inited) {
    mel?.volume.rampTo(muted ? -Infinity : -10, 0.5);
    bass?.volume.rampTo(muted ? -Infinity : -22, 0.5);
  }
  return muted;
}

function isMuted(): boolean {
  return muted;
}

export const SimsMusic = { init, update, sfx, toggleMute, isMuted };
