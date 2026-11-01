import '../index.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initSentry } from '../shared/lib/sentry';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { AppSala } from './AppSala';
import { AppSolo } from './AppSolo';
import { lerParametros, type ParametrosApp } from './lib/url';
import { ContextoPorta, type PortaJogo } from './servicos/porta';

initSentry('player');

/**
 * A porta online (services e cliente Supabase) e a de demonstração são carregadas
 * sob demanda: o modo solo e a demonstração funcionam sem as variáveis do servidor.
 */
async function carregarPorta(p: ParametrosApp): Promise<PortaJogo> {
  if (p.modo === 'demo') {
    const { criarPortaDemo } = await import('./demo/portaDemo');
    return criarPortaDemo(p.telaDemo);
  }
  const { portaOnline } = await import('./servicos/online');
  return portaOnline;
}

function Raiz({ parametros }: { parametros: ParametrosApp }) {
  const [porta, setPorta] = useState<PortaJogo | null>(null);
  const [falha, setFalha] = useState(false);

  useEffect(() => {
    if (parametros.modo === 'solo') return;
    let vivo = true;
    carregarPorta(parametros)
      .then(p => vivo && setPorta(p))
      .catch(() => vivo && setFalha(true));
    return () => {
      vivo = false;
    };
  }, [parametros]);

  if (parametros.modo === 'solo') return <AppSolo />;
  if (falha) {
    return (
      <div role="alert" className="grid h-screen place-items-center bg-fundo-app p-6 text-center font-sora text-texto">
        <p className="max-w-md text-lg">
          Não foi possível carregar o jogo. Recarregue a página ou use o modo{' '}
          <a href="?modo=solo" className="font-bold underline">
            Treinar sozinho
          </a>
          .
        </p>
      </div>
    );
  }
  if (!porta) return <div className="h-screen bg-fundo-app" aria-busy="true" />;
  const grupoInicial = parametros.modo === 'demo' && parametros.telaDemo !== 'nome' ? (parametros.grupoDemo ?? 'Os Fluxistas') : parametros.grupoDemo;
  return (
    <ContextoPorta.Provider value={porta}>
      <AppSala sala={parametros.sala} grupoInicial={porta.modo === 'demo' ? grupoInicial : null} />
    </ContextoPorta.Provider>
  );
}

const parametros = lerParametros(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Raiz parametros={parametros} />
    </ErrorBoundary>
  </StrictMode>,
);
