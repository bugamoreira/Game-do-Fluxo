import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Icone } from './Icone';

export interface ModalProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Botões do rodapé (a ação principal por último). */
  acoes?: ReactNode;
  /** Impede fechar clicando fora (confirmações destrutivas). */
  bloquearFundo?: boolean;
  largura?: 'p' | 'm' | 'g';
  children?: ReactNode;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LARGURAS = { p: 'max-w-sm', m: 'max-w-lg', g: 'max-w-3xl' } as const;

/** Diálogo acessível: foco preso, Esc fecha, foco volta para quem abriu. */
export function Modal({
  aberto,
  onFechar,
  titulo,
  descricao,
  acoes,
  bloquearFundo = false,
  largura = 'm',
  children,
}: ModalProps) {
  const idTitulo = useId();
  const idDescricao = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(onFechar);

  useEffect(() => {
    fecharRef.current = onFechar;
  }, [onFechar]);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const el = caixa.current;
    const primeiro = el?.querySelector<HTMLElement>('[data-autofoco]') ?? el?.querySelector<HTMLElement>(FOCAVEIS);
    (primeiro ?? el)?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fecharRef.current();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const focaveis = Array.from(el.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(n => n.offsetParent !== null);
      if (focaveis.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const inicio = focaveis[0]!;
      const fim = focaveis[focaveis.length - 1]!;
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === inicio || ativo === el)) {
        e.preventDefault();
        fim.focus();
      } else if (!e.shiftKey && ativo === fim) {
        e.preventDefault();
        inicio.focus();
      } else if (!el.contains(ativo)) {
        e.preventDefault();
        inicio.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sora">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-marinho-profundo/60 backdrop-blur-[2px] motion-safe:animate-[fadeIn_.15s_ease-out]"
        onClick={bloquearFundo ? undefined : onFechar}
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idDescricao : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full rounded-cartao-g bg-cartao p-7 text-texto-corpo shadow-elevada',
          'motion-safe:animate-[fadeIn_.18s_ease-out]',
          LARGURAS[largura],
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={idTitulo} className="font-sora text-2xl leading-tight font-bold text-texto">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-texto hover:bg-fundo-app"
          >
            <Icone nome="fechar" tamanho={20} />
          </button>
        </div>
        {descricao && (
          <p id={idDescricao} className="mt-2 text-[15px] leading-relaxed">
            {descricao}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {acoes && <div className="mt-6 flex flex-wrap justify-end gap-3">{acoes}</div>}
      </div>
    </div>,
    document.body,
  );
}
