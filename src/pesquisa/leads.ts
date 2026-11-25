// Leads da pesquisa: só facilitador logado (Supabase Auth + facilitadores).
import './pesquisa.css';
import type { LeadSatisfacao } from '../shared/schemas';
import { facilitadorService } from '../shared/services/facilitadorService';
import { satisfacaoService } from '../shared/services/satisfacaoService';
import { el, mensagemErro } from './util';

const raiz = document.getElementById('app')!;

function sim(v: boolean) {
  return v ? 'Sim' : 'Não';
}

function csv(leads: LeadSatisfacao[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const linhas = [['data', 'email', 'quer_conteudos', 'interesse_consultoria', 'nps'].join(';')];
  for (const l of leads) {
    linhas.push([esc(new Date(l.data).toLocaleString('pt-BR')), esc(l.email ?? ''), sim(l.quer_conteudos), sim(l.interesse_consultoria), String(l.nps)].join(';'));
  }
  return '﻿' + linhas.join('\r\n');
}

function baixar(leads: LeadSatisfacao[]) {
  const url = URL.createObjectURL(new Blob([csv(leads)], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: 'leads-pesquisa-cbmede26.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function mostrarLeads() {
  raiz.replaceChildren(el('main', { class: 'l' }, el('h1', {}, 'Leads da pesquisa'), el('p', {}, 'Carregando...')));
  try {
    const leads = await satisfacaoService.leads();
    const exportar = el('button', { class: 'acao', type: 'button', style: 'flex:0 0 auto;padding:0 24px' }, 'Exportar CSV');
    exportar.addEventListener('click', () => baixar(leads));
    const sair = el('button', { class: 'acao sec', type: 'button' }, 'Sair');
    sair.addEventListener('click', () => void facilitadorService.sair().then(() => mostrarLogin()));
    const atualizar = el('button', { class: 'acao sec', type: 'button' }, 'Atualizar');
    atualizar.addEventListener('click', () => void mostrarLeads());
    const corpo = el('tbody', {}, ...leads.map((l) =>
      el('tr', {},
        el('td', {}, new Date(l.data).toLocaleString('pt-BR')),
        el('td', {}, l.email ?? '–'),
        el('td', {}, sim(l.quer_conteudos)),
        el('td', {}, sim(l.interesse_consultoria)),
        el('td', {}, String(l.nps)),
      )));
    raiz.replaceChildren(
      el('main', { class: 'l' },
        el('h1', {}, 'Leads da pesquisa'),
        el('p', { style: 'color:var(--suave);margin-bottom:12px' }, `${leads.length} respostas com e-mail ou interesse.`),
        el('div', { class: 'linha-acoes' }, exportar, atualizar, sair),
        el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Data'), el('th', {}, 'E-mail'), el('th', {}, 'Quer conteúdos'), el('th', {}, 'Consultoria'), el('th', {}, 'NPS'))),
          corpo,
        ),
      ),
    );
  } catch (e) {
    mostrarLogin(mensagemErro(e));
  }
}

function mostrarLogin(erro?: string) {
  const email = el('input', { type: 'email', id: 'email', autocomplete: 'username', required: '' }) as HTMLInputElement;
  const senha = el('input', { type: 'password', id: 'senha', autocomplete: 'current-password', required: '' }) as HTMLInputElement;
  const aviso = el('p', { class: erro ? 'aviso' : 'aviso oculto', role: 'alert' }, erro ?? '');
  const botao = el('button', { class: 'acao', type: 'submit' }, 'Entrar') as HTMLButtonElement;
  const form = el('form', {},
    el('label', { for: 'email' }, 'E-mail do facilitador'), email,
    el('label', { for: 'senha' }, 'Senha'), senha,
    botao, aviso,
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    botao.disabled = true;
    facilitadorService.login(email.value.trim(), senha.value).then(
      () => void mostrarLeads(),
      (e: unknown) => {
        botao.disabled = false;
        aviso.textContent = mensagemErro(e);
        aviso.classList.remove('oculto');
      },
    );
  });
  raiz.replaceChildren(el('main', { class: 'l' }, el('h1', {}, 'Leads da pesquisa'), form));
}

void facilitadorService.sessaoAtual().then((s) => (s ? mostrarLeads() : mostrarLogin()), () => mostrarLogin());
