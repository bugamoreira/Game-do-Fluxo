// Telão da pesquisa: consulta os agregados a cada 5 s (sem e-mail, sem leads).
import './pesquisa.css';
import type { PainelSatisfacao } from '../shared/schemas';
import { satisfacaoService } from '../shared/services/satisfacaoService';
import { el } from './util';
import { BLOCOS, FAC_GUSTAVO, FAC_JULIANA, LOGISTICA, PRATICAS } from './perguntas';

const INTERVALO_MS = 5000;
const raiz = document.getElementById('app')!;
let dados: PainelSatisfacao | null = null;
let indiceFrase = 0;
let falhas = 0;

function barra(rotulo: string, media: number | null | undefined): HTMLElement {
  const v = typeof media === 'number' ? media : null;
  return el('div', { class: 'barra' },
    el('span', {}, rotulo),
    el('div', { class: 'trilho' }, el('i', { style: `width:${v ? (v / 5) * 100 : 0}%` })),
    el('b', {}, v ? v.toFixed(1).replace('.', ',') : '–'),
  );
}

function grupo(titulo: string, itens: { campo: string; rotulo: string }[], medias: PainelSatisfacao['medias']): HTMLElement {
  return el('div', { class: 'grupo-barras' },
    el('p', { class: 'gb-titulo' }, titulo),
    el('div', { class: 'barras' }, ...itens.map((i) => barra(i.rotulo, medias[i.campo]))),
  );
}

function render() {
  const d = dados;
  const n = d?.n ?? 0;
  const nps = d?.nps ?? null;
  const total = Math.max(1, n);
  const m = d?.medias ?? {};
  const frases = d?.aplicar_30_dias ?? [];
  const frase = frases.length ? frases[indiceFrase % frases.length]! : 'As ideias que a turma vai aplicar aparecem aqui.';

  raiz.replaceChildren(
    el('main', { class: 'p' },
      el('header', { class: 'p-topo' },
        el('h1', {}, 'Avaliação do curso · ', el('em', {}, 'Gestão do Departamento de Emergência')),
        el('img', { src: '/img/brand/edleaders-escuro.png', alt: 'ED Leaders' }),
      ),
      el('section', { class: 'cartao', style: 'display:flex;flex-direction:column;gap:3vh' },
        el('div', {}, el('p', { class: 'rotulo' }, 'Respostas'), el('p', { class: 'grande n-resp' }, String(n))),
        el('div', {},
          el('p', { class: 'rotulo' }, 'NPS'),
          el('p', { class: `grande nps-valor${nps !== null && nps < 0 ? ' neg' : ''}` }, nps === null ? '–' : String(nps)),
          el('div', { class: 'pilha' },
            el('i', { style: `width:${((d?.detratores ?? 0) / total) * 100}%;background:var(--vermelho)` }),
            el('i', { style: `width:${((d?.neutros ?? 0) / total) * 100}%;background:#8a8a8a` }),
            el('i', { style: `width:${((d?.promotores ?? 0) / total) * 100}%;background:var(--turquesa)` }),
          ),
          el('div', { class: 'trio' },
            el('div', { class: 'det' }, el('b', {}, String(d?.detratores ?? 0)), el('span', {}, 'Detratores')),
            el('div', { class: 'neu' }, el('b', {}, String(d?.neutros ?? 0)), el('span', {}, 'Neutros')),
            el('div', { class: 'pro' }, el('b', {}, String(d?.promotores ?? 0)), el('span', {}, 'Promotores')),
          ),
        ),
      ),
      el('section', { class: 'cartao' },
        el('p', { class: 'rotulo' }, 'Médias de 1 a 5'),
        grupo('Conteúdo', [{ campo: 'aplicabilidade', rotulo: 'Aplicabilidade' }, ...BLOCOS], m),
        grupo('Prática', PRATICAS, m),
      ),
      el('section', { class: 'cartao' },
        el('p', { class: 'rotulo' }, 'Médias de 1 a 5'),
        grupo('Gustavo Moreira', FAC_GUSTAVO, m),
        grupo('Juliana Souza', FAC_JULIANA, m),
        grupo('Logística', LOGISTICA, m),
      ),
      el('section', { class: 'cartao', style: 'grid-column:1 / 3' },
        el('p', { class: 'rotulo' }, 'O que a turma vai aplicar nos próximos 30 dias'),
        el('p', { class: 'carrossel', 'aria-live': 'polite' }, frase),
      ),
      el('section', { class: 'cartao qr' },
        el('img', { src: '/pesquisa/qr-pesquisa.png', alt: 'QR code da pesquisa' }),
        el('div', {}, el('p', {}, 'Ainda não respondeu?'), el('small', {}, 'plantaocbmede26.netlify.app/', el('br', {}), 'pesquisa')),
      ),
      el('footer', { class: 'p-rodape' },
        el('span', {}, 'X CBMEDE 2026 · Realização ED Leaders'),
        el('span', {}, falhas > 2 ? 'Reconectando...' : 'Atualiza a cada 5 segundos'),
      ),
    ),
  );
}

async function atualizar() {
  try {
    dados = await satisfacaoService.painel();
    falhas = 0;
  } catch {
    falhas += 1;
  }
  render();
}

void atualizar();
setInterval(() => void atualizar(), INTERVALO_MS);
setInterval(() => {
  indiceFrase += 1;
  render();
}, 7000);
