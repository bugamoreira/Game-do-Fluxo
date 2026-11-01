import type { ReactNode } from 'react';
import { cx } from './cx';

export interface ItemSidebar {
  id: string;
  rotulo: string;
  icone?: ReactNode;
  /** Contador ou estado curto à direita ("6", "ao vivo"). */
  selo?: string;
  desabilitado?: boolean;
}

export interface SidebarProps {
  itens: ItemSidebar[];
  ativo: string;
  onSelecionar?: (id: string) => void;
  /** Topo: marca do jogo. */
  cabecalho?: ReactNode;
  /** Base: logos, turma, sair. */
  rodape?: ReactNode;
  rotulo?: string;
  className?: string;
}

/** Barra lateral azul-marinho do painel do facilitador. */
export function Sidebar({
  itens,
  ativo,
  onSelecionar,
  cabecalho,
  rodape,
  rotulo = 'Fases da aula',
  className,
}: SidebarProps) {
  return (
    <aside className={cx('flex h-full w-64 shrink-0 flex-col gap-6 bg-degrade-cbmede p-5 text-white', className)}>
      {cabecalho}
      <nav aria-label={rotulo}>
        <ul className="flex flex-col gap-1.5">
          {itens.map(item => {
            const atual = item.id === ativo;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={atual ? 'page' : undefined}
                  disabled={item.desabilitado}
                  onClick={() => onSelecionar?.(item.id)}
                  className={cx(
                    'flex min-h-11 w-full items-center gap-3 rounded-2xl px-3.5 text-left text-[15px] font-semibold',
                    'motion-safe:transition-colors motion-safe:duration-150',
                    'disabled:cursor-not-allowed disabled:opacity-45',
                    atual ? 'bg-white text-marinho shadow-cartao' : 'text-white/85 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {item.icone && (
                    <span aria-hidden="true" className={cx('grid size-6 place-items-center', atual ? 'text-marinho' : 'text-amarelo')}>
                      {item.icone}
                    </span>
                  )}
                  <span className="flex-1 truncate">{item.rotulo}</span>
                  {item.selo && (
                    <span
                      className={cx(
                        'rounded-pilula px-2 py-0.5 font-space-mono text-[11px] font-bold',
                        atual ? 'bg-amarelo text-marinho-profundo' : 'bg-white/15 text-white',
                      )}
                    >
                      {item.selo}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {rodape && <div className="mt-auto">{rodape}</div>}
    </aside>
  );
}
