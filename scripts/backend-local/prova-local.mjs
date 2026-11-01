#!/usr/bin/env node
/* global process, console, fetch */
// Roda supabase/tests/prova-seguranca.mjs contra o backend local.
// Antes, entra como facilitador e abre (ou substitui) a turma de teste PROVA.
// Pré-requisito: `npm run backend:local` no ar em outro terminal.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL_BASE = process.env.BACKEND_URL || 'http://localhost:54321';
const CHAVE = process.env.CHAVE || 'chave-local-ensaio';
const EMAIL = process.env.FACILITADOR_EMAIL || 'facilitador@teste.local';
const SENHA = process.env.FACILITADOR_SENHA || 'teste1234';
const CODIGO = 'PROVA';

if (/supabase\.co/.test(URL_BASE)) {
  console.error('Este script é só para o backend local.');
  process.exit(2);
}

async function post(caminho, corpo, token) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    method: 'POST',
    headers: { apikey: CHAVE, Authorization: `Bearer ${token ?? CHAVE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${JSON.stringify(json)}`);
  return json;
}

const sessao = await post('/auth/v1/token?grant_type=password', { email: EMAIL, password: SENHA });
await post('/rest/v1/rpc/abrir_turma', { p_codigo: CODIGO, p_nome: 'Prova de segurança', p_substituir: true }, sessao.access_token);
console.log(`Turma ${CODIGO} aberta no backend local.`);

const aqui = path.dirname(fileURLToPath(import.meta.url));
const prova = path.resolve(aqui, '../../supabase/tests/prova-seguranca.mjs');
const r = spawnSync(process.execPath, [prova], {
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_URL: URL_BASE, SUPABASE_ANON_KEY: CHAVE, CODIGO_TESTE: CODIGO },
});
process.exit(r.status ?? 1);
