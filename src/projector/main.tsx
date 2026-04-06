import { createRoot } from 'react-dom/client';
import { initSentry } from '../shared/lib/sentry';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { App } from './App';

initSentry('projector');

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
