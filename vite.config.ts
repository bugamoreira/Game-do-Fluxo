import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// Espelha os redirects do netlify.toml: o navegador fala só com o próprio
// domínio (localhost) e o Vite repassa /rest e /auth ao Supabase. Assim o
// desenvolvimento local se comporta como produção (sem chamadas diretas a
// *.supabase.co e sem Realtime/WebSocket).
function proxySupabase(url: string | undefined): Record<string, ProxyOptions> | undefined {
  if (!url) return undefined;
  const alvo = url.replace(/\/+$/, '');
  return {
    '/rest': { target: alvo, changeOrigin: true, secure: true },
    '/auth': { target: alvo, changeOrigin: true, secure: true },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = proxySupabase(env.VITE_SUPABASE_URL);

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          landing: resolve(__dirname, 'index.html'),
          player: resolve(__dirname, 'jogar.html'),
          instructor: resolve(__dirname, 'instrutor.html'),
          projector: resolve(__dirname, 'projetor.html'),
          relatorio: resolve(__dirname, 'relatorio.html'),
        },
      },
    },
    server: {
      port: 3000,
      open: '/',
      proxy,
    },
    preview: {
      proxy,
    },
  };
});
