// A Content-Security-Policy publicada (netlify.toml) precisa permitir o que o app usa.
import { describe, expect, it } from 'vitest';
import toml from '../../../../netlify.toml?raw';

const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? '';
const diretiva = (nome: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${nome} `)) ?? '';

describe('Content-Security-Policy', () => {
  it('permite o worker blob: do Tone.js (sem ele a música para no telão e no jogo)', () => {
    expect(diretiva('worker-src')).toContain('blob:');
    expect(diretiva('worker-src')).toContain("'self'");
  });

  it('continua sem scripts de fora nem inline', () => {
    expect(diretiva('script-src')).toBe("script-src 'self'");
  });
});
