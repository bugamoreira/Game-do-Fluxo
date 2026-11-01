// ============================================================
// Adaptador fino da música para o jogo.
// Delega para a API `musica` de src/shared/lib/music.ts (trilhas do Travado e do
// Lean). O módulo do Tone.js é pré-carregado assim que a tela abre (fora do
// pacote inicial), para que o clique que liga o som encontre tudo pronto: o
// Safari só libera o áudio se o `resume()` do AudioContext acontecer dentro do
// próprio gesto, sem esperar download. Até ligar, o último estado e o mudo ficam
// guardados e são aplicados ao ligar.
// ============================================================

import type { SomEfeito } from '../../shared/lib/music';

type ModuloMusica = typeof import('../../shared/lib/music');
type ModuloTone = typeof import('tone');

export interface EstadoMusica {
  rodada: 1 | 2;
  /** 0 (calmo) a 1 (crise) */
  tensao: number;
  rodando: boolean;
}

let modulos: { m: ModuloMusica['musica']; tone: ModuloTone } | null = null;
let carregando: Promise<void> | null = null;
let ligado = false;
let mudoDesejado = false;
let ultimoEstado: EstadoMusica | null = null;

function aplicarGuardado(m: ModuloMusica['musica']): void {
  m.definirMudo(mudoDesejado);
  if (ultimoEstado) m.atualizar(ultimoEstado);
}

export const musica = {
  /** Baixa o módulo de áudio em segundo plano (não toca nada; não precisa de gesto). */
  preparar(): Promise<void> {
    carregando ??= Promise.all([import('../../shared/lib/music'), import('tone')])
      .then(([mod, tone]) => {
        modulos = { m: mod.musica, tone };
        aplicarGuardado(mod.musica);
      })
      .catch(() => {
        carregando = null; // falha de rede: tenta de novo no próximo gesto
      });
    return carregando;
  },

  /**
   * Liga o áudio. Chame dentro de um gesto do usuário (clique ou tecla).
   * Devolve `true` quando o áudio ficou de fato tocando; `false` pede nova tentativa no próximo gesto.
   */
  async iniciar(): Promise<boolean> {
    if (ligado) return true;
    if (!modulos) {
      // Ainda baixando: este gesto só adianta o download; o próximo liga o som.
      await musica.preparar();
      return false;
    }
    const { m, tone } = modulos;
    try {
      // Chamado de forma síncrona, ainda dentro do gesto (exigência do Safari).
      const retomada = tone.start();
      await Promise.all([retomada, m.iniciar()]);
    } catch {
      return false;
    }
    ligado = tone.getContext().state === 'running';
    if (ligado) aplicarGuardado(m);
    return ligado;
  },

  atualizar(estado: EstadoMusica): void {
    ultimoEstado = estado;
    if (ligado) modulos?.m.atualizar(estado);
  },

  efeito(som: SomEfeito): void {
    if (ligado) modulos?.m.efeito(som);
  },

  definirMudo(mudo: boolean): void {
    mudoDesejado = mudo;
    modulos?.m.definirMudo(mudo);
  },
};
