// ============================================================
// Sentry — error monitoring for production
// Free tier: 5K errors/month
// ============================================================

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(appName: string) {
  if (!DSN) {
    console.log(`[Sentry] No DSN configured for ${appName} — monitoring disabled`);
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Only send errors in production
    enabled: import.meta.env.PROD,
    // Sample 100% of errors (free tier is generous enough)
    sampleRate: 1.0,
    // Tags for filtering
    initialScope: {
      tags: { app: appName },
    },
  });
}

export { Sentry };
