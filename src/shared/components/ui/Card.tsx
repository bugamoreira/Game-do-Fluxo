import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside' | 'li';
  /** Raio 28 em vez de 20. */
  grande?: boolean;
  /** Espaçamento interno. */
  espaco?: 'nenhum' | 'p' | 'm' | 'g';
  /** Rótulo em caixa alta (Space Mono) acima do título. */
  rotulo?: string;
  titulo?: ReactNode;
  /** Conteúdo à direita do título (ação, número). */
  extra?: ReactNode;
}

const ESPACOS = { nenhum: '', p: 'p-4', m: 'p-6', g: 'p-8' } as const;

export function Card({
  as: Tag = 'div',
  grande = false,
  espaco = 'm',
  rotulo,
  titulo,
  extra,
  className,
  children,
  ...resto
}: CardProps) {
  const temCabecalho = Boolean(rotulo || titulo || extra);
  return (
    <Tag
      className={cx(
        'bg-cartao border border-borda shadow-cartao text-texto-corpo',
        grande ? 'rounded-cartao-g' : 'rounded-cartao',
        ESPACOS[espaco],
        className,
      )}
      {...resto}
    >
      {temCabecalho && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {rotulo && <Rotulo>{rotulo}</Rotulo>}
            {titulo && <h3 className="font-sora text-xl font-bold text-texto">{titulo}</h3>}
          </div>
          {extra}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** Rótulo em caixa alta com traço, como o "— FALE CONOSCO" do site. */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cx(
        'mb-1 flex items-center gap-2 font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-current opacity-70" />
      {children}
    </p>
  );
}
