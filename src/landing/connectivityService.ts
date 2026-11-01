// Teste de conectividade da landing: uma leitura mínima na API REST do Supabase.
// Não reutiliza o cliente do jogo para não carregar o CSS e as dependências dele.
// Em produção usa o mesmo domínio do site (proxy do netlify.toml), igual ao jogo.

import { z } from 'zod';

// Um proxy mal configurado devolve o index.html com status 200; só vale se vier a lista de salas.
const RoomsProbeSchema = z.array(z.object({ id: z.string() }));

export type ConnectivityResult =
  | { ok: true; ms: number }
  | { ok: false; reason: 'timeout' | 'http' | 'network' | 'config' };

function baseUrl(): string | undefined {
  if (import.meta.env.PROD) return window.location.origin;
  return import.meta.env.VITE_SUPABASE_URL as string | undefined;
}

export async function pingGameServer(timeoutMs: number): Promise<ConnectivityResult> {
  const url = baseUrl();
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
  if (!url || !key) return { ok: false, reason: 'config' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(`${url}/rest/v1/rooms?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, reason: 'http' };
    const body: unknown = await res.json().catch(() => null);
    if (!RoomsProbeSchema.safeParse(body).success) return { ok: false, reason: 'http' };
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return { ok: false, reason: e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
