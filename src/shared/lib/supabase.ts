// ============================================================
// Clientes Supabase — sempre pelo mesmo domínio do site.
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
// Só os services devem usar estes clientes.
//
// Dois clientes (ensaio E2): com uma sessão salva, toda chamada passa pela
// trava de sessão do auth-js ("lock:sb-…-auth-token"); sob carga a trava
// demorava mais de 5 s e as consultas atrasavam. Por isso:
//   - `clienteSemSessao()`: jogo, telão sem login, orientações e relatório.
//     Não lê, não guarda nem renova sessão; não usa a trava.
//   - `clienteComSessao()`: só o facilitador (painel e telão aberto pela
//     janela do facilitador, que lê o código de acesso com a sessão).
// Os dois são criados só no primeiro uso: a página do grupo nunca instancia
// o cliente com sessão.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function configuracao(): { url: string; chave: string } {
  const chave = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
  if (!chave) {
    throw new Error('Variável de ambiente VITE_SUPABASE_KEY ausente');
  }
  if (typeof window === 'undefined') {
    throw new Error('O cliente Supabase só roda no navegador (usa window.location.origin)');
  }
  return { url: window.location.origin, chave };
}

let semSessao: SupabaseClient | null = null;
let comSessao: SupabaseClient | null = null;

/** Cliente anônimo, sem sessão nem trava (grupos, telão sem login, relatório). */
export function clienteSemSessao(): SupabaseClient {
  if (!semSessao) {
    const { url, chave } = configuracao();
    semSessao = createClient(url, chave, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        // Chave distinta: nunca disputa armazenamento nem trava com o facilitador.
        storageKey: 'plantao-anonimo',
      },
    });
  }
  return semSessao;
}

/** Cliente do facilitador: a sessão sobrevive a um recarregamento da página. */
export function clienteComSessao(): SupabaseClient {
  if (!comSessao) {
    const { url, chave } = configuracao();
    comSessao = createClient(url, chave, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return comSessao;
}
