#!/usr/bin/env node
/* global process, console */
// Teste de fumaça do backend local, com o próprio @supabase/supabase-js.
// Pré-requisito: `npm run backend:local` no ar em outro terminal.
//
//   node scripts/backend-local/fumaca.mjs
//
// Variáveis: BACKEND_URL (padrão http://localhost:54321), CHAVE (padrão
// chave-local-ensaio), FACILITADOR_EMAIL, FACILITADOR_SENHA, CODIGO (padrão CBMEDE).
// Abre a turma com p_substituir = true: se já houver uma turma CBMEDE no banco
// local, ela é arquivada (nada é apagado). Não aponte para o Supabase real.

import { createClient } from '@supabase/supabase-js';

const URL_BASE = process.env.BACKEND_URL || 'http://localhost:54321';
const CHAVE = process.env.CHAVE || 'chave-local-ensaio';
const EMAIL = process.env.FACILITADOR_EMAIL || 'facilitador@teste.local';
const SENHA = process.env.FACILITADOR_SENHA || 'teste1234';
const CODIGO = process.env.CODIGO || 'CBMEDE';

if (/supabase\.co/.test(URL_BASE)) {
  console.error('Este teste é só para o backend local.');
  process.exit(2);
}

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const facilitador = createClient(URL_BASE, CHAVE, opcoes);
const publico = createClient(URL_BASE, CHAVE, opcoes);

const etapas = [];
let ctx = {};

async function etapa(nome, fn) {
  try {
    const detalhe = await fn();
    etapas.push({ nome, ok: true, detalhe: detalhe ?? '' });
  } catch (e) {
    etapas.push({ nome, ok: false, detalhe: e.message });
  }
}

async function rpc(cliente, fn, args) {
  const { data, error, status } = await cliente.rpc(fn, args);
  if (error) throw new Error(`${status} ${error.code} ${error.message}${error.details ? ` (${error.details})` : ''}`);
  return data;
}

function exigir(cond, msg) {
  if (!cond) throw new Error(msg);
}

await etapa('Login do facilitador', async () => {
  const { data, error } = await facilitador.auth.signInWithPassword({ email: EMAIL, password: SENHA });
  if (error) throw new Error(error.message);
  exigir(data.session?.access_token && data.user?.email === EMAIL, 'sessão sem token ou e-mail');
  return data.user.id;
});

await etapa('Login com senha errada é recusado', async () => {
  const outro = createClient(URL_BASE, CHAVE, opcoes);
  const { error } = await outro.auth.signInWithPassword({ email: EMAIL, password: `${SENHA}x` });
  exigir(error, 'senha errada foi aceita');
  return error.message;
});

await etapa('Sessão: GET /auth/v1/user', async () => {
  const { data, error } = await facilitador.auth.getUser();
  if (error) throw new Error(error.message);
  exigir(data.user?.email === EMAIL, 'usuário diferente');
});

await etapa(`abrir_turma ${CODIGO}`, async () => {
  const t = await rpc(facilitador, 'abrir_turma', {
    p_codigo: CODIGO,
    p_nome: 'Ensaio local',
    p_evento: 'Ensaio geral',
    p_data: null,
    p_substituir: true,
  });
  exigir(t?.status === 'aberta' && t.id, `status ${t?.status}`);
  exigir(/^[0-9]{4}$/.test(t.codigo_acesso ?? ''), 'abrir_turma sem código de acesso');
  ctx.turmaId = t.id;
  ctx.acesso = t.codigo_acesso;
  return `${t.id} (código de acesso ${t.codigo_acesso})`;
});

await etapa('abrir_turma sem login é recusada', async () => {
  const { error, status } = await publico.rpc('abrir_turma', { p_codigo: 'HACK', p_nome: 'Invasor' });
  exigir(error && status === 401 && error.code === '42501', `esperava 401/42501, veio ${status} ${error?.code}`);
});

await etapa('Grupo sem código de acesso, ou com código errado, não entra', async () => {
  const { error, status } = await publico.rpc('entrar_grupo', { p_codigo: CODIGO, p_nome: 'Sem Codigo' });
  exigir(error && status === 400 && error.code === 'CB014' && error.message === 'CODIGO_ACESSO_INVALIDO', `veio ${status} ${JSON.stringify(error)}`);
  const errado = String((Number(ctx.acesso) + 1) % 10000).padStart(4, '0');
  const r = await rpc(publico, 'entrar_grupo', { p_codigo: CODIGO, p_nome: 'Codigo Errado', p_acesso: errado });
  exigir(r?.erro === 'CODIGO_ACESSO_INVALIDO' && !r.token, JSON.stringify(r));
  const s = await rpc(publico, 'estado_turma', { p_codigo: CODIGO });
  exigir(!('codigo_acesso' in s), 'estado_turma expôs o código de acesso');
});

await etapa('Dois grupos entram', async () => {
  const sufixo = Date.now().toString(36).slice(-4);
  const a = await rpc(publico, 'entrar_grupo', { p_codigo: CODIGO, p_nome: `Grupo A ${sufixo}`, p_acesso: ctx.acesso });
  const b = await rpc(publico, 'entrar_grupo', { p_codigo: CODIGO, p_nome: `Grupo B ${sufixo}`, p_token: null, p_acesso: ctx.acesso });
  exigir(a.token?.length === 43 && b.token?.length === 43 && a.token !== b.token, 'tokens inválidos');
  ctx = { ...ctx, tokA: a.token, tokB: b.token, nomeA: a.grupo.nome };
  return `${a.grupo.nome}, ${b.grupo.nome}`;
});

await etapa('Erro de negócio no formato do PostgREST (GRUPO_JA_ATIVO)', async () => {
  const { error, status } = await publico.rpc('entrar_grupo', { p_codigo: CODIGO, p_nome: ctx.nomeA, p_acesso: ctx.acesso });
  exigir(error, 'deveria recusar');
  exigir(
    status === 400 && error.code === 'CB003' && error.message === 'GRUPO_JA_ATIVO' && error.hint === 'GRUPO_JA_ATIVO' && error.details,
    `veio ${status} ${JSON.stringify(error)}`,
  );
  return error.details;
});

await etapa('Iniciar rodada 1', async () => {
  const t = await rpc(facilitador, 'mudar_status', { p_turma_id: ctx.turmaId, p_status: 'rodada1' });
  exigir(t.status === 'rodada1' && t.rodada === 1, `status ${t.status}`);
});

await etapa('enviar_estado (rodada 1)', async () => {
  const ra = await rpc(publico, 'enviar_estado', {
    p_token: ctx.tokA, p_rodada: 1, p_minuto: 421, p_versao: 1,
    p_estado: { pacientes: [] }, p_pontuacao: 10, p_metricas: { obitos: 0 },
  });
  const rb = await rpc(publico, 'enviar_estado', {
    p_token: ctx.tokB, p_rodada: 1, p_minuto: 421, p_versao: 1,
    p_estado: { pacientes: [1] }, p_pontuacao: 25.5, p_metricas: {},
  });
  exigir(String(ra.versao) === '1' && String(rb.versao) === '1', 'versão não confere');
});

await etapa('obter_estado devolve o estado salvo', async () => {
  const e = await rpc(publico, 'obter_estado', { p_token: ctx.tokA, p_rodada: 1 });
  exigir(Array.isArray(e?.estado?.pacientes), JSON.stringify(e));
});

await etapa('estado_turma (público, com token)', async () => {
  const s = await rpc(publico, 'estado_turma', { p_codigo: CODIGO, p_token: ctx.tokA });
  exigir(s.status === 'rodada1' && s.grupos.length === 2 && s.hora_servidor && s.token_valido === true, JSON.stringify(s).slice(0, 120));
  return `minuto ${s.minuto}`;
});

await etapa('ranking', async () => {
  const r = await rpc(publico, 'ranking', { p_codigo: CODIGO });
  exigir(Array.isArray(r) && r.length >= 2, JSON.stringify(r).slice(0, 120));
  return r.map((x) => `${x.nome}:${x.pontuacao}`).join(' > ');
});

await etapa('registrar_serie e registrar_eventos (grupo)', async () => {
  const s = await rpc(publico, 'registrar_serie', {
    p_token: ctx.tokA, p_rodada: 1, p_minuto: 450, p_metricas: { deOcc: 9, boarding: 2 },
  });
  const e = await rpc(publico, 'registrar_eventos', {
    p_token: ctx.tokA, p_rodada: 1,
    p_eventos: [{ minuto: 455, tipo: 'surto', mensagem: 'Surto de chegadas', chave: 'f1' }],
  });
  exigir(s.registrado === true && e.inseridos === 1, JSON.stringify({ s, e }));
});

await etapa('painel_turma (facilitador)', async () => {
  const t = await rpc(facilitador, 'painel_turma', { p_turma_id: ctx.turmaId });
  exigir(t.status === 'rodada1' && t.grupos.every((g) => 'visto_em' in g && 'removido' in g), JSON.stringify(t).slice(0, 120));
  return `${t.grupos.length} grupos`;
});

await etapa('series_turma e eventos_turma (facilitador)', async () => {
  const s = await rpc(facilitador, 'series_turma', { p_turma_id: ctx.turmaId, p_rodada: null });
  const e = await rpc(facilitador, 'eventos_turma', { p_turma_id: ctx.turmaId, p_desde_minuto: null, p_rodada: 1, p_limite: 20 });
  exigir(s.length === 1 && s[0].metricas.deOcc === 9 && e.length === 1 && e[0].tipo === 'surto', JSON.stringify({ s, e }).slice(0, 160));
});

await etapa('Leituras do facilitador sem login são recusadas', async () => {
  for (const fn of ['painel_turma', 'series_turma', 'eventos_turma']) {
    const { error, status } = await publico.rpc(fn, { p_turma_id: ctx.turmaId });
    exigir(error && status === 401 && error.code === '42501', `${fn}: esperava 401/42501, veio ${status} ${error?.code}`);
  }
});

await etapa('Encerrar rodada 1 (debrief)', async () => {
  const t = await rpc(facilitador, 'mudar_status', { p_turma_id: ctx.turmaId, p_status: 'debrief' });
  exigir(t.status === 'debrief', t.status);
});

await etapa('Iniciar o Lean nos 30 s de tolerância do Travado é recusado', async () => {
  const { error } = await facilitador.rpc('mudar_status', { p_turma_id: ctx.turmaId, p_status: 'rodada2' });
  exigir(error && error.message === 'TRANSICAO_INVALIDA', JSON.stringify(error));
  await new Promise((r) => setTimeout(r, 31_000));
  return error.details;
});

await etapa('Iniciar rodada 2 (Lean)', async () => {
  const t = await rpc(facilitador, 'mudar_status', { p_turma_id: ctx.turmaId, p_status: 'rodada2' });
  exigir(t.status === 'rodada2' && t.rodada === 2, t.status);
});

await etapa('enviar_estado (rodada 2)', async () => {
  for (const [tok, pts] of [[ctx.tokA, 40], [ctx.tokB, 30]]) {
    const r = await rpc(publico, 'enviar_estado', {
      p_token: tok, p_rodada: 2, p_minuto: 421, p_versao: 2,
      p_estado: { lean: true }, p_pontuacao: pts, p_metricas: {},
    });
    exigir(String(r.versao) === '2', JSON.stringify(r));
  }
});

await etapa('Encerrar rodada 2', async () => {
  const t = await rpc(facilitador, 'mudar_status', { p_turma_id: ctx.turmaId, p_status: 'encerrada' });
  exigir(t.status === 'encerrada', t.status);
});

await etapa('gerar_relatorio', async () => {
  const r = await rpc(facilitador, 'gerar_relatorio', { p_turma_id: ctx.turmaId });
  exigir(r.slug?.length === 24 && r.turma?.status === 'arquivada', JSON.stringify(r).slice(0, 120));
  ctx.slug = r.slug;
  return r.slug;
});

await etapa('obter_relatorio (público, pelo slug)', async () => {
  const r = await rpc(publico, 'obter_relatorio', { p_slug: ctx.slug });
  exigir(r.slug === ctx.slug && r.dados, 'relatório sem dados');
  exigir(typeof r.dados.facilitador === 'string' && typeof r.dados.local === 'string', 'relatório sem facilitador ou local');
  return Object.keys(r.dados).join(', ');
});

await etapa('Logout', async () => {
  const { error } = await facilitador.auth.signOut();
  if (error) throw new Error(error.message);
});

const larg = Math.max(...etapas.map((e) => e.nome.length));
for (const e of etapas) console.log(`${e.ok ? 'PASSOU' : 'FALHOU'}  ${e.nome.padEnd(larg)}  ${e.detalhe}`);
const falhas = etapas.filter((e) => !e.ok).length;
console.log(`\n${etapas.length} etapas, ${falhas} falha(s).`);
process.exit(falhas ? 1 : 0);
