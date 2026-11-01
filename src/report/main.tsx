// Relatório da turma — entrada (relatorio.html).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './relatorio.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
