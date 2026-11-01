// Teste de conectividade da landing: uma chamada mínima à RPC pública `estado_turma`.
// Não reutiliza o cliente do jogo para não carregar o CSS e as dependências dele.
// Em produção usa o mesmo domínio do site (proxy do netlify.toml), igual ao jogo.
//
// O código consultado não precisa existir: `TURMA_NAO_ENCONTRADA` prova que o
// pedido chegou ao banco e voltou, então conta como conectado.

import { z } from 'zod';

/** Código qualquer, só para a sondagem. */
export const CODIGO_SONDA = 'TESTE-CONEXAO';

// Um proxy mal configurado devolve o index.html com status 200; só vale se vier
// a turma (objeto com status) ou o erro estável de turma inexistente.
const TurmaSondaSchema = z.object({ status: z.string(), codigo: z.string() });
const ErroSondaSchema = z.union([
  z.object({ message: z.literal('TURMA_NAO_ENCONTRADA') }),
  z.object({ code: z.literal('CB001') }),
]);

export type ConnectivityResult =
  | { ok: true; ms: number }
  | { ok: false; reason: 'timeout' | 'http' | 'network' | 'config' };

function baseUrl(): string | undefined {
  if (import.meta.env.PROD) return window.location.origin;
  return import.meta.env.VITE_SUPABASE_URL as string | undefined;
}

/** A resposta prova que o banco atendeu? */
export function respostaDeServidor(httpOk: boolean, corpo: unknown): boolean {
  return httpOk ? TurmaSondaSchema.safeParse(corpo).success : ErroSondaSchema.safeParse(corpo).success;
}

export async function pingGameServer(timeoutMs: number): Promise<ConnectivityResult> {
  const url = baseUrl();
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
  if (!url || !key) return { ok: false, reason: 'config' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${url}/rest/v1/rpc/estado_turma`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_codigo: CODIGO_SONDA }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const body: unknown = await res.json().catch(() => null);
    if (!respostaDeServidor(res.ok, body)) return { ok: false, reason: 'http' };
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return { ok: false, reason: e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
