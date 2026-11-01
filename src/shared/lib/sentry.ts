// ============================================================
// Sentry: monitoramento de erros em produção (plano gratuito, 5 mil erros/mês).
// Sem VITE_SENTRY_DSN, fica desligado em silêncio (o aviso só aparece em desenvolvimento).
// ============================================================

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(appName: string) {
  if (!DSN) {
    if (import.meta.env.DEV) console.info(`Sentry desligado em ${appName}: VITE_SENTRY_DSN não configurada.`);
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Só envia em produção
    enabled: import.meta.env.PROD,
    // Todos os erros (o plano gratuito comporta)
    sampleRate: 1.0,
    // Etiqueta para filtrar por página
    initialScope: {
      tags: { app: appName },
    },
  });
}

export { Sentry };
