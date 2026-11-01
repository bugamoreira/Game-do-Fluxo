// Liga a música no primeiro clique ou tecla (o navegador exige um gesto do usuário).

import { useEffect } from 'react';
import { musica } from './musicaAdapter';

export function useLigarSomNoPrimeiroGesto(): void {
  useEffect(() => {
    function handleGesto() {
      void musica.iniciar();
      window.removeEventListener('pointerdown', handleGesto);
      window.removeEventListener('keydown', handleGesto);
    }
    window.addEventListener('pointerdown', handleGesto);
    window.addEventListener('keydown', handleGesto);
    return () => {
      window.removeEventListener('pointerdown', handleGesto);
      window.removeEventListener('keydown', handleGesto);
    };
  }, []);
}
