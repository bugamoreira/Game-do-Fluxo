import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { Game } from './App';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Game />
  </ErrorBoundary>
);
