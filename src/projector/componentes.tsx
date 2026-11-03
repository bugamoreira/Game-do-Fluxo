// Peças comuns do telão: palco escalável, moldura com logos e controle de som.

import { useEffect, useState, type ReactNode } from 'react';
import { Icone, cx, iniciais, textoSobre } from '../shared/components/ui';
import type { Conexao } from '../shared/hooks';
import { ENDERECO_JOGO } from './derivar';

export const LARGURA_PALCO = 1920;
export const ALTURA_PALCO = 1080;

function escalaAtual(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.innerWidth / LARGURA_PALCO, window.innerHeight / ALTURA_PALCO);
}

/**
 * Palco fixo de 1920×1080, escalado para caber em qualquer projetor
 * (1280×720, 1024×768, 4K) sem quebrar o layout.
 */
export function Palco({ children }: { children: ReactNode }) {
  const [escala, setEscala] = useState(escalaAtual);
  useEffect(() => {
    const ajustar = () => setEscala(escalaAtual());
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-marinho-profundo">
      <div
        className="absolute top-1/2 left-1/2 origin-center"
        style={{ width: LARGURA_PALCO, height: ALTURA_PALCO, transform: `translate(-50%, -50%) scale(${escala})` }}
      >
        {children}
      </div>
    </div>
  );
}

export interface MolduraProps {
  /** Linha em caixa alta acima do título (ex.: "— Rodada 1 · Plantão Travado"). */
  rotulo: string;
  /** Foto do Rio ao fundo, com véu azul-marinho por cima. */
  fundo?: string;
  /** Opacidade do véu (mais alta nas telas de dados). */
  veu?: number;
  conexao: Conexao;
  som: ReactNode;
  children: ReactNode;
}

export function Moldura({ rotulo, fundo = '/img/rio/rio-pao-de-acucar-panorama.jpg', veu = 0.9, conexao, som, children }: MolduraProps) {
  return (
    <div className="relative isolate flex h-full w-full flex-col overflow-hidden bg-marinho-profundo px-16 pt-10 pb-8 font-sora text-white">
      <img src={fundo} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-degrade-cbmede" style={{ opacity: veu }} />

      <header className="flex shrink-0 items-start justify-between gap-10">
        <div className="min-w-0">
          <p className="font-space-mono text-2xl font-bold tracking-[0.2em] text-amarelo uppercase">{rotulo}</p>
          <p className="mt-1 text-5xl font-bold">
            Simulador do <span className="text-amarelo">Fluxo</span>
          </p>
        </div>
        <Logos />
      </header>

      <main className="mt-8 flex min-h-0 flex-1 flex-col">{children}</main>

      <footer className="mt-6 flex shrink-0 items-center justify-between gap-8 font-space-mono text-2xl text-white/80">
        <span className="font-bold tracking-wide text-white">{ENDERECO_JOGO}</span>
        <div className="flex items-center gap-6">
          <IndicadorConexao conexao={conexao} />
          {som}
        </div>
      </footer>
    </div>
  );
}

export function Logos({ grande = false }: { grande?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-8">
      <div className="text-right">
        <p className="font-space-mono text-sm tracking-[0.2em] text-white/70 uppercase">Realização</p>
        <img
          src="/img/brand/edleaders-escuro.png"
          alt="ED Leaders"
          className={cx('mt-1 mix-blend-screen', grande ? 'h-14' : 'h-11')}
        />
      </div>
      <img src="/img/brand/abramede.png" alt="ABRAMEDE" className={cx('rounded-xl', grande ? 'h-24' : 'h-[72px]')} />
    </div>
  );
}

function IndicadorConexao({ conexao }: { conexao: Conexao }) {
  if (conexao === 'online') return null;
  return (
    <span role="status" className="inline-flex items-center gap-3 rounded-pilula bg-white/12 px-5 py-2 font-sora text-xl font-semibold text-white">
      <Icone nome={conexao === 'offline' ? 'semSinal' : 'recarregar'} tamanho={22} />
      {conexao === 'offline' ? 'Sem conexão: mostrando os últimos dados' : 'Reconectando…'}
    </span>
  );
}

export interface BotaoSomProps {
  ativo: boolean;
  mudoPeloFacilitador: boolean;
  onAtivar: () => void;
}

/** Discreto: o navegador só libera áudio depois de um clique na página. */
export function BotaoSom({ ativo, mudoPeloFacilitador, onAtivar }: BotaoSomProps) {
  if (ativo) {
    return (
      <span className="inline-flex items-center gap-2 font-sora text-lg text-white/60">
        <Icone nome="musica" tamanho={20} />
        {mudoPeloFacilitador ? 'Som desligado pelo facilitador' : 'Som ligado'}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onAtivar}
      className="inline-flex cursor-pointer items-center gap-2 rounded-pilula bg-white/10 px-5 py-2 font-sora text-lg font-semibold text-white/85 ring-1 ring-white/25 transition-colors hover:bg-white/20"
    >
      <Icone nome="musica" tamanho={20} />
      Ativar som
    </button>
  );
}

/** Círculo com as iniciais do grupo, em tamanho livre (o TeamAvatar vai até 56 px). */
export function Medalhao({ nome, cor, tamanho, className }: { nome: string; cor: string; tamanho: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('grid shrink-0 place-items-center rounded-full font-bold ring-4 ring-white/25', className)}
      style={{ width: tamanho, height: tamanho, background: cor, fontSize: tamanho * 0.36 }}
    >
      <span style={{ color: textoSobre(cor) }}>{iniciais(nome)}</span>
    </span>
  );
}
