// Catálogo de componentes (só no Vite dev: /ui.html). Fora do build de produção.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Catalogo } from './Catalogo';
import { MockFacilitador } from './MockFacilitador';
import { MockJogo } from './MockJogo';
import { MockTelao } from './MockTelao';

// ?tela=jogo|facilitador|telao mostra só a tela montada (para screenshot e revisão em tela cheia).
function App() {
  const [tela, setTela] = useState(() => new URLSearchParams(location.search).get('tela'));
  useEffect(() => {
    const handlePopState = () => setTela(new URLSearchParams(location.search).get('tela'));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (tela === 'jogo') return <MockJogo />;
  if (tela === 'facilitador') return <MockFacilitador />;
  if (tela === 'telao') return <MockTelao />;
  return <Catalogo />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
