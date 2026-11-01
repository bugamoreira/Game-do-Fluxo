// ============================================================
// Cliente Supabase — sempre pelo mesmo domínio do site.
//
// O navegador nunca fala com *.supabase.co diretamente: as chamadas vão
// para window.location.origin e um proxy repassa /rest e /auth ao Supabase.
//   - Produção: redirects do netlify.toml.
//   - Desenvolvimento e preview: server.proxy / preview.proxy do vite.config.ts.
// Assim o ambiente local se comporta igual ao de produção.
//
// Sem Realtime (WebSocket): o proxy do Netlify não repassa WebSocket, e foi
// isso que derrubou o FLAME (docs/pos-mortem-flame.md). Toda sincronização é
// por consulta periódica, feita pelos services (src/shared/services/).
// Só os services devem usar este cliente.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const chave = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

if (!chave) {
  throw new Error('Variável de ambiente VITE_SUPABASE_KEY ausente');
}

if (typeof window === 'undefined') {
  throw new Error('O cliente Supabase só roda no navegador (usa window.location.origin)');
}

export const sb = createClient(window.location.origin, chave, {
  auth: {
    // A sessão do facilitador sobrevive a um recarregamento da página.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
