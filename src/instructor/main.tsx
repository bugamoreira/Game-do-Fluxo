import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
