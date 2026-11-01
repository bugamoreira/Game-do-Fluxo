import { useId, type ReactNode } from 'react';
import { cx } from './cx';

export interface DarkCalloutProps {
  titulo: ReactNode;
  /** Rótulo em caixa alta acima do título, ex.: "Evento ativo". */
  rotulo?: string;
  icone?: ReactNode;
  /** Botões ou contadores no rodapé do cartão. */
  acoes?: ReactNode;
  /** Anuncia mudanças para leitor de tela (evento ao vivo). */
  aoVivo?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Cartão de momento: o que exige atenção agora. No máximo um por tela. */
export function DarkCallout({ titulo, rotulo, icone, acoes, aoVivo = false, className, children }: DarkCalloutProps) {
  const idTitulo = useId();
  return (
    <section
      aria-labelledby={idTitulo}
      aria-live={aoVivo ? 'polite' : undefined}
      className={cx(
        'relative isolate overflow-hidden rounded-cartao-g bg-degrade-cbmede p-6 text-white shadow-elevada',
        className,
      )}
    >
      {/* brilho amarelo do hero do site */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 -z-10 size-48 rounded-full bg-amarelo/20 blur-3xl"
      />
      {rotulo && (
        <p className="mb-2 flex items-center gap-2 font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">
          <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-amarelo" />
          {rotulo}
        </p>
      )}
      <div className="flex items-start gap-3">
        {icone && (
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-amarelo">
            {icone}
          </span>
        )}
        <h2 id={idTitulo} className="font-sora text-2xl leading-tight font-bold">
          {titulo}
        </h2>
      </div>
      {children && <div className="mt-3 text-[15px] leading-relaxed text-white/85">{children}</div>}
      {acoes && <div className="mt-5 flex flex-wrap items-center gap-3">{acoes}</div>}
    </section>
  );
}
