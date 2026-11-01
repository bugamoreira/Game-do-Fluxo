#!/usr/bin/env node
/* global process, console, setTimeout, clearTimeout, fetch, window, document, URL */
// ============================================================
// Ensaio geral com navegadores de verdade (etapa D1).
//
// Sobe o backend local e o Vite apontando para ele, abre o facilitador,
// dois telões (logado e anônimo) e seis grupos (um sétimo tenta entrar depois do início e é recusado),
// joga as duas rodadas clicando na tela e verifica as regras de acesso,
// reconexão, pausa e relatório (docs/design.md §5, docs/pos-mortem-flame.md).
//
//   npm run ensaio
//
// Usa o Playwright instalado globalmente (NODE_PATH), sem dependência nova.
// Variáveis: ENSAIO_SAIDA (pasta de screenshots e do relatório JSON; padrão
// e2e/saida), ENSAIO_PORTA_BACKEND (54421), ENSAIO_PORTA_PG (54429),
// ENSAIO_PORTA_VITE (3310), ENSAIO_GRUPOS (6), ENSAIO_ENCERRAR_CEDO (minuto do
// plantão em que o facilitador encerra cada rodada; padrão 1140 = 19h), ENSAIO_SOM
// (0 = música dos grupos desligada; padrão ligada).
// Duração: cerca de 30 a 40 min (duas rodadas de 12 min reais).
// ============================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.resolve(process.env.ENSAIO_SAIDA || path.join(RAIZ, 'e2e', 'saida'));
const PORTA_BACKEND = Number(process.env.ENSAIO_PORTA_BACKEND || 54421);
const PORTA_PG = Number(process.env.ENSAIO_PORTA_PG || 54429);
const PORTA_VITE = Number(process.env.ENSAIO_PORTA_VITE || 3310);
const N_GRUPOS = Number(process.env.ENSAIO_GRUPOS || 6);
const MINUTO_ENCERRAR = Number(process.env.ENSAIO_ENCERRAR_CEDO || 1140);
// ENSAIO_SOM=0: a música dos grupos nunca liga (AudioContext.resume fica pendente), para
// separar o efeito do Tone.js (D1: laço de recuperação de tiques congela a página) do resto.
const SOM = process.env.ENSAIO_SOM !== '0';
const BACKEND = `http://localhost:${PORTA_BACKEND}`;
const APP = `http://localhost:${PORTA_VITE}`;
const SALA = 'CBMEDE';
const EMAIL = 'facilitador@teste.local';
const SENHA = 'teste1234';
const CHAVE = 'chave-local-ensaio';
const VIEWPORT = { width: 1440, height: 900 };

fs.mkdirSync(SAIDA, { recursive: true });

// ── Registro ──────────────────────────────────────────────────
const inicioEnsaio = Date.now();
const verificacoes = [];
const etapas = [];
const defeitos = [];
const consoleErros = [];
const httpErros = [];
const falhasRede = [];
const screenshots = [];
const notas = [];

function ts() {
  return ((Date.now() - inicioEnsaio) / 1000).toFixed(1).padStart(7);
}
function log(...a) {
  console.log(`[${ts()}s]`, ...a);
}
function verificar(passo, nome, ok, detalhe = '') {
  verificacoes.push({ passo, nome, ok: Boolean(ok), detalhe: String(detalhe) });
  log(`${ok ? 'PASSOU' : 'FALHOU'} [${passo}] ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  return Boolean(ok);
}
function nota(t) {
  notas.push(`[${ts()}s] ${t}`);
  log('NOTA', t);
}
function defeito(titulo, detalhe) {
  defeitos.push({ titulo, detalhe, em: ts() });
  log('DEFEITO', titulo, '—', detalhe);
}
async function etapa(nome, fn) {
  const t0 = Date.now();
  log(`== ${nome}`);
  try {
    return await fn();
  } catch (e) {
    defeito(`Etapa "${nome}" interrompida`, e?.stack?.split('\n').slice(0, 3).join(' | ') ?? String(e));
    return undefined;
  } finally {
    etapas.push({ nome, segundos: Math.round((Date.now() - t0) / 100) / 10 });
  }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** Página congelada não responde a evaluate/count: devolve `seFalhar` depois do prazo. */
function comPrazo(promessa, ms, seFalhar) {
  let id;
  const prazo = new Promise((r) => (id = setTimeout(() => r(seFalhar), ms)));
  return Promise.race([promessa.catch(() => seFalhar), prazo]).finally(() => clearTimeout(id));
}

async function foto(page, nome, inteira = false) {
  const arq = path.join(SAIDA, `d1-${nome}.png`);
  try {
    await page.screenshot({ path: arq, fullPage: inteira, timeout: 15000 });
    screenshots.push(arq);
  } catch (e) {
    nota(`screenshot ${nome} falhou: ${e.message.split('\n')[0]}`);
  }
}

// ── Processos (encerrados pelo PGID) ──────────────────────────
const processos = [];
function subir(nome, cmd, args, env) {
  const arqLog = path.join(SAIDA, `d1-${nome}.log`);
  const fd = fs.openSync(arqLog, 'w');
  const p = spawn(cmd, args, { cwd: RAIZ, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, ...env } });
  processos.push({ nome, pid: p.pid });
  log(`subiu ${nome} (pgid ${p.pid}), log em ${arqLog}`);
  return p;
}
async function encerrarProcessos() {
  for (const { nome, pid } of processos.reverse()) {
    try {
      process.kill(-pid, 'SIGTERM');
      log(`SIGTERM no grupo ${pid} (${nome})`);
    } catch {
      /* já saiu */
    }
  }
  await dormir(4000);
  for (const { pid } of processos) {
    try {
      process.kill(-pid, 0);
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* já saiu */
    }
  }
}
async function esperarUrl(url, ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* ainda não */
    }
    await dormir(500);
  }
  return false;
}

// ── Consultas diretas ao backend (só leitura, para conferir) ──
async function rpc(fn, args) {
  const r = await fetch(`${BACKEND}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: CHAVE },
    body: JSON.stringify(args),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${fn} ${r.status} ${corpo?.message ?? ''}`);
  return corpo;
}
const estadoTurma = () => rpc('estado_turma', { p_codigo: SALA });

/**
 * Código de acesso de 4 dígitos da turma (migração 9), lido como o telão do
 * facilitador lê: login e `codigo_acesso_telao`. Sem turma ainda, '0000' (o
 * servidor responde TURMA_NAO_ENCONTRADA antes de conferir o código).
 */
const acessoCache = { turmaId: null, codigo: null };
async function codigoAcesso() {
  const turma = await estadoTurma().catch(() => null);
  if (!turma?.id) return '0000';
  if (acessoCache.turmaId === turma.id && acessoCache.codigo) return acessoCache.codigo;
  const login = await fetch(`${BACKEND}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: CHAVE },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  }).then((r) => r.json());
  const r = await fetch(`${BACKEND}/rest/v1/rpc/codigo_acesso_telao`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: CHAVE, authorization: `Bearer ${login.access_token}` },
    body: JSON.stringify({ p_turma_id: turma.id }),
  }).then((x) => x.json());
  const codigo = (Array.isArray(r) ? r[0] : r)?.codigo_acesso ?? '0000';
  Object.assign(acessoCache, { turmaId: turma.id, codigo });
  return codigo;
}
const ranking = () => rpc('ranking', { p_codigo: SALA });

// ── Instrumentação das páginas ────────────────────────────────
const SCRIPT_AUDIO = `
(() => {
  const Orig = window.AudioContext;
  if (!Orig) return;
  window.__e2eAudio = [];
  class Espiao extends Orig {
    constructor(...a) { super(...a); window.__e2eAudio.push(this); }
  }
  window.AudioContext = Espiao;
})();`;

const SCRIPT_SEM_SOM = `
(() => {
  if (window.AudioContext) window.AudioContext.prototype.resume = function () { return new Promise(() => {}); };
})();`;

function instrumentarContexto(ctx, rotulo) {
  ctx.on('page', (page) => {
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErros.push({ pagina: rotulo, em: ts(), texto: m.text().slice(0, 300) });
    });
    page.on('pageerror', (e) => consoleErros.push({ pagina: rotulo, em: ts(), texto: `pageerror: ${e.message.slice(0, 300)}` }));
    page.on('response', async (r) => {
      if (r.status() < 400) return;
      const item = { pagina: rotulo, em: ts(), status: r.status(), url: r.url().replace(APP, ''), codigo: '' };
      httpErros.push(item);
      try {
        const corpo = await r.json();
        item.codigo = corpo?.hint || corpo?.message || '';
      } catch {
        /* sem corpo JSON */
      }
    });
    page.on('requestfailed', (r) =>
      falhasRede.push({ pagina: rotulo, em: ts(), url: r.url().replace(APP, ''), erro: r.failure()?.errorText ?? '' }),
    );
  });
}

async function novoContexto(browser, rotulo, { grupo = false } = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  await ctx.addInitScript(SCRIPT_AUDIO);
  if (grupo && !SOM) await ctx.addInitScript(SCRIPT_SEM_SOM);
  instrumentarContexto(ctx, rotulo);
  return ctx;
}

// ── Leituras de tela ──────────────────────────────────────────
function paraMinuto(hhmm) {
  const m = /(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
async function lerRelogio(page) {
  try {
    const t = await page.locator('time[aria-label^="Hora do plantão"]').first().textContent({ timeout: 5000 });
    return paraMinuto(t);
  } catch {
    return null;
  }
}
async function lerPontos(page) {
  try {
    const t = await page.locator('header').filter({ hasText: 'Seu grupo' }).getByText(/^\d+$/).last().textContent({ timeout: 5000 });
    return Number(t);
  } catch {
    return null;
  }
}
async function emPlantao(page) {
  const n = await comPrazo(page.locator('header').filter({ hasText: 'Seu grupo' }).count(), 8000, -1);
  return n > 0;
}
async function textoBanner(page) {
  try {
    const t = await page.locator('[role=status]').filter({ hasText: /Reconectando|Sem conexão/ }).first().textContent({ timeout: 300 });
    return t?.includes('Reconectando') ? 'Reconectando…' : t?.includes('Sem conexão') ? 'Sem conexão' : null;
  } catch {
    return null;
  }
}
const hora = (m) => (m == null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

// ── Grupos-robô ───────────────────────────────────────────────
const grupos = [];
let robosLigados = false;

function novoGrupo(i) {
  return { i, nome: `Grupo ${i}`, ctx: null, page: null, acoes: 0, tentativas: 0, erros: 0, ativo: false, esfriando: new Map(), loop: null };
}

/** Entra pela tela J1. Devolve 'espera' | 'plantao' | 'alerta:<texto>' | 'timeout'. */
async function entrarPelaTela(g, { navegar = true } = {}) {
  if (navegar) await g.page.goto(`${APP}/jogar.html?sala=${SALA}`);
  await g.page.getByLabel('Nome do grupo').fill(g.nome);
  const campoAcesso = g.page.getByLabel('Código de acesso');
  if ((await campoAcesso.count()) > 0) await campoAcesso.fill(await codigoAcesso());
  await g.page.getByRole('button', { name: 'Entrar na sala' }).click();
  return resultadoEntrada(g.page);
}
async function resultadoEntrada(page, ms = 15000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (await emPlantao(page)) return 'plantao';
    if ((await page.getByText('Aguardando o facilitador iniciar o Plantão Travado').count()) > 0) return 'espera';
    const alerta = page.getByRole('alert');
    if ((await alerta.count()) > 0) {
      const t = (await alerta.first().textContent())?.trim();
      if (t) return `alerta:${t}`;
    }
    await dormir(250);
  }
  return 'timeout';
}

const PRIORIDADE_BOTOES = [
  'Dar alta hospitalar',
  'Dar alta da UTI',
  'Descer para a ENF (step-down)',
  'Internar na UTI',
  'Internar na ENF',
  'Levar a um leito da ENF',
  'Transferir pelo NIR',
  'PCP: corredor da ENF',
  'Dar alta do DE',
];
const SETOR_DO_BOTAO = {
  'Internar na UTI': 'Mover para UTI',
  'Internar na ENF': 'Mover para ENF',
  'Descer para a ENF (step-down)': 'Mover para ENF',
  'Levar a um leito da ENF': 'Mover para ENF',
};

/** Escolhe o paciente pela estratégia simples e marca o chip para o clique do Playwright. */
async function marcarCandidato(page, esfriando) {
  return page.evaluate((frios) => {
    document.querySelectorAll('[data-e2e-alvo]').forEach((e) => e.removeAttribute('data-e2e-alvo'));
    const chips = [...document.querySelectorAll('main button[aria-pressed]')];
    const cands = [];
    for (const b of chips) {
      const rot = b.getAttribute('aria-label') || '';
      const nome = rot.split(',')[0];
      if (frios.includes(nome)) continue;
      if (/óbito|transferência em andamento/.test(rot)) continue;
      const sec = b.closest('section');
      const idT = sec?.getAttribute('aria-labelledby');
      const titulo = (idT && document.getElementById(idT)?.textContent) || sec?.getAttribute('aria-label') || '';
      let p = 99;
      if (/Enfermaria|Terapia Intensiva/.test(titulo) && /pronto para alta/.test(rot)) p = 1;
      else if (/^RPA/.test(titulo) && /pronto para sair/.test(rot)) p = 2;
      else if (/Departamento de Emergência/.test(titulo) && /em boarding/.test(rot)) p = 3;
      else if (/Departamento de Emergência/.test(titulo) && /pronto para sair/.test(rot)) p = 4;
      else if (/PCP/.test(titulo)) p = 5;
      if (p < 99) cands.push({ p, nome, b });
    }
    cands.sort((a, b) => a.p - b.p);
    const alvo = cands[0];
    if (!alvo) return null;
    alvo.b.setAttribute('data-e2e-alvo', '1');
    return { nome: alvo.nome, p: alvo.p };
  }, [...esfriando.keys()]);
}

async function jogarUmaVez(g) {
  const page = g.page;
  if (!page || page.isClosed() || !(await emPlantao(page))) return;
  if ((await page.getByText(/O facilitador pausou|Plantão encerrado às 19h/).count()) > 0) return;
  const agora = Date.now();
  for (const [n, ate] of g.esfriando) if (ate < agora) g.esfriando.delete(n);
  const alvo = await marcarCandidato(page, g.esfriando);
  if (!alvo) return;
  g.tentativas += 1;
  try {
    await page.locator('[data-e2e-alvo]').first().click({ timeout: 6000 });
  } catch {
    // o chip pode ter sido recriado (paciente mudou de setor): tenta de novo no próximo ciclo
    g.cliquesPerdidos = (g.cliquesPerdidos ?? 0) + 1;
    return;
  }
  const barra = page.locator('[role=region][aria-label^="Paciente selecionado"]');
  await barra.waitFor({ timeout: 6000 });
  const rotulos = (await barra.getByRole('button').allTextContents()).map((t) => t.trim());
  const escolha = PRIORIDADE_BOTOES.find((b) => rotulos.some((r) => r.startsWith(b)));
  if (!escolha) {
    g.esfriando.set(alvo.nome, agora + 20000);
    await barra.getByRole('button', { name: 'Cancelar' }).click({ timeout: 6000 }).catch(() => {});
    return;
  }
  const setor = SETOR_DO_BOTAO[escolha];
  const botaoSetor = setor ? page.getByRole('button', { name: new RegExp(`^${setor}`) }) : null;
  if (botaoSetor && (await botaoSetor.count()) > 0) await botaoSetor.first().click({ timeout: 6000 });
  else await barra.getByRole('button', { name: new RegExp(`^${escolha.replace(/[()]/g, '\\$&')}`) }).first().click({ timeout: 6000 });
  g.acoes += 1;
  g.esfriando.set(alvo.nome, agora + 4000);
}

function ligarRobo(g) {
  if (g.loop) return;
  g.ativo = true;
  g.loop = (async () => {
    while (robosLigados && g.ativo) {
      try {
        await comPrazo(jogarUmaVez(g), 25000, null);
      } catch (e) {
        g.erros += 1;
        if (g.erros <= 3) nota(`${g.nome}: ação falhou (${e.message.split('\n')[0].slice(0, 120)})`);
        await g.page?.keyboard.press('Escape').catch(() => {});
      }
      await dormir(1800 + Math.random() * 1200);
    }
  })();
}
async function desligarRobo(g) {
  g.ativo = false;
  const l = g.loop;
  g.loop = null;
  if (l) await l;
}

// ── Vigia: detecta página congelada e captura a pilha de chamadas ──
const vigiadas = new Map(); // rótulo -> () => page
const congeladas = new Map(); // rótulo -> { desde, capturada }
let vigiaLigada = false;
function vigiar(rotulo, obterPagina) {
  vigiadas.set(rotulo, obterPagina);
}
async function capturarPilha(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await comPrazo(cdp.send('Debugger.enable'), 8000, null);
    const pausado = new Promise((r) => cdp.once('Debugger.paused', r));
    await comPrazo(cdp.send('Debugger.pause'), 8000, null);
    const ev = await comPrazo(pausado, 8000, null);
    if (!ev) return 'não pausou em 8 s';
    const pilha = ev.callFrames.slice(0, 14).map((f) => `${f.functionName || '(anônima)'} ${f.url.replace(APP, '').split('?')[0]}:${f.location.lineNumber + 1}`);
    await cdp.send('Debugger.resume').catch(() => {});
    return pilha.join(' <- ');
  } finally {
    await cdp.send('Debugger.disable').catch(() => {});
    await cdp.detach().catch(() => {});
  }
}
async function cicloVigia() {
  vigiaLigada = true;
  while (vigiaLigada) {
    await Promise.all(
      [...vigiadas.entries()].map(async ([rotulo, obter]) => {
        const page = obter();
        if (!page || page.isClosed()) return;
        const t0 = Date.now();
        const ok = await comPrazo(page.evaluate(() => 1), 6000, null);
        const estado = congeladas.get(rotulo);
        if (ok === 1) {
          if (estado) {
            nota(`${rotulo} voltou a responder após ${((Date.now() - estado.desde) / 1000).toFixed(0)} s`);
            congeladas.delete(rotulo);
          }
          return;
        }
        if (!estado) {
          congeladas.set(rotulo, { desde: t0, capturada: false });
          nota(`${rotulo} não responde (evaluate > 6 s); carga da máquina ${os.loadavg()[0].toFixed(1)}`);
        } else if (!estado.capturada && Date.now() - estado.desde > 15000) {
          estado.capturada = true;
          const pilha = await capturarPilha(page).catch((e) => `falhou: ${e.message.split('\n')[0]}`);
          defeito(`Página congelada: ${rotulo} (sem responder há ${((Date.now() - estado.desde) / 1000).toFixed(0)} s)`, `pilha: ${pilha}`);
        }
      }),
    );
    await dormir(5000);
  }
}

// ── Facilitador ───────────────────────────────────────────────
let fac = null; // { ctx, page }
let telaoFac = null;
let telaoPub = null;

async function irPara(page, fase) {
  await page.locator('nav, aside').getByRole('button', { name: new RegExp(`^${fase}`) }).first().click({ timeout: 20000 });
}
async function confirmarSeHouver(page, rotulos) {
  const dialogo = page.getByRole('dialog');
  try {
    await dialogo.waitFor({ timeout: 2500 });
  } catch {
    return null;
  }
  const titulo = (await dialogo.locator('h2, h1').first().textContent().catch(() => ''))?.trim();
  for (const r of rotulos) {
    const b = dialogo.getByRole('button', { name: r });
    if ((await b.count()) > 0) {
      await b.first().click();
      return titulo;
    }
  }
  return titulo;
}
async function clicarChamada(page, rotulo) {
  await page.getByRole('button', { name: new RegExp(rotulo) }).first().click({ timeout: 8000 });
}

/** Espera o minuto do servidor chegar a `alvo`. */
async function esperarMinuto(alvo, limiteMs) {
  const fim = Date.now() + limiteMs;
  let t = null;
  while (Date.now() < fim) {
    t = await estadoTurma().catch(() => null);
    if (t && t.minuto >= alvo) return t;
    await dormir(2000);
  }
  return t;
}

async function amostrarRelogios(rotulo) {
  const alvos = [
    ...grupos.filter((g) => g.page && !g.page.isClosed()).map((g) => [g.nome, g.page]),
    ['facilitador', fac.page],
    ['telão logado', telaoFac],
    ['telão anônimo', telaoPub],
  ].filter(([, p]) => p && !p.isClosed());
  const [srv, ...leituras] = await Promise.all([estadoTurma().catch(() => null), ...alvos.map(([, p]) => lerRelogio(p))]);
  const linha = alvos.map(([n], i) => `${n}=${hora(leituras[i])}`).join(' ');
  const validos = leituras.filter((m) => m != null);
  const spread = validos.length ? Math.max(...validos) - Math.min(...validos) : null;
  log(`relógios (${rotulo}): servidor=${hora(srv?.minuto)} ${linha} [carga da máquina ${os.loadavg()[0].toFixed(1)} em ${os.cpus().length} CPUs]`);
  return { servidor: srv?.minuto ?? null, leituras: Object.fromEntries(alvos.map(([n], i) => [n, leituras[i]])), spread, nulos: leituras.filter((m) => m == null).length };
}

// ── Rodada (passos 4 e 6) ─────────────────────────────────────
async function medirInicio(rotuloRodada) {
  const t0 = Date.now();
  const tempos = await Promise.all(
    grupos
      .filter((g) => g.page && !g.page.isClosed())
      .map(async (g) => {
        try {
          await g.page.locator('time[aria-label^="Hora do plantão"]').first().waitFor({ timeout: 20000 });
          await g.page.getByText(rotuloRodada).first().waitFor({ timeout: 5000 });
          return [g.nome, (Date.now() - t0) / 1000];
        } catch {
          return [g.nome, null];
        }
      }),
  );
  return tempos;
}

async function conferirRanking(passo, rodada) {
  const itens = (await ranking().catch(() => [])).filter((i) => i.rodada === rodada);
  const srv = await estadoTurma().catch(() => null);
  const ativos = grupos.filter((g) => g.ativo || g.page);
  const nomes = itens.map((i) => i.nome);
  const faltam = ativos.map((g) => g.nome).filter((n) => !nomes.includes(n));
  verificar(passo, `Placar de todos os grupos chega ao servidor (R${rodada})`, faltam.length === 0, faltam.length ? `faltam: ${faltam.join(', ')}` : `${itens.length} grupos no ranking`);
  const atrasados = itens.filter((i) => srv && srv.minuto - i.minuto > 6).map((i) => `${i.nome}@${hora(i.minuto)}`);
  verificar(passo, `Placar do servidor acompanha o relógio (R${rodada}, atraso ≤ 6 min simulados)`, atrasados.length === 0, `servidor ${hora(srv?.minuto)}; ${atrasados.length ? `atrasados: ${atrasados.join(', ')}` : itens.map((i) => `${i.nome}=${i.pontuacao}@${hora(i.minuto)}`).join(' ')}`);

  // Facilitador (Ao vivo) e telões mostram os nomes com pontuação.
  const txtFac = await fac.page.locator('section[aria-label="Pontuação por grupo"]').innerText({ timeout: 15000 }).catch(() => '');
  const faltamFac = ativos.map((g) => g.nome).filter((n) => !txtFac.toLowerCase().includes(n.toLowerCase()));
  verificar(passo, `Ranking do facilitador mostra todos os grupos (R${rodada})`, faltamFac.length === 0, faltamFac.length ? `faltam: ${faltamFac.join(', ')}` : 'ok');
  for (const [rot, p] of [['telão logado', telaoFac], ['telão anônimo', telaoPub]]) {
    const txt = await p.locator('section[aria-labelledby="telao-ranking"]').innerText({ timeout: 15000 }).catch(() => '');
    const semPlacar = (txt.match(/Aguardando o primeiro placar/g) || []).length;
    const faltamT = ativos.map((g) => g.nome).filter((n) => !txt.includes(n));
    verificar(passo, `Ranking do ${rot} mostra todos os grupos com placar (R${rodada})`, faltamT.length === 0 && semPlacar === 0, `faltam: ${faltamT.join(', ') || 'nenhum'}; sem placar: ${semPlacar}`);
  }
  // Pontos na tela do grupo × pontos no servidor.
  const difs = [];
  for (const g of grupos.filter((x) => x.page && !x.page.isClosed())) {
    const tela = await lerPontos(g.page);
    const srvG = itens.find((i) => i.nome === g.nome);
    if (tela != null && srvG) difs.push(`${g.nome}: tela ${tela} / servidor ${srvG.pontuacao}`);
  }
  nota(`pontos tela × servidor (R${rodada}): ${difs.join('; ')}`);
}

// ── Passo 5: incidentes durante a rodada ──────────────────────
async function incidenteRedeDegradada(g) {
  const srvAntes = await estadoTurma();
  const relAntes = await lerRelogio(g.page);
  await g.ctx.setOffline(true);
  const t0 = Date.now();
  const vistos = new Set();
  let expulso = false;
  let relDurante = null;
  while (Date.now() - t0 < 20000) {
    const b = await textoBanner(g.page);
    if (b) vistos.add(b);
    if (!(await emPlantao(g.page))) expulso = true;
    relDurante = await lerRelogio(g.page);
    await dormir(1000);
  }
  // O facilitador nota a queda?
  const vistoFac = await fac.page.locator('main').innerText().catch(() => '');
  await foto(g.page, '05a-offline-grupo');
  await g.ctx.setOffline(false);
  const tVolta = Date.now();
  verificar('5a', 'Grupo sem rede vê "Reconectando…"', vistos.has('Reconectando…'), `estados vistos: ${[...vistos].join(' → ') || 'nenhum'}`);
  verificar('5a', 'Grupo sem rede não é expulso (continua no plantão)', !expulso && (await emPlantao(g.page)));
  verificar('5a', 'Relógio local continua andando sem rede', relAntes != null && relDurante != null && relDurante - relAntes >= 15, `${hora(relAntes)} → ${hora(relDurante)}`);
  // Volta: banner some e o placar do servidor alcança o relógio.
  let semBanner = null;
  let sincronizado = null;
  while (Date.now() - tVolta < 45000 && (semBanner == null || sincronizado == null)) {
    if (semBanner == null && !(await textoBanner(g.page))) semBanner = (Date.now() - tVolta) / 1000;
    if (sincronizado == null) {
      const [srv, rk] = await Promise.all([estadoTurma(), ranking()]);
      const it = rk.find((i) => i.nome === g.nome && i.rodada === srv.rodada);
      if (it && srv.minuto - it.minuto <= 3) sincronizado = (Date.now() - tVolta) / 1000;
    }
    await dormir(500);
  }
  verificar('5a', 'Banner some depois que a rede volta', semBanner != null, semBanner != null ? `${semBanner.toFixed(1)} s após voltar` : 'não sumiu em 45 s');
  verificar('5a', 'Placar volta a sincronizar (servidor a ≤ 3 min do relógio)', sincronizado != null && sincronizado <= 30, sincronizado != null ? `${sincronizado.toFixed(1)} s após voltar` : 'não sincronizou em 45 s');
  const rel = await lerRelogio(g.page);
  const srvDepois = await estadoTurma();
  verificar('5a', 'Relógio do grupo segue o do servidor após a volta', rel != null && Math.abs(rel - srvDepois.minuto) <= 2, `grupo ${hora(rel)} × servidor ${hora(srvDepois.minuto)} (antes da queda: servidor ${hora(srvAntes.minuto)})`);
  nota(`facilitador durante a queda de ${g.nome}: ${/Visto há|Sem sinal/.test(vistoFac) ? 'mostra o grupo como não conectado' : 'tela "Ao vivo" sem indicação de presença por grupo'}`);
}

async function incidenteFecharReabrir(g) {
  const antes = { pontos: await lerPontos(g.page), relogio: await lerRelogio(g.page) };
  await g.page.close();
  await dormir(5000);
  g.page = await g.ctx.newPage();
  const t0 = Date.now();
  await g.page.goto(`${APP}/jogar.html?sala=${SALA}`);
  const viuReconectando = await g.page.getByText('Reconectando o grupo…').first().isVisible().catch(() => false);
  const r = await resultadoEntrada(g.page, 15000);
  const dt = (Date.now() - t0) / 1000;
  await dormir(1500);
  const depois = { pontos: await lerPontos(g.page), relogio: await lerRelogio(g.page) };
  const srv = await estadoTurma();
  await foto(g.page, '05b-reaberto');
  verificar('5b', 'Aba reaberta no mesmo navegador retoma o plantão sem pedir nome', r === 'plantao', `${r} em ${dt.toFixed(1)} s${viuReconectando ? ' (mostrou "Reconectando o grupo…")' : ''}`);
  verificar('5b', 'Retoma no minuto do servidor', depois.relogio != null && Math.abs(depois.relogio - srv.minuto) <= 2, `grupo ${hora(depois.relogio)} × servidor ${hora(srv.minuto)}; antes de fechar ${hora(antes.relogio)}`);
  verificar('5b', 'Retoma o estado (pontuação coerente com a de antes, sem recomeçar do zero)', depois.pontos != null && antes.pontos != null && Math.abs(depois.pontos - antes.pontos) <= 200, `antes ${antes.pontos}, depois ${depois.pontos}`);
}

async function incidenteOutroComputador(g, browser) {
  const antes = { pontos: await lerPontos(g.page), relogio: await lerRelogio(g.page) };
  await desligarRobo(g);
  await g.ctx.close(); // o computador do grupo "quebrou"
  g.ctx = await novoContexto(browser, `${g.nome} (2º computador)`, { grupo: true });
  g.page = await g.ctx.newPage();
  const r1 = await entrarPelaTela(g);
  await foto(g.page, '05c-recusado');
  verificar('5c', 'Outro computador com o mesmo nome é recusado', r1.startsWith('alerta:'), r1);
  verificar('5c', 'Mensagem certa na recusa', /já está no jogo.*liberar a reconexão/i.test(r1), r1.replace('alerta:', ''));

  // Facilitador libera a reconexão pela tela Sala.
  await irPara(fac.page, 'Sala');
  const linha = fac.page.locator('li').filter({ hasText: g.nome }).first();
  await linha.getByRole('button', { name: 'Liberar reconexão' }).click({ timeout: 20000 });
  const titulo = await confirmarSeHouver(fac.page, ['Liberar reconexão']);
  await fac.page.locator('li').filter({ hasText: g.nome }).getByText('Reconexão liberada').first().waitFor({ timeout: 8000 }).catch(() => {});
  await foto(fac.page, '05c-facilitador-liberou');
  nota(`confirmação de reconexão: ${titulo ?? 'sem diálogo'}`);
  const r2 = await entrarPelaTela(g, { navegar: false });
  await dormir(1500);
  const depois = { pontos: await lerPontos(g.page), relogio: await lerRelogio(g.page) };
  const srv = await estadoTurma();
  await foto(g.page, '05c-restaurado');
  verificar('5c', 'Após "Liberar reconexão", o 2º computador entra no plantão', r2 === 'plantao', r2);
  verificar('5c', 'Restaura no minuto do servidor', depois.relogio != null && Math.abs(depois.relogio - srv.minuto) <= 2, `grupo ${hora(depois.relogio)} × servidor ${hora(srv.minuto)}`);
  verificar('5c', 'Restaura o estado salvo no servidor (pontuação coerente)', depois.pontos != null && antes.pontos != null && Math.abs(depois.pontos - antes.pontos) <= 200, `antes ${antes.pontos}, depois ${depois.pontos}`);
  await irPara(fac.page, 'Ao vivo');
  ligarRobo(g);
}

async function incidenteSetimoGrupo(browser) {
  // Decisão do Gustavo: depois do início nenhum grupo novo entra, sem exceção.
  const g = novoGrupo(grupos.length + 1);
  g.ctx = await novoContexto(browser, g.nome, { grupo: true });
  g.page = await g.ctx.newPage();
  const r1 = await entrarPelaTela(g);
  await foto(g.page, '05d-setimo-recusado');
  verificar('5d', 'Grupo novo no meio da rodada é recusado', r1.startsWith('alerta:') && /começou/.test(r1), r1);
  const noAoVivo = await fac.page.getByRole('button', { name: /Liberar entrada/ }).count();
  await irPara(fac.page, 'Sala');
  const naSala = await fac.page.getByRole('button', { name: /Liberar entrada/ }).count();
  await foto(fac.page, '05d-sala-sem-liberar-entrada');
  await irPara(fac.page, 'Ao vivo');
  verificar('5d', 'Não existe botão de liberar entrada de grupo novo (Ao vivo e Sala)', noAoVivo === 0 && naSala === 0, `Ao vivo ${noAoVivo}, Sala ${naSala}`);
  const r2 = await entrarPelaTela(g, { navegar: false });
  verificar('5d', 'Nova tentativa do grupo novo continua recusada', r2.startsWith('alerta:'), r2);
  await g.ctx.close().catch(() => {});
}

async function incidentePausa() {
  await fac.page.getByRole('button', { name: 'Pausar todos' }).click({ timeout: 20000 });
  await dormir(3000);
  const a = await amostrarRelogios('pausado +3 s');
  await foto(grupos[0].page, '05e-pausado-grupo');
  await foto(telaoPub, '05e-pausado-telao');
  await dormir(6000);
  const b = await amostrarRelogios('pausado +9 s');
  const congelados = Object.keys(a.leituras).filter((k) => a.leituras[k] != null && a.leituras[k] === b.leituras[k]);
  const andaram = Object.keys(a.leituras).filter((k) => a.leituras[k] != null && b.leituras[k] != null && a.leituras[k] !== b.leituras[k]);
  verificar('5e', 'Pausa congela o relógio em todas as telas', andaram.length === 0 && congelados.length >= grupos.length, andaram.length ? `andaram: ${andaram.join(', ')}` : `${congelados.length} telas paradas`);
  verificar('5e', 'Todas as telas pausadas mostram o mesmo horário', a.spread != null && a.spread <= 1, `diferença ${a.spread} min`);
  const avisos = await Promise.all(grupos.map((g) => g.page.getByText('O facilitador pausou o plantão').count().catch(() => 0)));
  verificar('5e', 'Grupos veem o aviso de pausa', avisos.every((n) => n > 0), `${avisos.filter((n) => n > 0).length}/${grupos.length}`);
  await fac.page.getByRole('button', { name: 'Retomar todos' }).click({ timeout: 20000 });
  await dormir(5000);
  const c = await amostrarRelogios('retomado +5 s');
  const voltaram = Object.keys(c.leituras).filter((k) => b.leituras[k] != null && c.leituras[k] != null && c.leituras[k] > b.leituras[k]);
  const saltos = Object.keys(c.leituras).filter((k) => b.leituras[k] != null && c.leituras[k] != null && c.leituras[k] - b.leituras[k] > 8);
  verificar('5e', 'Retomar volta a andar o relógio em todas as telas', voltaram.length >= grupos.length, `${voltaram.length} telas andaram`);
  verificar('5e', 'Retomar não salta o tempo pausado', saltos.length === 0, saltos.length ? `saltaram: ${saltos.join(', ')}` : `servidor ${hora(b.servidor)} → ${hora(c.servidor)}`);
}

// ── Passo de áudio (música no computador do grupo) ────────────
async function conferirAudio(passo) {
  const estados = await Promise.all(
    grupos.map((g) =>
      g.page
        .evaluate(() => (window.__e2eAudio || []).map((c) => ({ estado: c.state, t: c.currentTime })))
        .catch(() => null),
    ),
  );
  if (!SOM) {
    nota('música dos grupos desligada nesta execução (ENSAIO_SOM=0)');
    return;
  }
  const tocando = estados.filter((l) => l && l.some((c) => c.estado === 'running' && c.t > 0)).length;
  verificar(passo, 'Música: contexto de áudio rodando nos computadores dos grupos (após o primeiro clique)', tocando === grupos.length, `${tocando}/${grupos.length} com AudioContext "running"`);
}

// ── Custo de CPU de uma página (fio principal) ──────────────
async function medirCpu(page, rotulo) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const ler = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const a = await ler();
    await dormir(10000);
    const b = await ler();
    const frac = (b.TaskDuration - a.TaskDuration) / (b.Timestamp - a.Timestamp);
    const script = (b.ScriptDuration - a.ScriptDuration) / (b.Timestamp - a.Timestamp);
    nota(`CPU do fio principal (${rotulo}): ${(frac * 100).toFixed(0)}% ocupado (script ${(script * 100).toFixed(0)}%, layout ${(b.LayoutCount - a.LayoutCount)} em 10 s, heap ${(b.JSHeapUsedSize / 1e6).toFixed(0)} MB); carga da máquina ${os.loadavg()[0].toFixed(1)}`);
    await cdp.detach();
  } catch (e) {
    nota(`medição de CPU falhou (${rotulo}): ${e.message.split('\n')[0]}`);
  }
}

// ── Encerrar rodada ───────────────────────────────────────────
async function encerrarRodada(rotuloChamada) {
  const b = fac.page.getByRole('button', { name: new RegExp(rotuloChamada) });
  if ((await b.count()) > 0) await b.first().click();
  else await fac.page.getByRole('button', { name: 'Encerrar rodada' }).click();
  const titulo = await confirmarSeHouver(fac.page, ['Encerrar rodada']);
  return titulo;
}

// ══════════════════════════════════════════════════════════════
async function main() {
  await etapa('1. Subir backend local e Vite', async () => {
    subir('backend', 'bash', ['scripts/backend-local/iniciar.sh'], { PORTA: String(PORTA_BACKEND), PG_PORTA: String(PORTA_PG), LOG_PEDIDOS: '0' });
    subir('vite', 'node', ['node_modules/vite/bin/vite.js', '--port', String(PORTA_VITE), '--strictPort'], {
      BROWSER: 'none',
      VITE_SUPABASE_URL: BACKEND,
      VITE_SUPABASE_KEY: CHAVE,
    });
    const okB = await esperarUrl(`${BACKEND}/auth/v1/settings`, 90000);
    const okV = await esperarUrl(`${APP}/jogar.html`, 60000);
    verificar('1', 'Backend local no ar', okB, BACKEND);
    verificar('1', 'Vite no ar e repassando /rest ao backend', okV && (await esperarUrl(`${APP}/auth/v1/settings`, 10000)), APP);
    if (!okB || !okV) throw new Error('infraestrutura não subiu');
  });

  const browser = await chromium.launch();
  try {
    for (let i = 1; i <= N_GRUPOS; i++) grupos.push(novoGrupo(i));

    // ── Passo 2/3: grupos adiantados, facilitador abre a turma, telões ──
    await etapa('3a. Grupos que chegam antes da turma existir', async () => {
      for (const g of grupos.slice(0, 2)) {
        g.ctx = await novoContexto(browser, g.nome, { grupo: true });
        g.page = await g.ctx.newPage();
        const r = await entrarPelaTela(g);
        verificar('3', `${g.nome} antes da turma: recusa com mensagem clara`, r.startsWith('alerta:') && /não encontrada/i.test(r), r);
      }
      await foto(grupos[0].page, '03a-sem-turma');
    });

    await etapa('2. Facilitador entra, abre a turma e os telões', async () => {
      const ctx = await novoContexto(browser, 'facilitador');
      const page = await ctx.newPage();
      fac = { ctx, page };
      await page.goto(`${APP}/instrutor.html`);
      await page.getByLabel('E-mail').fill(EMAIL);
      await page.getByLabel('Senha').fill(SENHA);
      await page.getByRole('button', { name: /^Entrar/ }).click();
      await page.getByLabel('Nome da turma').waitFor({ timeout: 15000 });
      verificar('2', 'Login do facilitador', true);
      await page.getByLabel('Nome da turma').fill('Ensaio geral D1');
      await page.getByRole('button', { name: 'Abrir turma' }).click();
      const sub = await confirmarSeHouver(page, ['Substituir turma']);
      if (sub) nota(`abrir turma pediu confirmação: ${sub}`);
      await page.getByText('Aguardando os grupos').waitFor({ timeout: 15000 });
      verificar('2', 'Turma CBMEDE aberta', true);
      await foto(page, '02-sala-vazia');
      // Telão pela janela do facilitador (botão "Abrir telão") e telão anônimo.
      const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }), page.getByRole('button', { name: 'Abrir telão' }).click()]);
      telaoFac = popup;
      await telaoFac.setViewportSize(VIEWPORT);
      await telaoFac.waitForLoadState();
      verificar('2', 'Botão "Abrir telão" abre projetor.html?sala=CBMEDE', /projetor\.html\?sala=CBMEDE/.test(telaoFac.url()), telaoFac.url().replace(APP, ''));
      const ctxPub = await novoContexto(browser, 'telão anônimo');
      telaoPub = await ctxPub.newPage();
      await telaoPub.goto(`${APP}/projetor.html?sala=${SALA}`);
      for (const t of [telaoFac, telaoPub]) await t.getByRole('button', { name: 'Ativar som' }).click({ timeout: 8000 }).catch(() => nota('telão sem botão "Ativar som"'));
    });

    await etapa('3b. Seis grupos entram (os adiantados tentam de novo)', async () => {
      for (const g of grupos.slice(0, 2)) {
        const r = await entrarPelaTela(g, { navegar: false });
        verificar('3', `${g.nome} entra depois que a turma abre`, r === 'espera', r);
      }
      for (const g of grupos.slice(2)) {
        g.ctx = await novoContexto(browser, g.nome, { grupo: true });
        g.page = await g.ctx.newPage();
        const r = await entrarPelaTela(g);
        verificar('3', `${g.nome} entra na sala de espera`, r === 'espera', r);
      }
      const prontos = `${N_GRUPOS} grupos prontos`;
      const viu = await fac.page.getByText(prontos).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
      verificar('3', `Facilitador vê "${prontos}"`, viu, viu ? '' : (await fac.page.locator('main').innerText()).slice(0, 200));
      const naEspera = await Promise.all(grupos.map((g) => g.page.getByText(`${N_GRUPOS} grupos na sala`).first().waitFor({ timeout: 10000 }).then(() => true, () => false)));
      verificar('3', `Todos os grupos veem "${N_GRUPOS} grupos na sala"`, naEspera.every(Boolean), `${naEspera.filter(Boolean).length}/${N_GRUPOS}`);
      const txtTelao = await telaoPub.locator('body').innerText();
      const faltam = grupos.map((g) => g.nome).filter((n) => !txtTelao.includes(n));
      verificar('3', 'Telão anônimo lista os grupos que entraram', faltam.length === 0, faltam.length ? `faltam ${faltam.join(', ')}` : '');
      await foto(fac.page, '03b-facilitador-6-prontos');
      await foto(grupos[5].page, '03b-grupo-espera');
      await foto(telaoPub, '03b-telao-abertura');
      // Primeiro gesto em cada grupo: liga o som.
      for (const g of grupos) await g.page.mouse.click(5, 300);
    });

    // ── Passo 4: Travado ─────────────────────────────────────
    let inicioR1 = 0;
    await etapa('4. Iniciar o Plantão Travado', async () => {
      await fac.page.getByRole('button', { name: /Iniciar Plantão Travado/ }).click();
      const dialogo = fac.page.getByRole('dialog');
      const texto = await dialogo.waitFor({ timeout: 5000 }).then(() => dialogo.innerText()).catch(() => '');
      verificar('4', 'Confirmação de "Iniciar Travado" avisa que nenhum grupo novo entra depois e lista os grupos',
        /grupos? conectados?\. Depois de iniciar, nenhum grupo novo poderá entrar\./.test(texto) && grupos.every((g) => texto.includes(g.nome)),
        texto.replace(/\s+/g, ' ').slice(0, 300));
      const conf = await confirmarSeHouver(fac.page, ['Iniciar Plantão Travado', 'Iniciar mesmo assim']);
      if (conf) nota(`confirmação ao iniciar: ${conf}`);
      inicioR1 = Date.now();
      const tempos = await medirInicio('Plantão Travado · Rodada 1');
      const lentos = tempos.filter(([, s]) => s == null || s > 3);
      verificar('4', 'Rodada começa em todos os grupos em até 3 s', lentos.length === 0, tempos.map(([n, s]) => `${n}=${s == null ? 'não começou' : `${s.toFixed(1)}s`}`).join(' '));
      robosLigados = true;
      for (const g of grupos) vigiar(g.nome, () => g.page);
      vigiar('facilitador', () => fac.page);
      vigiar('telão logado', () => telaoFac);
      vigiar('telão anônimo', () => telaoPub);
      void cicloVigia();
      grupos.forEach(ligarRobo);
      await foto(grupos[0].page, '04-travado-inicio');
    });

    await etapa('4b. Relógio igual e placar no ranking', async () => {
      await dormir(20000);
      for (let k = 0; k < 3; k++) {
        const a = await amostrarRelogios(`R1 amostra ${k + 1}`);
        verificar('4', `Relógio igual em todas as telas (amostra ${k + 1}, diferença ≤ 2 min)`, a.spread != null && a.spread <= 2 && a.nulos === 0 && Math.abs(Object.values(a.leituras)[0] - a.servidor) <= 2, `diferença ${a.spread} min; servidor ${hora(a.servidor)}; telas sem relógio ${a.nulos}`);
        await dormir(7000);
      }
      await conferirRanking('4', 1);
      await conferirAudio('4');
      await medirCpu(grupos[0].page, grupos[0].nome);
      await medirCpu(telaoPub, 'telão anônimo');
      await foto(fac.page, '04-facilitador-ao-vivo');
      await foto(telaoFac, '04-telao-logado');
      await foto(telaoPub, '04-telao-anonimo');
      await foto(grupos[1].page, '04-grupo-jogando');
      nota(`ações dos robôs até agora: ${grupos.map((g) => `${g.nome}=${g.acoes}/${g.tentativas}`).join(' ')}`);
    });

    await etapa('5a. Rede degradada (20 s offline)', () => incidenteRedeDegradada(grupos[1]));
    await etapa('5b. Fechar e reabrir a aba', async () => {
      const g = grupos[3];
      await desligarRobo(g);
      await incidenteFecharReabrir(g);
      ligarRobo(g);
    });
    await etapa('5c. Reconectar em outro computador', () => incidenteOutroComputador(grupos[2], browser));
    await etapa('5d. Sétimo grupo recusado depois do início', () => incidenteSetimoGrupo(browser));
    await etapa('5e. Pausar e retomar', () => incidentePausa());

    await etapa('4c. Placar no meio da rodada (com o 7º grupo)', async () => {
      await dormir(8000);
      await conferirRanking('4', 1);
      const a = await amostrarRelogios('R1 após incidentes');
      verificar('4', 'Relógio igual em todas as telas após os incidentes', a.spread != null && a.spread <= 2, `diferença ${a.spread} min`);
    });

    // ── Passo 6: fim do Travado, debrief, Lean, resultado, relatório ──
    await etapa('6a. Jogar o Travado até o fim e encerrar', async () => {
      const t = await esperarMinuto(MINUTO_ENCERRAR, 15 * 60 * 1000);
      nota(`R1 chegou a ${hora(t?.minuto)} após ${((Date.now() - inicioR1) / 1000).toFixed(0)} s reais`);
      await dormir(4000); // último envio às 19h
      await foto(grupos[0].page, '06a-travado-19h');
      const rk = (await ranking()).filter((i) => i.rodada === 1);
      verificar('6', 'Placar final da R1 de todos os grupos registrado às 19h', rk.length === grupos.length && rk.every((i) => i.minuto >= MINUTO_ENCERRAR - 2), rk.map((i) => `${i.nome}=${i.pontuacao}@${hora(i.minuto)}`).join(' '));
      const conf = await encerrarRodada('Encerrar e ir para o debrief');
      nota(`confirmação ao encerrar R1: ${conf ?? 'nenhuma'}`);
      const t0 = Date.now();
      const chegaram = await Promise.all(grupos.map((g) => g.page.getByText('Fim da rodada 1 · Plantão Travado').first().waitFor({ timeout: 15000 }).then(() => (Date.now() - t0) / 1000, () => null)));
      verificar('6', 'Todos os grupos vão para o debrief (J4) em até 3 s', chegaram.every((s) => s != null && s <= 3), grupos.map((g, i) => `${g.nome}=${chegaram[i] == null ? 'não' : chegaram[i].toFixed(1) + 's'}`).join(' '));
      const telaoDebrief = await telaoPub.getByText('Onde o plantão travou?').waitFor({ timeout: 10000 }).then(() => true, () => false);
      verificar('6', 'Telão vai para o debrief', telaoDebrief);
      const facDebrief = await fac.page.getByRole('heading', { name: 'Debrief do Plantão Travado' }).waitFor({ timeout: 10000 }).then(() => true, () => false);
      verificar('6', 'Facilitador vai para o debrief', facDebrief);
      await dormir(2000);
      await foto(grupos[0].page, '06a-grupo-debrief');
      await foto(fac.page, '06a-facilitador-debrief', true);
      await foto(telaoPub, '06a-telao-debrief');
    });

    let inicioR2 = 0;
    await etapa('6b. Iniciar o Plantão Lean', async () => {
      await clicarChamada(fac.page, 'Iniciar Plantão Lean');
      const conf = await confirmarSeHouver(fac.page, ['Iniciar mesmo assim']);
      if (conf) nota(`iniciar o Lean pediu confirmação (há grupo sem conexão): ${conf}`);
      inicioR2 = Date.now();
      const tempos = await medirInicio('Plantão Lean · Rodada 2');
      verificar('6', 'Lean começa em todos os grupos em até 3 s', tempos.every(([, s]) => s != null && s <= 3), tempos.map(([n, s]) => `${n}=${s == null ? 'não começou' : `${s.toFixed(1)}s`}`).join(' '));
      await dormir(15000);
      const a = await amostrarRelogios('R2');
      verificar('6', 'Relógio igual em todas as telas na R2', a.spread != null && a.spread <= 2 && a.nulos === 0, `diferença ${a.spread} min; nulos ${a.nulos}`);
      await foto(grupos[0].page, '06b-lean');
    });

    await etapa('6c. Liberar o PCP', async () => {
      await esperarMinuto(660, 6 * 60 * 1000);
      await fac.page.getByRole('button', { name: 'Liberar PCP (Full Capacity)' }).first().click({ timeout: 20000 });
      const t0 = Date.now();
      const viram = await Promise.all(grupos.map((g) => g.page.getByText(/Autorizado: \d+ vagas/).first().waitFor({ timeout: 10000 }).then(() => (Date.now() - t0) / 1000, () => null)));
      verificar('6', 'PCP liberado chega a todos os grupos em até 3 s', viram.every((s) => s != null && s <= 3), grupos.map((g, i) => `${g.nome}=${viram[i] == null ? 'não' : viram[i].toFixed(1) + 's'}`).join(' '));
      await foto(grupos[0].page, '06c-pcp-liberado');
      await conferirRanking('6', 2);
    });

    await etapa('6d. Jogar o Lean até o fim e encerrar', async () => {
      const t = await esperarMinuto(MINUTO_ENCERRAR, 15 * 60 * 1000);
      nota(`R2 chegou a ${hora(t?.minuto)} após ${((Date.now() - inicioR2) / 1000).toFixed(0)} s reais`);
      await dormir(4000);
      const rk = (await ranking()).filter((i) => i.rodada === 2);
      verificar('6', 'Placar final da R2 de todos os grupos registrado às 19h', rk.length === grupos.length && rk.every((i) => i.minuto >= MINUTO_ENCERRAR - 2), rk.map((i) => `${i.nome}=${i.pontuacao}@${hora(i.minuto)}`).join(' '));
      robosLigados = false;
      await Promise.all(grupos.map(desligarRobo));
      nota(`ações dos robôs (total): ${grupos.map((g) => `${g.nome}=${g.acoes}/${g.tentativas} (erros ${g.erros}, cliques perdidos ${g.cliquesPerdidos ?? 0})`).join(' ')}`);
      await encerrarRodada('Encerrar e ver o resultado');
      const t0 = Date.now();
      const chegaram = await Promise.all(grupos.map((g) => g.page.getByText('Resultado final').first().waitFor({ timeout: 15000 }).then(() => (Date.now() - t0) / 1000, () => null)));
      verificar('6', 'Todos os grupos vão para o resultado (J6) em até 3 s', chegaram.every((s) => s != null && s <= 3), grupos.map((g, i) => `${g.nome}=${chegaram[i] == null ? 'não' : chegaram[i].toFixed(1) + 's'}`).join(' '));
      const podio = await telaoPub.getByText(/1º lugar|Pódio/).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
      verificar('6', 'Telão mostra o pódio', podio);
      await dormir(6000);
      const txtR = await grupos[0].page.locator('body').innerText();
      verificar('6', 'Resultado do grupo mostra R1 e R2', /Rodada 1|Travado/.test(txtR) && /Rodada 2|Lean/.test(txtR), txtR.replace(/\s+/g, ' ').slice(0, 160));
      await foto(grupos[0].page, '06d-grupo-resultado', true);
      await foto(fac.page, '06d-facilitador-resultado', true);
      await foto(telaoPub, '06d-telao-podio');
    });

    await etapa('6e. Gerar e abrir o relatório', async () => {
      await clicarChamada(fac.page, 'Gerar relatório');
      const campo = fac.page.locator('#link-relatorio');
      await campo.waitFor({ timeout: 15000 });
      const link = await campo.inputValue();
      const slug = new URL(link).searchParams.get('r');
      verificar('6', 'Relatório gerado com link', Boolean(slug), link.replace(APP, ''));
      const ctx = await novoContexto(browser, 'relatório anônimo');
      const page = await ctx.newPage();
      await page.goto(`${APP}/relatorio.html?r=${slug}`);
      await page.getByText('Ranking final e pódio').first().waitFor({ timeout: 20000 }).catch(() => {});
      await dormir(2000);
      const txt = await page.locator('body').innerText();
      verificar('6', 'Relatório carrega num navegador sem login', /Ranking final e pódio/.test(txt), txt.slice(0, 120).replace(/\s+/g, ' '));
      verificar('6', 'Relatório mostra o facilitador', /Facilitador de Teste/.test(txt));
      const faltam = grupos.map((g) => g.nome).filter((n) => !txt.includes(n));
      verificar('6', 'Relatório traz o ranking com todos os grupos', faltam.length === 0, faltam.length ? `faltam ${faltam.join(', ')}` : `${grupos.length} grupos`);
      verificar('6', 'Relatório traz o comparativo R1 × R2', /Desempenho de cada grupo/.test(txt) && /Travado/.test(txt) && /Lean/.test(txt));
      verificar('6', 'Relatório traz a evolução ao longo do plantão', /Evolução ao longo do plantão/.test(txt) && (await page.locator('svg').count()) > 0, `${await page.locator('svg').count()} gráficos SVG`);
      verificar('6', 'Relatório traz a carga do gestor', /Carga do gestor/.test(txt));
      await foto(page, '06e-relatorio', true);
    });
  } finally {
    vigiaLigada = false;
    robosLigados = false;
    await Promise.all(grupos.map((g) => desligarRobo(g).catch(() => {})));
    await browser.close().catch(() => {});
  }
}

let codigoSaida = 0;
const guarda = setTimeout(() => {
  defeito('Ensaio estourou o tempo máximo (75 min)', 'encerrando');
  finalizar().then(() => process.exit(3));
}, 75 * 60 * 1000);

let finalizado = false;
async function finalizar() {
  if (finalizado) return;
  finalizado = true;
  clearTimeout(guarda);
  await encerrarProcessos();
  const falhas = verificacoes.filter((v) => !v.ok);
  const resumo = {
    duracaoMin: Math.round((Date.now() - inicioEnsaio) / 600) / 100,
    passou: verificacoes.length - falhas.length,
    falhou: falhas.length,
    verificacoes,
    etapas,
    defeitos,
    notas,
    consoleErros,
    httpErros,
    falhasRede: { total: falhasRede.length, amostra: falhasRede.slice(0, 20) },
    screenshots,
  };
  fs.writeFileSync(path.join(SAIDA, 'd1-resultado.json'), JSON.stringify(resumo, null, 2));
  console.log('\n══════ RESUMO ══════');
  for (const e of etapas) console.log(`  ${String(e.segundos).padStart(7)} s  ${e.nome}`);
  console.log(`\n${resumo.passou} passou, ${resumo.falhou} falhou em ${resumo.duracaoMin} min`);
  for (const f of falhas) console.log(`  FALHOU [${f.passo}] ${f.nome} — ${f.detalhe}`);
  console.log(`erros de console: ${consoleErros.length}; respostas HTTP ≥ 400: ${httpErros.length}; requisições falhas: ${falhasRede.length}`);
  console.log(`resultado completo em ${path.join(SAIDA, 'd1-resultado.json')}`);
  codigoSaida = falhas.length || defeitos.length ? 1 : 0;
}

process.on('SIGINT', () => finalizar().then(() => process.exit(130)));
process.on('SIGTERM', () => finalizar().then(() => process.exit(143)));

main()
  .catch((e) => defeito('Erro fatal no ensaio', e?.stack ?? String(e)))
  .finally(async () => {
    await finalizar();
    process.exit(codigoSaida);
  });
