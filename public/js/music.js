// ============================================================
// SimsMusic — Tone.js adaptive music engine
// Estilo Sims Build Mode: marimba pentatonica, adaptativa ao caos
// ============================================================
const SimsMusic = (() => {
  let inited = false;
  let muted  = false;
  let mode   = 'calm';  // 'calm' | 'minor' | 'crisis'

  let mel, bass, sfxHi, sfxLo, sfxWarn, sfxDisc;
  let loopMel, loopBass;

  // ── Pentatonic scales (Sims-style) ────────────────────────
  // calm = C major pentatonic   → bright, bouncy (Sims Buy Mode)
  // minor = A minor pentatonic  → building tension
  // crisis = Chromatic tension  → caos total
  const SCALES = {
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

  const BASS_PATTERNS = {
    calm:   ['C3',null,null,null,'G3',null,'A3',null],
    minor:  ['A2',null,null,null,'E3',null,'G3',null],
    crisis: ['A2','A2',null,'Eb3',null,'G2',null,'A2'],
  };

  // ── Cleanup current loops ──────────────────────────────────
  function _stopLoops() {
    if (loopMel)  { try { loopMel.stop();  loopMel.dispose();  } catch(_){} loopMel  = null; }
    if (loopBass) { try { loopBass.stop(); loopBass.dispose(); } catch(_){} loopBass = null; }
  }

  // ── Activate a music mode ──────────────────────────────────
  function _setMode(newMode) {
    if (!inited || newMode === mode) return;
    _stopLoops();
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

  // ── Initialize audio engine ────────────────────────────────
  function init() {
    if (inited) return;
    Tone.start();

    // Signal chain
    const reverb = new Tone.Reverb({ decay: 2, wet: 0.28 }).toDestination();
    const delay  = new Tone.FeedbackDelay({ delayTime: '16n', feedback: 0.08, wet: 0.12 }).connect(reverb);

    // Marimba melody synth (triangle8 = warm marimba-like)
    mel = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope:   { attack: 0.001, decay: 0.28, sustain: 0, release: 0.35 },
    }).connect(delay);
    mel.volume.value = -10;

    // Bass synth
    bass = new Tone.MonoSynth({
      oscillator:     { type: 'sine' },
      envelope:       { attack: 0.06, decay: 0.5, sustain: 0.25, release: 1 },
      filterEnvelope: { attack: 0.06, decay: 0.3, sustain: 0.5, release: 1, baseFrequency: 80, octaves: 1.5 },
    }).connect(reverb);
    bass.volume.value = -22;

    // SFX dedicated synths (avoid disposal issues)
    sfxHi   = new Tone.Synth({ oscillator:{ type:'triangle'   }, envelope:{ attack:.001, decay:.2, sustain:0, release:.3  }, volume:-14 }).toDestination();
    sfxLo   = new Tone.Synth({ oscillator:{ type:'sine'       }, envelope:{ attack:.08,  decay:.8, sustain:.2, release:1.2 }, volume:-12 }).toDestination();
    sfxWarn = new Tone.Synth({ oscillator:{ type:'sawtooth'   }, envelope:{ attack:.001, decay:.12, sustain:0, release:.2  }, volume:-22 }).toDestination();
    sfxDisc = new Tone.PolySynth(Tone.Synth, { oscillator:{ type:'triangle8' }, envelope:{ attack:.001, decay:.15, sustain:0, release:.2 }, volume:-14 }).toDestination();

    Tone.Transport.bpm.value = 100;
    Tone.Transport.start();

    // Start in calm mode
    mode = 'INIT'; // force setMode to run
    _setMode('calm');
    inited = true;
  }

  // ── Update music based on live game state ──────────────────
  function update({ deOcc, boarding, deaths, isR2, run }) {
    if (!inited) return;

    if (!run) {
      if (Tone.Transport.state === 'started') Tone.Transport.pause();
      return;
    }
    if (Tone.Transport.state !== 'started') Tone.Transport.start();

    // Choose target mode based on DE occupancy and boarding
    let target = 'calm';
    if (!isR2 && deaths > 0)             target = 'crisis';
    else if (boarding > 2 || deOcc >= 12) target = 'minor';

    // R2 never reaches crisis (tools work!)
    if (isR2 && target === 'crisis') target = 'minor';

    _setMode(target);

    // BPM: R2 stays calm, R1 escalates
    const bpm = isR2
      ? (target === 'minor' ? 106 : 96)
      : (target === 'crisis' ? 142 : target === 'minor' ? 120 : 100);

    Tone.Transport.bpm.rampTo(bpm, 5);

    // Volume scaling
    const melVol  = muted ? -Infinity : target === 'crisis' ? -7 : -10;
    const bassVol = muted ? -Infinity : target === 'crisis' ? -16 : target === 'minor' ? -18 : -22;
    if (mel)  mel.volume.rampTo(melVol,  1.5);
    if (bass) bass.volume.rampTo(bassVol, 1.5);
  }

  // ── Sound effects ──────────────────────────────────────────
  function sfx(type) {
    if (!inited || muted) return;
    const now = Tone.now() + 0.05;
    try {
      if (type === 'death') {
        // Ominous low boom
        sfxLo.triggerAttackRelease('C2', '2n', now);
        sfxLo.triggerAttackRelease('G1', '2n', now + 0.15);

      } else if (type === 'det') {
        // Warning beeps
        sfxWarn.triggerAttackRelease('A4', '32n', now);
        sfxWarn.triggerAttackRelease('F4', '32n', now + 0.18);
        sfxWarn.triggerAttackRelease('A4', '32n', now + 0.36);

      } else if (type === 'disc') {
        // Happy Sims-like "ding" on discharge
        sfxDisc.triggerAttackRelease(['E5','G5'], '16n', now);
        sfxDisc.triggerAttackRelease(['G5','C6'], '8n',  now + 0.08);

      } else if (type === 'cascade') {
        // Dramatic cascade warning
        sfxLo.triggerAttackRelease('F2', '8n', now);
        sfxLo.triggerAttackRelease('C2', '4n', now + 0.25);

      } else if (type === 'fluxista') {
        // Fluxista auto-discharge (R2 - satisfying)
        sfxDisc.triggerAttackRelease(['C5','E5','G5'], '8n', now);
      }
    } catch (e) { /* audio not ready yet, ignore */ }
  }

  // ── Mute toggle ────────────────────────────────────────────
  function toggleMute() {
    muted = !muted;
    if (inited) {
      mel?.volume.rampTo(muted  ? -Infinity : -10, 0.5);
      bass?.volume.rampTo(muted ? -Infinity : -22, 0.5);
    }
    return muted;
  }

  function isMuted() { return muted; }

  return { init, update, sfx, toggleMute, isMuted };
})();
