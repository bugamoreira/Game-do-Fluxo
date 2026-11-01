// ============================================================
// Adaptador fino da música para o jogo.
// Delega para a API `musica` de src/shared/lib/music.ts (trilhas do Travado e do
// Lean). O Tone.js só é carregado no primeiro clique (fica fora do pacote inicial);
// até lá, o último estado e o mudo ficam guardados e são aplicados ao ligar.
// ============================================================

import type { SomEfeito } from '../../shared/lib/music';

type ApiMusica = (typeof import('../../shared/lib/music'))['musica'];

export interface EstadoMusica {
  rodada: 1 | 2;
  /** 0 (calmo) a 1 (crise) */
  tensao: number;
  rodando: boolean;
}

let api: ApiMusica | null = null;
let iniciando: Promise<void> | null = null;
let mudoDesejado = false;
let ultimoEstado: EstadoMusica | null = null;

export const musica = {
  /** Liga o áudio. Precisa vir de um gesto do usuário (primeiro clique). */
  iniciar(): Promise<void> {
    if (api) return Promise.resolve();
    iniciando ??= import('../../shared/lib/music')
      .then(async ({ musica: m }) => {
        m.definirMudo(mudoDesejado);
        if (ultimoEstado) m.atualizar(ultimoEstado);
        await m.iniciar();
        api = m;
      })
      .catch(() => {
        iniciando = null; // navegador recusou o áudio: tenta no próximo clique
      });
    return iniciando;
  },

  atualizar(estado: EstadoMusica): void {
    ultimoEstado = estado;
    api?.atualizar(estado);
  },

  efeito(som: SomEfeito): void {
    api?.efeito(som);
  },

  definirMudo(mudo: boolean): void {
    mudoDesejado = mudo;
    api?.definirMudo(mudo);
  },
};
