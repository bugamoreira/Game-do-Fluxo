#!/usr/bin/env node
/* global process, console, Buffer, URL, setTimeout */
// ============================================================
// Backend local de ensaio: imita o suficiente do Supabase (PostgREST + GoTrue)
// para o app rodar sem internet, contra um Postgres local com as migrações.
//
//   POST /rest/v1/rpc/:fn                 RPC com parâmetros nomeados (JSON)
//   GET|POST|PATCH|DELETE /rest/v1/:rel   tabelas e views de public (filtros simples)
//   POST /auth/v1/token?grant_type=password|refresh_token
//   GET  /auth/v1/user   POST /auth/v1/logout   GET /auth/v1/settings
//
// Cada pedido roda numa transação com `set local role anon|authenticated` e
// `request.jwt.claims`, como o PostgREST faz: quem decide o que pode é o banco
// (GRANT, RLS, security definer), não este servidor.
//
// Variáveis: PGHOST (pasta do socket ou host), PGPORT, PGUSER, PGDATABASE,
// PORTA (padrão 54321), JWT_SEGREDO, FACILITADOR_EMAIL, FACILITADOR_SENHA.
// NUNCA use isto em produção: é só para ensaio local.
// ============================================================

import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const PORTA = Number(process.env.PORTA || 54321);
const SEGREDO = process.env.JWT_SEGREDO || 'segredo-local-de-ensaio-nao-use-em-producao';
const EMAIL = (process.env.FACILITADOR_EMAIL || 'facilitador@teste.local').toLowerCase();
const SENHA = process.env.FACILITADOR_SENHA || 'teste1234';
const DURACAO_S = 3600;

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
  max: 10,
});
pool.on('error', (e) => console.error('[pg] conexão ociosa caiu:', e.message));

// ── JWT HS256 ─────────────────────────────────────────────────

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function assinarJwt(claims) {
  const cab = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify(claims));
  const ass = crypto.createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url');
  return `${cab}.${corpo}.${ass}`;
}

/** Devolve as claims se a assinatura e a validade conferem; senão null. */
function verificarJwt(token) {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cab, corpo, ass] = partes;
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(cab, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256') return null;
  const esperado = crypto.createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest();
  const recebido = Buffer.from(ass, 'base64url');
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) return null;
  if (typeof claims?.exp === 'number' && claims.exp < Date.now() / 1000) return null;
  return claims;
}

const pareceJwt = (t) => /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(t);

class ErroHttp extends Error {
  constructor(status, corpo) {
    super(corpo.message || corpo.msg || 'erro');
    this.status = status;
    this.corpo = corpo;
  }
}

const erroPgrst = (status, code, message, details = null, hint = null) =>
  new ErroHttp(status, { code, details, hint, message });

/**
 * Papel e claims do pedido, como o PostgREST: sem token ou com a chave pública
 * (não JWT) → anon; JWT válido → o papel dele (só anon/authenticated); JWT
 * inválido ou vencido → 401.
 */
function identificar(req) {
  const aut = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(aut);
  const token = m ? m[1].trim() : '';
  if (!token || !pareceJwt(token)) return { papel: 'anon', claims: { role: 'anon' } };
  const claims = verificarJwt(token);
  if (!claims) throw erroPgrst(401, 'PGRST301', 'JWT inválido ou vencido');
  if (claims.role !== 'anon' && claims.role !== 'authenticated') {
    throw erroPgrst(401, 'PGRST301', 'Papel do JWT não permitido neste backend local');
  }
  return { papel: claims.role, claims };
}

// ── HTTP util ─────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, accept, accept-profile, content-profile, prefer, range, range-unit, x-client-info, x-supabase-api-version',
  'Access-Control-Expose-Headers': 'content-range, content-location, x-supabase-api-version',
  'Access-Control-Max-Age': '86400',
};

function responder(res, status, corpo, extras = {}) {
  const cab = { ...CORS, ...extras };
  if (corpo === undefined) {
    res.writeHead(status, cab);
    res.end();
    return;
  }
  const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cab });
  res.end(texto);
}

const LIMITE_CORPO = 2 * 1024 * 1024;

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let total = 0;
    req.on('data', (p) => {
      total += p.length;
      if (total > LIMITE_CORPO) {
        reject(erroPgrst(413, 'PGRST413', 'Corpo da requisição grande demais'));
        req.destroy();
        return;
      }
      pedacos.push(p);
    });
    req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')));
    req.on('error', reject);
  });
}

async function lerJson(req) {
  const texto = await lerCorpo(req);
  if (!texto.trim()) return {};
  try {
    return JSON.parse(texto);
  } catch {
    throw erroPgrst(400, 'PGRST102', 'Corpo JSON inválido');
  }
}

// ── Transação com papel ───────────────────────────────────────

/** Executa `fn(cliente)` numa transação com o papel e as claims do pedido. */
async function comPapel({ papel, claims }, fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    // papel vem de uma lista fechada (anon/authenticated): nunca do usuário
    await cliente.query(papel === 'authenticated' ? 'set local role authenticated' : 'set local role anon');
    await cliente.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
      JSON.stringify(claims),
      claims.sub ?? '',
    ]);
    await cliente.query("set local statement_timeout = '8s'");
    const r = await fn(cliente);
    await cliente.query('commit');
    return r;
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

/** Erro do Postgres → status e corpo no formato do PostgREST. */
function erroDoPostgres(e, papel) {
  if (e instanceof ErroHttp) return e;
  if (!e || typeof e.code !== 'string') {
    console.error('[servidor] erro inesperado:', e);
    return erroPgrst(500, 'PGRST000', 'Erro interno do backend local');
  }
  const code = e.code;
  let status = 400;
  if (code === '42501') status = papel === 'authenticated' ? 403 : 401;
  else if (code.startsWith('23')) status = 409;
  else if (code === '42883' || code === '42P01') status = 404;
  else if (code === '57014') status = 500;
  else if (code.startsWith('08') || code.startsWith('53')) status = 503;
  else if (code.startsWith('XX') || code === '57P01') status = 500;
  else if (code === '40001') status = 409;
  return erroPgrst(status, code, e.message, e.detail ?? null, e.hint ?? null);
}

function verificarPerfil(req) {
  for (const h of ['accept-profile', 'content-profile']) {
    const v = req.headers[h];
    if (v && v !== 'public') {
      throw erroPgrst(406, 'PGRST106', 'O schema precisa ser um destes: public', null, null);
    }
  }
}

// ── RPC ───────────────────────────────────────────────────────

const NOME = /^[a-z_][a-z0-9_]*$/;

/** Assinaturas das funções de public com esse nome (do catálogo, nunca do pedido). */
async function assinaturas(nome) {
  const { rows } = await pool.query(
    `select p.oid,
            p.proretset as retset,
            p.prorettype = 'pg_catalog.void'::regtype as void,
            p.pronargs as nargs,
            p.pronargdefaults as ndefaults,
            coalesce(p.proargnames, '{}') as nomes,
            coalesce(p.proargmodes::text[], '{}') as modos,
            array(select pg_catalog.format_type(t, null) from unnest(p.proargtypes) t) as tipos
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1 and p.prokind = 'f'`,
    [nome],
  );
  return rows.map((r) => {
    // só argumentos de entrada, na ordem de proargtypes
    const entrada = [];
    r.nomes.forEach((n, i) => {
      const modo = r.modos[i] ?? 'i';
      if (modo === 'i' || modo === 'b' || modo === 'v') entrada.push(n);
    });
    const nomes = r.modos.length ? entrada : r.nomes.slice(0, r.nargs);
    const args = r.tipos.map((tipo, i) => ({
      nome: nomes[i] ?? '',
      tipo,
      temDefault: i >= r.nargs - r.ndefaults,
    }));
    return { retset: r.retset, void: r.void, args };
  });
}

function escolherAssinatura(lista, chaves, nome) {
  const naoAchou = () =>
    erroPgrst(
      404,
      'PGRST202',
      `Could not find the function public.${nome}(${[...chaves].sort().join(', ')}) in the schema cache`,
      'Searched for the function with the given parameter names, but no matches were found.',
      null,
    );
  const candidatas = lista.filter((s) => {
    const nomes = new Set(s.args.map((a) => a.nome));
    if (![...chaves].every((k) => nomes.has(k))) return false;
    return s.args.every((a) => a.temDefault || chaves.has(a.nome));
  });
  if (candidatas.length === 0) throw naoAchou();
  if (candidatas.length > 1) throw erroPgrst(300, 'PGRST203', `Mais de uma função public.${nome} serve para esses parâmetros`);
  return candidatas[0];
}

const TIPO_SEGURO = /^[a-z][a-z0-9_ ]*(\[\])?$|^public\.[a-z_][a-z0-9_]*$|^"?[a-z_][a-z0-9_]*"?$/;

function paraTexto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

async function rpc(req, res, nome) {
  if (!NOME.test(nome)) throw erroPgrst(404, 'PGRST202', `Nome de função inválido: ${nome}`);
  if (req.method !== 'POST') throw erroPgrst(405, 'PGRST101', 'Este backend local só aceita RPC por POST');
  const ident = identificar(req);
  const corpo = await lerJson(req);
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroPgrst(400, 'PGRST102', 'Os parâmetros da RPC precisam ser um objeto JSON');
  }
  const lista = await assinaturas(nome);
  const chaves = new Set(Object.keys(corpo));
  const sig = escolherAssinatura(lista, chaves, nome);

  const valores = [];
  const partes = [];
  for (const a of sig.args) {
    if (!chaves.has(a.nome)) continue;
    if (!NOME.test(a.nome) || !TIPO_SEGURO.test(a.tipo)) throw erroPgrst(500, 'PGRST000', 'Assinatura não suportada');
    valores.push(paraTexto(corpo[a.nome]));
    partes.push(`"${a.nome}" := $${valores.length}::text::${a.tipo}`);
  }
  const chamada = `public."${nome}"(${partes.join(', ')})`;
  const sql = sig.retset
    ? `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as r from ${chamada} x`
    : sig.void
      ? `select ${chamada}`
      : `select to_jsonb(${chamada}) as r`;
  try {
    const { rows } = await comPapel(ident, (c) => c.query(sql, valores));
    if (sig.void) return responder(res, 204);
    responder(res, 200, JSON.stringify(rows[0]?.r ?? null));
  } catch (e) {
    throw erroDoPostgres(e, ident.papel);
  }
}

// ── Tabelas e views (subconjunto do PostgREST) ────────────────

async function colunasDe(rel) {
  const { rows } = await pool.query(
    `select a.attname as nome
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where n.nspname = 'public' and c.relname = $1 and c.relkind in ('r', 'v', 'm', 'p', 'f')`,
    [rel],
  );
  if (rows.length === 0) {
    throw erroPgrst(404, '42P01', `relation "public.${rel}" does not exist`);
  }
  return new Set(rows.map((r) => r.nome));
}

const OPERADORES = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function coluna(nome, cols) {
  if (!NOME.test(nome) || !cols.has(nome)) {
    throw erroPgrst(400, '42703', `column "${nome}" does not exist`);
  }
  return `"${nome}"`;
}

function montarFiltros(params, cols, valores) {
  const conds = [];
  for (const [chave, valor] of params) {
    if (['select', 'limit', 'offset', 'order', 'columns', 'on_conflict'].includes(chave)) continue;
    const col = coluna(chave, cols);
    const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|is)\.(.*)$/s.exec(valor);
    if (!m) throw erroPgrst(400, 'PGRST100', `Filtro não suportado neste backend local: ${chave}=${valor}`);
    const [, nao, op, arg] = m;
    let cond;
    if (op === 'is') {
      const v = arg.toLowerCase();
      if (!['null', 'true', 'false'].includes(v)) throw erroPgrst(400, 'PGRST100', `Valor inválido para is: ${arg}`);
      cond = `${col} is ${v}`;
    } else {
      valores.push(arg);
      cond = `${col} ${OPERADORES[op]} $${valores.length}`;
    }
    conds.push(nao ? `not (${cond})` : cond);
  }
  return conds.length ? ` where ${conds.join(' and ')}` : '';
}

function inteiro(v, nome) {
  if (v === null) return null;
  if (!/^\d{1,9}$/.test(v)) throw erroPgrst(400, 'PGRST100', `${nome} inválido`);
  return Number(v);
}

async function tabela(req, res, rel, url) {
  if (!NOME.test(rel)) throw erroPgrst(404, '42P01', `relation "public.${rel}" does not exist`);
  verificarPerfil(req);
  const ident = identificar(req);
  const cols = await colunasDe(rel);
  const params = [...url.searchParams.entries()];
  const sp = url.searchParams;
  const alvo = `public."${rel}"`;
  const valores = [];
  const retornar = /return=representation/.test(req.headers.prefer || '');
  let sql;
  let statusOk = 200;

  if (req.method === 'GET' || req.method === 'HEAD') {
    const sel = sp.get('select');
    const lista =
      !sel || sel === '*'
        ? '*'
        : sel
            .split(',')
            .map((c) => coluna(c.trim(), cols))
            .join(', ');
    const where = montarFiltros(params, cols, valores);
    let ordem = '';
    if (sp.get('order')) {
      ordem =
        ' order by ' +
        sp
          .get('order')
          .split(',')
          .map((o) => {
            const [c, dir] = o.split('.');
            const d = dir === 'desc' ? ' desc' : '';
            return coluna(c, cols) + d;
          })
          .join(', ');
    }
    const limite = inteiro(sp.get('limit'), 'limit');
    const desloc = inteiro(sp.get('offset'), 'offset');
    sql = `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as r from (select ${lista} from ${alvo}${where}${ordem}${
      limite !== null ? ` limit ${limite}` : ''
    }${desloc !== null ? ` offset ${desloc}` : ''}) x`;
  } else if (req.method === 'POST') {
    const corpo = await lerJson(req);
    const linhas = Array.isArray(corpo) ? corpo : [corpo];
    if (linhas.length !== 1 || typeof linhas[0] !== 'object' || linhas[0] === null) {
      throw erroPgrst(400, 'PGRST102', 'Este backend local insere uma linha por vez');
    }
    const nomes = Object.keys(linhas[0]).map((c) => coluna(c, cols));
    for (const c of Object.keys(linhas[0])) valores.push(paraTexto(linhas[0][c]));
    sql = `insert into ${alvo} (${nomes.join(', ')}) values (${valores.map((_, i) => `$${i + 1}`).join(', ')})${
      retornar ? ' returning *' : ''
    }`;
    statusOk = 201;
  } else if (req.method === 'PATCH') {
    const corpo = await lerJson(req);
    if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo) || !Object.keys(corpo).length) {
      throw erroPgrst(400, 'PGRST102', 'Corpo do PATCH precisa ser um objeto com colunas');
    }
    const sets = Object.keys(corpo).map((c) => {
      valores.push(paraTexto(corpo[c]));
      return `${coluna(c, cols)} = $${valores.length}`;
    });
    const where = montarFiltros(params, cols, valores);
    sql = `update ${alvo} set ${sets.join(', ')}${where}${retornar ? ' returning *' : ''}`;
  } else if (req.method === 'DELETE') {
    const where = montarFiltros(params, cols, valores);
    sql = `delete from ${alvo}${where}${retornar ? ' returning *' : ''}`;
  } else {
    throw erroPgrst(405, 'PGRST101', 'Método não suportado');
  }

  try {
    const r = await comPapel(ident, (c) => c.query(sql, valores));
    if (req.method === 'GET' || req.method === 'HEAD') {
      const dados = r.rows[0]?.r ?? [];
      const n = dados.length;
      return responder(res, 200, req.method === 'HEAD' ? undefined : JSON.stringify(dados), {
        'Content-Range': n ? `0-${n - 1}/*` : '*/*',
      });
    }
    if (retornar) return responder(res, statusOk, JSON.stringify(r.rows));
    responder(res, req.method === 'POST' ? 201 : 204);
  } catch (e) {
    throw erroDoPostgres(e, ident.papel);
  }
}

// ── Auth (subconjunto do GoTrue) ──────────────────────────────

const refreshTokens = new Map(); // refresh_token -> user id

function erroAuth(status, codigo, msg) {
  return new ErroHttp(status, { code: status, error_code: codigo, msg });
}

async function usuarioPorId(id) {
  const { rows } = await pool.query('select id::text as id, email from auth.users where id = $1', [id]);
  return rows[0] ?? null;
}

function formatoUsuario(u) {
  const agora = new Date().toISOString();
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: agora,
    phone: '',
    confirmed_at: agora,
    last_sign_in_at: agora,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: agora,
    updated_at: agora,
    is_anonymous: false,
  };
}

function novaSessao(u) {
  const agora = Math.floor(Date.now() / 1000);
  const access_token = assinarJwt({
    aud: 'authenticated',
    sub: u.id,
    email: u.email,
    role: 'authenticated',
    iat: agora,
    exp: agora + DURACAO_S,
    session_id: crypto.randomUUID(),
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: agora }],
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    is_anonymous: false,
  });
  const refresh_token = crypto.randomBytes(24).toString('base64url');
  refreshTokens.set(refresh_token, u.id);
  return {
    access_token,
    token_type: 'bearer',
    expires_in: DURACAO_S,
    expires_at: agora + DURACAO_S,
    refresh_token,
    user: formatoUsuario(u),
  };
}

function compararSegredo(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function auth(req, res, caminho, url) {
  if (caminho === '/auth/v1/settings' && req.method === 'GET') {
    return responder(res, 200, {
      external: { email: true, phone: false, anonymous_users: false },
      disable_signup: true,
      mailer_autoconfirm: true,
      phone_autoconfirm: false,
      sms_provider: '',
      saml_enabled: false,
    });
  }
  if (caminho === '/auth/v1/health' && req.method === 'GET') {
    return responder(res, 200, { name: 'GoTrue (backend local de ensaio)', version: 'local' });
  }
  if (caminho === '/auth/v1/token' && req.method === 'POST') {
    const tipo = url.searchParams.get('grant_type');
    const corpo = await lerJson(req);
    if (tipo === 'password') {
      const email = String(corpo.email ?? '').trim().toLowerCase();
      const okEmail = compararSegredo(email, EMAIL);
      const okSenha = compararSegredo(String(corpo.password ?? ''), SENHA);
      if (!okEmail || !okSenha) throw erroAuth(400, 'invalid_credentials', 'Invalid login credentials');
      const { rows } = await pool.query('select id::text as id, email from auth.users where lower(email) = $1', [email]);
      if (!rows[0]) throw erroAuth(400, 'invalid_credentials', 'Invalid login credentials');
      return responder(res, 200, novaSessao(rows[0]));
    }
    if (tipo === 'refresh_token') {
      const rt = String(corpo.refresh_token ?? '');
      const id = refreshTokens.get(rt);
      if (!id) throw erroAuth(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(rt);
      const u = await usuarioPorId(id);
      if (!u) throw erroAuth(400, 'user_not_found', 'User not found');
      return responder(res, 200, novaSessao(u));
    }
    throw erroAuth(400, 'unsupported_grant_type', 'Tipo de concessão não suportado neste backend local');
  }
  if (caminho === '/auth/v1/user' && req.method === 'GET') {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    const claims = m ? verificarJwt(m[1].trim()) : null;
    if (!claims || claims.role !== 'authenticated' || !claims.sub) {
      throw erroAuth(401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature');
    }
    const u = await usuarioPorId(claims.sub);
    if (!u) throw erroAuth(404, 'user_not_found', 'User from sub claim in JWT does not exist');
    return responder(res, 200, formatoUsuario(u));
  }
  if (caminho === '/auth/v1/logout' && req.method === 'POST') {
    // sessões locais não ficam em banco: basta o navegador descartar o token
    await lerCorpo(req).catch(() => '');
    return responder(res, 204);
  }
  if (caminho === '/auth/v1/signup' && req.method === 'POST') {
    throw erroAuth(422, 'signup_disabled', 'Signups not allowed for this instance');
  }
  throw erroAuth(404, 'not_found', 'Rota de Auth não suportada neste backend local');
}

// ── Roteador ──────────────────────────────────────────────────

const servidor = http.createServer(async (req, res) => {
  const inicio = Date.now();
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return responder(res, 400, { message: 'URL inválida' });
  }
  const caminho = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'OPTIONS') return responder(res, 204);
    let m;
    if ((m = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(caminho))) {
      verificarPerfil(req);
      await rpc(req, res, decodeURIComponent(m[1]));
    } else if ((m = /^\/rest\/v1\/([^/]+)$/.exec(caminho))) {
      await tabela(req, res, decodeURIComponent(m[1]), url);
    } else if (caminho.startsWith('/auth/v1/')) {
      await auth(req, res, caminho, url);
    } else if (caminho === '/' || caminho === '/rest/v1') {
      responder(res, 200, { backend: 'Simulador do Plantão — backend local de ensaio', ok: true });
    } else {
      responder(res, 404, { code: 'PGRST125', details: null, hint: null, message: `Caminho inválido: ${caminho}` });
    }
  } catch (e) {
    const erro = e instanceof ErroHttp ? e : erroDoPostgres(e, 'anon');
    if (!res.headersSent) responder(res, erro.status, erro.corpo);
    else res.end();
  } finally {
    if (process.env.LOG_PEDIDOS !== '0') {
      console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${caminho} ${res.statusCode} ${Date.now() - inicio}ms`);
    }
  }
});

servidor.listen(PORTA, () => {
  console.log(`Backend local no ar em http://localhost:${PORTA}`);
});

function encerrar() {
  servidor.close();
  pool.end().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
