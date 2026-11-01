import './landing.css';
import { pingGameServer } from './connectivityService';

type CheckState = 'idle' | 'running' | 'ok' | 'warn' | 'fail';

const SERVER_TIMEOUT_MS = 8000;
const SLOW_SERVER_MS = 1500;
const MIN_WIDTH_OK = 1280;
const MIN_WIDTH_WARN = 1024;

function setCheck(id: string, state: CheckState, msg: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.state = state;
  const msgEl = el.querySelector('.check__msg');
  if (msgEl) msgEl.textContent = msg;
}

function checkBrowser(): CheckState {
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isEdge = /Edg\//.test(ua);
  const isChrome = /Chrome\//.test(ua) && !isEdge && !/OPR\//.test(ua);
  if (isMobile) {
    setCheck('chk-browser', 'fail', 'Celular ou tablet detectado. Use um notebook ou desktop.');
    return 'fail';
  }
  if (isChrome || isEdge) {
    setCheck('chk-browser', 'ok', isEdge ? 'Microsoft Edge' : 'Google Chrome');
    return 'ok';
  }
  setCheck('chk-browser', 'warn', 'Funciona, mas o recomendado é Chrome ou Edge.');
  return 'warn';
}

function checkScreen(): CheckState {
  const w = window.innerWidth;
  if (w >= MIN_WIDTH_OK) {
    setCheck('chk-screen', 'ok', `Largura de ${w}px.`);
    return 'ok';
  }
  if (w >= MIN_WIDTH_WARN) {
    setCheck('chk-screen', 'warn', `Largura de ${w}px. Maximize a janela ou use tela cheia (F11).`);
    return 'warn';
  }
  setCheck('chk-screen', 'fail', `Largura de ${w}px. A tela é pequena demais para o jogo.`);
  return 'fail';
}

async function checkServer(): Promise<CheckState> {
  setCheck('chk-server', 'running', 'Testando…');
  const result = await pingGameServer(SERVER_TIMEOUT_MS);
  if (!result.ok) {
    const msg = result.reason === 'config'
      ? 'Teste indisponível nesta versão do site. Avise o facilitador.'
      : 'Sem conexão com o servidor do jogo. Troque para o 5G do celular e teste de novo.';
    setCheck('chk-server', 'fail', msg);
    return 'fail';
  }
  if (result.ms > SLOW_SERVER_MS) {
    setCheck('chk-server', 'warn', `Conectado, mas lento (${result.ms} ms). Se puder, troque de rede.`);
    return 'warn';
  }
  setCheck('chk-server', 'ok', `Conectado (${result.ms} ms).`);
  return 'ok';
}

function playBeep(): boolean {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    setTimeout(() => void ctx.close(), 1200);
    return true;
  } catch {
    return false;
  }
}

const results: Record<string, CheckState> = {};

function updateSummary(): void {
  const el = document.getElementById('test-summary');
  if (!el) return;
  const states = Object.values(results);
  if (states.length < 4 || states.includes('running') || states.includes('idle')) {
    el.textContent = '';
    el.dataset.state = '';
    return;
  }
  if (states.includes('fail')) {
    el.textContent = 'Há um problema que impede o jogo. Veja a mensagem em vermelho.';
    el.dataset.state = 'fail';
  } else if (states.includes('warn')) {
    el.textContent = 'Dá para jogar. Veja as recomendações em amarelo.';
    el.dataset.state = 'warn';
  } else {
    el.textContent = 'Tudo certo! Este computador está pronto para o jogo.';
    el.dataset.state = 'ok';
  }
}

async function runTest(): Promise<void> {
  const btn = document.getElementById('btn-test') as HTMLButtonElement | null;
  const confirm = document.getElementById('sound-confirm');
  if (btn) btn.disabled = true;

  results.browser = checkBrowser();
  results.screen = checkScreen();
  results.sound = 'running';
  setCheck('chk-sound', 'running', 'Tocando um sinal curto…');
  updateSummary();

  if (playBeep()) {
    if (confirm) confirm.hidden = false;
  } else {
    results.sound = 'warn';
    setCheck('chk-sound', 'warn', 'Não foi possível tocar som neste navegador.');
  }

  results.server = 'running';
  results.server = await checkServer();
  updateSummary();
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Testar de novo';
  }
}

function answerSound(heard: boolean): void {
  const confirm = document.getElementById('sound-confirm');
  if (confirm) confirm.hidden = true;
  results.sound = heard ? 'ok' : 'warn';
  setCheck('chk-sound', results.sound, heard ? 'Som funcionando.' : 'Confira o volume e se a aba não está silenciada. O som não é obrigatório.');
  updateSummary();
}

document.getElementById('btn-test')?.addEventListener('click', () => void runTest());
document.getElementById('btn-heard')?.addEventListener('click', () => answerSound(true));
document.getElementById('btn-not-heard')?.addEventListener('click', () => answerSound(false));
