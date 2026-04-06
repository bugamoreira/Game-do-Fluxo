import '../index.css';
import { createRoot } from 'react-dom/client';
import { initSentry } from '../shared/lib/sentry';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { Game } from './App';

initSentry('player');

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Game />
  </ErrorBoundary>
);
