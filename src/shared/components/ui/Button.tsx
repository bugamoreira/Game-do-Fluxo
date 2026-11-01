import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type VarianteBotao = 'verde' | 'marinho' | 'amarelo' | 'contorno' | 'fantasma';
export type TamanhoBotao = 'p' | 'm' | 'g';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Verde = ação principal (um por tela). */
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  /** Contorno e fantasma em branco, para usar sobre o degradê ou o cartão escuro. */
  sobreEscuro?: boolean;
  /** Mostra indicador de espera e bloqueia o clique. */
  carregando?: boolean;
  icone?: ReactNode;
  larguraTotal?: boolean;
}

// Verde da marca com texto marinho profundo: branco sobre #3DB54A dá só 2,7:1 (reprova AA).
const VARIANTES: Record<VarianteBotao, string> = {
  verde: 'bg-verde text-marinho-profundo hover:bg-[#36a342] shadow-[0_6px_16px_rgba(61,181,74,0.28)]',
  marinho: 'bg-marinho text-white hover:bg-marinho-claro',
  amarelo: 'bg-amarelo text-marinho-profundo hover:bg-[#e8b90f] focus-visible:outline-marinho-profundo',
  contorno: 'bg-transparent text-marinho border-2 border-marinho hover:bg-marinho/5',
  fantasma: 'bg-transparent text-marinho hover:bg-marinho/8',
};

const VARIANTES_ESCURO: Partial<Record<VarianteBotao, string>> = {
  contorno: 'bg-transparent text-white border-2 border-white/70 hover:bg-white/10',
  fantasma: 'bg-transparent text-white hover:bg-white/10',
};

// Alvo mínimo de 40 px em todos os tamanhos.
const TAMANHOS: Record<TamanhoBotao, string> = {
  p: 'min-h-10 px-4 text-sm gap-1.5',
  m: 'min-h-12 px-6 text-base gap-2',
  g: 'min-h-14 px-8 text-lg gap-2.5',
};

export function Button({
  variante = 'marinho',
  tamanho = 'm',
  sobreEscuro = false,
  carregando = false,
  icone,
  larguraTotal = false,
  type = 'button',
  disabled,
  className,
  children,
  ...resto
}: ButtonProps) {
  const estilo = (sobreEscuro && VARIANTES_ESCURO[variante]) || VARIANTES[variante];
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cx(
        'inline-flex items-center justify-center rounded-pilula font-sora font-bold whitespace-nowrap select-none',
        'motion-safe:transition-[background-color,transform,box-shadow] motion-safe:duration-150',
        'motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0',
        estilo,
        TAMANHOS[tamanho],
        larguraTotal && 'w-full',
        className,
      )}
      {...resto}
    >
      {carregando ? (
        <span
          aria-hidden="true"
          className="size-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      ) : (
        icone
      )}
      {children}
    </button>
  );
}
