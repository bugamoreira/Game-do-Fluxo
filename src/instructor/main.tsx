import '../index.css';
import { createRoot } from 'react-dom/client';
import { initSentry } from '../shared/lib/sentry';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { App } from './App';

const raiz = createRoot(document.getElementById('root')!);
const parametros = new URLSearchParams(window.location.search);

// `?demo=1`: serviço falso em memória, sem servidor (navegação e capturas de tela).
// Os dois caminhos são carregados sob demanda: a demonstração não precisa das
// variáveis do Supabase, e o painel real não carrega os dados de mentira.
if (parametros.get('demo') === '1') {
  void import('./demo/iniciarDemo').then(({ iniciarDemo }) => {
    const { servicos, sessaoInicial, codigoInicial } = iniciarDemo(parametros);
    raiz.render(
      <ErrorBoundary>
        <App servicos={servicos} sessaoInicial={sessaoInicial} codigoInicial={codigoInicial} />
      </ErrorBoundary>,
    );
  });
} else {
  initSentry('instructor');
  void import('./servicosReais').then(({ servicosReais }) => {
    raiz.render(
      <ErrorBoundary>
        <App servicos={servicosReais} />
      </ErrorBoundary>,
    );
  });
}
