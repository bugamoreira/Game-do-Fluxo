import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './cx';
import { Icone, type NomeIcone } from './Icone';

export type TipoToast = 'info' | 'sucesso' | 'atencao';

export interface ToastProps {
  titulo?: ReactNode;
  children?: ReactNode;
  tipo?: TipoToast;
  /** Fecha sozinho depois de N ms (chama onFechar). */
  duracaoMs?: number;
  onFechar?: () => void;
  className?: string;
}

// Sem cores de Manchester: aviso de sistema não é paciente.
const TIPOS: Record<TipoToast, { icone: NomeIcone; bolinha: string }> = {
  info: { icone: 'info', bolinha: 'bg-white/15 text-white' },
  sucesso: { icone: 'check', bolinha: 'bg-verde text-marinho-profundo' },
  atencao: { icone: 'alerta', bolinha: 'bg-amarelo text-marinho-profundo' },
};

/** Aviso curto. Use dentro de <ToastArea> para ficar fixo no canto e ser anunciado. */
export function Toast({ titulo, children, tipo = 'info', duracaoMs, onFechar, className }: ToastProps) {
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  }, [onFechar]);

  useEffect(() => {
    if (!duracaoMs) return;
    const id = window.setTimeout(() => fecharRef.current?.(), duracaoMs);
    return () => window.clearTimeout(id);
  }, [duracaoMs]);

  const t = TIPOS[tipo];
  return (
    <div
      className={cx(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-marinho-profundo p-4 pr-2 text-white shadow-elevada',
        'motion-safe:animate-[slideIn_.2s_ease-out]',
        className,
      )}
    >
      <span aria-hidden="true" className={cx('grid size-8 shrink-0 place-items-center rounded-full', t.bolinha)}>
        <Icone nome={t.icone} tamanho={16} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-sm leading-snug">
        {titulo && <p className="font-bold">{titulo}</p>}
        {children && <div className="text-white/85">{children}</div>}
      </div>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          className="grid size-10 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Icone nome="fechar" tamanho={16} />
        </button>
      )}
    </div>
  );
}

/** Região fixa (canto inferior direito) que anuncia os avisos para leitor de tela. */
export function ToastArea({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx('pointer-events-none fixed right-4 bottom-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3', className)}
    >
      {children}
    </div>
  );
}
