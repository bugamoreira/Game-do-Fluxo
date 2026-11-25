// Liga a música no primeiro gesto (clique ou tecla), como o navegador exige.
// O módulo de áudio é pré-carregado ao abrir a tela. Os ouvintes só saem quando
// o áudio está de fato tocando; se o navegador recusar ou suspender depois
// (Safari sem gesto válido, troca de aba, download em curso), o próximo clique tenta de novo.

import { useEffect } from 'react';
import { musica } from './musicaAdapter';

/** O Safari reconhece como gesto o clique e a tecla; o `pointerdown` cobre o Chrome. */
const GESTOS = ['pointerdown', 'click', 'keydown', 'touchend'] as const;

export function useLigarSomNoPrimeiroGesto(): void {
  useEffect(() => {
    let ativo = true;
    void musica.preparar();

    function remover() {
      for (const tipo of GESTOS) window.removeEventListener(tipo, handleGesto, true);
    }
    // Os ouvintes ficam o tempo todo: se o navegador suspender o áudio depois
    // (Safari ao trocar de aba ou numa interrupção), o próximo clique religa.
    function handleGesto() {
      if (!ativo || musica.tocando()) return;
      void musica.iniciar();
    }
    for (const tipo of GESTOS) window.addEventListener(tipo, handleGesto, true);
    return () => {
      ativo = false;
      remover();
    };
  }, []);
}
