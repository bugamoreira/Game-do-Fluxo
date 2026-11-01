// ============================================================
// Adaptador fino da música para o jogo.
// A API-alvo (`musica.iniciar/atualizar/efeito/definirMudo`) está sendo criada
// pelo C3 em src/shared/lib/music.ts. Enquanto ela não chega, este adaptador
// traduz para o SimsMusic atual. Quando a API do C3 chegar, troque o corpo
// destas funções por ela e mantenha as chamadas da tela como estão.
// O Tone.js só é carregado no primeiro clique (fica fora do pacote inicial).
// ============================================================

import type { SfxType } from '../../shared/types/game';

type MotorMusica = (typeof import('../../shared/lib/music'))['SimsMusic'];

export interface EstadoMusica {
  rodada: 1 | 2;
  /** 0 (calmo) a 1 (crise) */
  tensao: number;
  rodando: boolean;
}

let motor: MotorMusica | null = null;
let iniciando: Promise<void> | null = null;
let mudoDesejado = false;
let ultimoEstado: EstadoMusica | null = null;

function aplicarMudo(m: MotorMusica): void {
  if (m.isMuted() !== mudoDesejado) m.toggleMute();
}

function aplicarEstado(m: MotorMusica, { rodada, tensao, rodando }: EstadoMusica): void {
  const t = Math.min(1, Math.max(0, tensao));
  // O SimsMusic decide o modo por ocupação do DE, boarding e óbitos: traduz a tensão nesses sinais.
  m.update({ deOcc: Math.round(t * 15), boarding: t >= 0.6 ? 3 : 0, deaths: t >= 0.9 ? 1 : 0, isR2: rodada === 2, run: rodando });
}

export const musica = {
  /** Liga o áudio. Precisa vir de um gesto do usuário (primeiro clique). */
  iniciar(): Promise<void> {
    if (motor) return Promise.resolve();
    iniciando ??= import('../../shared/lib/music')
      .then(({ SimsMusic }) => {
        SimsMusic.init();
        motor = SimsMusic;
        aplicarMudo(SimsMusic);
        if (ultimoEstado) aplicarEstado(SimsMusic, ultimoEstado);
      })
      .catch(() => {
        iniciando = null; // navegador recusou o áudio: tenta no próximo clique
      });
    return iniciando;
  },

  atualizar(estado: EstadoMusica): void {
    ultimoEstado = estado;
    if (motor) aplicarEstado(motor, estado);
  },

  efeito(som: SfxType): void {
    motor?.sfx(som);
  },

  definirMudo(mudo: boolean): void {
    mudoDesejado = mudo;
    if (motor) aplicarMudo(motor);
  },
};
