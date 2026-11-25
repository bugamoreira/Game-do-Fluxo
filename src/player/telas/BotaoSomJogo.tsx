// Indicador de som no cabeçalho do plantão. Mostra se o áudio está tocando neste
// computador; se não estiver, o próprio clique no botão liga (gesto do usuário).
import { useEffect, useState } from 'react';
import { musica } from '../lib/musicaAdapter';

export function BotaoSomJogo() {
  const [tocando, setTocando] = useState(() => musica.tocando());
  useEffect(() => {
    const id = window.setInterval(() => setTocando(musica.tocando()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <button
      type="button"
      onClick={() => void musica.iniciar().then(() => setTocando(musica.tocando()))}
      className={
        tocando
          ? 'min-h-10 rounded-pilula px-3 text-xs font-bold text-texto-suave'
          : 'min-h-10 animate-pulse rounded-pilula bg-amarelo px-4 text-sm font-bold text-marinho-profundo'
      }
      aria-live="polite"
    >
      {tocando ? 'Som ligado' : 'Ligar som'}
    </button>
  );
}
