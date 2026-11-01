// Moldura das telas fora do plantão (J1, J2, J4, J6): faixa da marca e conteúdo centralizado.

import type { ReactNode } from 'react';
import { ConnectionBanner, cx, type Conexao } from '../../shared/components/ui';

interface MolduraProps {
  /** Rótulo em caixa alta na faixa (ex.: "Sala CBMEDE"). */
  rotulo?: string;
  conexao?: Conexao | null;
  largura?: 'p' | 'm' | 'g';
  /** Conteúdo curto: centraliza na altura da tela. */
  centralizar?: boolean;
  children: ReactNode;
}

const LARGURAS = { p: 'max-w-xl', m: 'max-w-4xl', g: 'max-w-6xl' } as const;

export function Moldura({ rotulo, conexao, largura = 'm', centralizar = false, children }: MolduraProps) {
  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-fundo-app font-sora text-texto-corpo">
      <header className="bg-degrade-cbmede text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-4">
            <img src="/img/brand/abramede.png" alt="ABRAMEDE" className="h-11 rounded-lg" />
            <div>
              <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">CBMEDE 2026</p>
              <p className="text-xl font-bold">Simulador do Plantão</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {rotulo && (
              <p className="rounded-pilula bg-white/10 px-4 py-1.5 font-space-mono text-sm font-bold uppercase tracking-[0.14em]">{rotulo}</p>
            )}
            <img src="/img/brand/edleaders-escuro.png" alt="ED Leaders" className="h-8 mix-blend-screen" />
          </div>
        </div>
      </header>
      <main className={cx('mx-auto flex w-full flex-1 flex-col gap-6 px-6 py-8', centralizar && 'justify-center pb-24', LARGURAS[largura])}>
        {conexao && <ConnectionBanner conexao={conexao} />}
        {children}
      </main>
    </div>
  );
}
