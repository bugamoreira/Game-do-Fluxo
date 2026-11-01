import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CODIGO_SONDA, pingGameServer, respostaDeServidor } from '../connectivityService';

describe('teste de conexão da landing', () => {
  const fetchFalso = vi.fn();

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://exemplo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_KEY', 'sb_publishable_teste');
    vi.stubGlobal('fetch', fetchFalso);
    fetchFalso.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('chama a RPC pública estado_turma, não a tabela rooms do FLAME', async () => {
    fetchFalso.mockResolvedValue(new Response(JSON.stringify({ message: 'TURMA_NAO_ENCONTRADA' }), { status: 400 }));
    const r = await pingGameServer(1000);
    expect(r.ok).toBe(true);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exemplo.supabase.co/rest/v1/rpc/estado_turma');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ p_codigo: CODIGO_SONDA });
  });

  it('turma existente também conta como conectado', () => {
    expect(respostaDeServidor(true, { status: 'aberta', codigo: 'TESTE-CONEXAO' })).toBe(true);
  });

  it('página HTML de proxy mal configurado ou outro erro não contam como conectado', async () => {
    expect(respostaDeServidor(true, null)).toBe(false);
    expect(respostaDeServidor(false, { message: 'permission denied' })).toBe(false);
    fetchFalso.mockResolvedValue(new Response('<!doctype html>', { status: 200 }));
    expect(await pingGameServer(1000)).toEqual({ ok: false, reason: 'http' });
  });

  it('falha de rede vira "network"', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await pingGameServer(1000)).toEqual({ ok: false, reason: 'network' });
  });
});
