// Formulário da pesquisa (celular). Uma seção por tela, só o NPS obrigatório.
// Envio duplo no mesmo aparelho é barrado pelo localStorage (com try/catch).
import './pesquisa.css';
import { satisfacaoService, TURMA_PESQUISA } from '../shared/services/satisfacaoService';
import { mensagemErro, el, lerLocal, gravarLocal } from './util';
import { SECOES, type Pergunta } from './perguntas';

const CHAVE_ENVIADA = `pesquisa-${TURMA_PESQUISA}-enviada`;
const CHAVE_RASCUNHO = `pesquisa-${TURMA_PESQUISA}-rascunho`;

type Valor = number | string | boolean;
const respostas: Record<string, Valor> = carregarRascunho();
let passo = 0;
let enviando = false;

const raiz = document.getElementById('app');
if (!raiz) throw new Error('#app ausente');

function carregarRascunho(): Record<string, Valor> {
  const bruto = lerLocal(CHAVE_RASCUNHO);
  if (!bruto) return {};
  try {
    const obj: unknown = JSON.parse(bruto);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const limpo: Record<string, Valor> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') limpo[k] = v;
    }
    return limpo;
  } catch {
    return {};
  }
}

function salvarRascunho() {
  gravarLocal(CHAVE_RASCUNHO, JSON.stringify(respostas));
}

function definir(campo: string, valor: Valor | undefined) {
  if (valor === undefined || valor === '') delete respostas[campo];
  else respostas[campo] = valor;
  salvarRascunho();
}

function botaoEscolha(rotulo: string, ativo: boolean, aoClicar: () => void, classe = 'b'): HTMLButtonElement {
  const b = el('button', { class: classe, type: 'button', 'aria-pressed': String(ativo) }, rotulo) as HTMLButtonElement;
  b.addEventListener('click', aoClicar);
  return b;
}

function legenda(par?: [string, string]): HTMLElement | null {
  if (!par) return null;
  return el('div', { class: 'legenda' }, el('span', {}, par[0]), el('span', {}, par[1]));
}

function escalaNotas(campo: string, max: number, min: number): HTMLElement {
  const div = el('div', { class: `escala ${max === 10 ? 'escala-11' : 'escala-5'}`, role: 'group' });
  for (let v = min; v <= max; v++) {
    div.append(
      botaoEscolha(String(v), respostas[campo] === v, () => {
        definir(campo, respostas[campo] === v && campo !== 'nps' ? undefined : v);
        render();
      }),
    );
  }
  return div;
}

function renderPergunta(p: Pergunta): HTMLElement | null {
  const q = el('section', { class: 'q' });
  switch (p.tipo) {
    case 'nps':
      q.append(el('p', { class: 'q-titulo' }, p.titulo));
      if (p.ajuda) q.append(el('p', { class: 'q-ajuda' }, p.ajuda));
      q.append(escalaNotas('nps', 10, 0), legenda(['0 = não recomendaria', '10 = recomendaria muito'])!);
      return q;
    case 'nota':
      q.append(el('p', { class: 'q-titulo' }, p.titulo), escalaNotas(p.campo, 5, 1));
      { const l = legenda(p.legenda); if (l) q.append(l); }
      return q;
    case 'grupo':
      q.append(el('p', { class: 'q-titulo' }, p.titulo));
      if (p.ajuda) q.append(el('p', { class: 'q-ajuda' }, p.ajuda));
      for (const item of p.itens) q.append(el('p', { class: 'q-sub' }, item.rotulo), escalaNotas(item.campo, 5, 1));
      { const l = legenda(p.legenda); if (l) q.append(l); }
      return q;
    case 'opcao': {
      const box = el('div', { class: 'opcoes', role: 'group' });
      for (const o of p.opcoes) {
        box.append(
          botaoEscolha(o.rotulo, respostas[p.campo] === o.valor, () => {
            definir(p.campo, respostas[p.campo] === o.valor ? undefined : o.valor);
            render();
          }),
        );
      }
      q.append(el('p', { class: 'q-titulo' }, p.titulo), box);
      return q;
    }
    case 'simnao': {
      const box = el('div', { class: 'escala', style: 'grid-template-columns:1fr 1fr', role: 'group' });
      box.append(
        botaoEscolha('Sim', respostas[p.campo] === true, () => { definir(p.campo, true); render(); }),
        botaoEscolha('Não', respostas[p.campo] === false, () => { definir(p.campo, false); render(); }),
      );
      q.append(el('p', { class: 'q-titulo' }, p.titulo), box);
      return q;
    }
    case 'texto': {
      const id = `t-${p.campo}`;
      const t = el('textarea', { id, maxlength: '1000' }) as HTMLTextAreaElement;
      t.value = typeof respostas[p.campo] === 'string' ? (respostas[p.campo] as string) : '';
      t.addEventListener('input', () => definir(p.campo, t.value));
      q.append(el('label', { class: 'q-titulo', for: id, style: 'display:block' }, p.titulo));
      if (p.ajuda) q.append(el('p', { class: 'q-ajuda' }, p.ajuda));
      q.append(t);
      return q;
    }
    case 'email': {
      if (respostas.quer_conteudos !== true) return null;
      const id = 'c-email';
      const i = el('input', { id, type: 'email', inputmode: 'email', autocomplete: 'email', maxlength: '200' }) as HTMLInputElement;
      i.value = typeof respostas.email === 'string' ? respostas.email : '';
      i.addEventListener('input', () => definir('email', i.value.trim()));
      q.append(el('label', { class: 'q-titulo', for: id, style: 'display:block' }, p.titulo));
      if (p.ajuda) q.append(el('p', { class: 'q-ajuda' }, p.ajuda));
      q.append(i);
      return q;
    }
  }
}

function telaJaRespondeu() {
  raiz!.replaceChildren(
    el('main', { class: 'f' },
      topo(),
      el('div', { class: 'fim' },
        el('h1', {}, 'Obrigado!'),
        el('p', {}, 'Sua resposta já foi registrada neste aparelho.'),
        el('a', { class: 'insta', href: 'https://www.instagram.com/ed.leaders/', target: '_blank', rel: 'noopener' }, '@ed.leaders'),
      ),
    ),
  );
}

function telaFinal() {
  raiz!.replaceChildren(
    el('main', { class: 'f' },
      topo(),
      el('div', { class: 'fim' },
        el('h1', {}, 'Obrigado!'),
        el('p', {}, 'Sua avaliação ajuda a construir a próxima edição do curso. Até a próxima!'),
        el('p', {}, 'Siga o ED Leaders para mais conteúdo de gestão da emergência:'),
        el('a', { class: 'insta', href: 'https://www.instagram.com/ed.leaders/', target: '_blank', rel: 'noopener' }, '@ed.leaders'),
      ),
    ),
  );
}

function topo(): HTMLElement {
  return el('header', { class: 'f-topo' },
    el('img', { src: '/img/brand/edleaders-escuro.png', alt: 'ED Leaders', width: '133', height: '20' }),
    el('span', {}, 'CBMEDE 2026'),
  );
}

async function enviar(aviso: HTMLElement, botao: HTMLButtonElement) {
  if (enviando) return;
  if (typeof respostas.nps !== 'number') {
    passo = 0;
    render('Escolha a nota de 0 a 10 para enviar.');
    return;
  }
  enviando = true;
  botao.disabled = true;
  botao.textContent = 'Enviando...';
  try {
    const { email, ...resto } = respostas;
    await satisfacaoService.enviar({
      ...(resto as Record<string, never>),
      turma: TURMA_PESQUISA,
      nps: respostas.nps,
      ...(respostas.quer_conteudos === true && typeof email === 'string' && email ? { email } : {}),
    });
    gravarLocal(CHAVE_ENVIADA, new Date().toISOString());
    gravarLocal(CHAVE_RASCUNHO, '');
    telaFinal();
  } catch (e) {
    aviso.textContent = mensagemErro(e);
    aviso.classList.remove('oculto');
    botao.disabled = false;
    botao.textContent = 'Tentar enviar de novo';
  } finally {
    enviando = false;
  }
}

function render(erro?: string) {
  const secao = SECOES[passo]!;
  const ultimo = passo === SECOES.length - 1;
  const corpo = el('div', { class: 'f-corpo' });
  if (passo === 0) {
    corpo.append(
      el('h1', {}, 'Como foi o curso de ', el('em', {}, 'Gestão do Departamento de Emergência'), '?'),
      el('p', { class: 'intro' }, 'Leva menos de 3 minutos. Suas respostas são anônimas.'),
    );
  } else {
    corpo.append(el('h1', {}, secao.titulo));
  }
  for (const p of secao.perguntas) {
    const q = renderPergunta(p);
    if (q) corpo.append(q);
  }
  const aviso = el('p', { class: erro ? 'aviso' : 'aviso oculto', role: 'alert' }, erro ?? '');
  corpo.append(aviso);

  const voltar = el('button', { class: 'acao sec', type: 'button' }, 'Voltar') as HTMLButtonElement;
  voltar.addEventListener('click', () => { passo -= 1; render(); window.scrollTo(0, 0); });
  const seguir = el('button', { class: 'acao', type: 'button' }, ultimo ? 'Enviar avaliação' : 'Continuar') as HTMLButtonElement;
  seguir.addEventListener('click', () => {
    if (passo === 0 && typeof respostas.nps !== 'number') {
      render('Escolha a nota de 0 a 10 para continuar.');
      return;
    }
    if (ultimo) { void enviar(aviso, seguir); return; }
    passo += 1;
    render();
    window.scrollTo(0, 0);
  });
  const rodape = el('div', { class: 'f-rodape' });
  if (passo > 0) rodape.append(voltar);
  rodape.append(seguir);

  const barra = el('div', { class: 'f-progresso', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(SECOES.length), 'aria-valuenow': String(passo + 1) }, el('i', { style: `width:${((passo + 1) / SECOES.length) * 100}%` }));
  raiz!.replaceChildren(
    el('main', { class: 'f' }, topo(), barra, el('p', { class: 'f-passo' }, `${passo + 1} de ${SECOES.length} · ${secao.titulo}`), corpo, rodape),
  );
}

if (lerLocal(CHAVE_ENVIADA)) telaJaRespondeu();
else render();
