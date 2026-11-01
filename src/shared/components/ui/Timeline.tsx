import type { LogEntry, LogType } from '../../types/game';
import { cx, horaDoPlantao } from './cx';
import { Icone, type NomeIcone } from './Icone';
import type { Tema } from './types';

// Perigo e alerta são risco clínico (óbito, deterioração): podem usar a cor de gravidade.
const TIPOS: Record<LogType, { icone: NomeIcone; rotulo: string; marca: string; bolinha: string }> = {
  danger: { icone: 'alerta', rotulo: 'Perigo', marca: 'border-l-grav-vermelho', bolinha: 'bg-grav-vermelho text-white' },
  warning: { icone: 'relogio', rotulo: 'Atenção', marca: 'border-l-grav-laranja', bolinha: 'bg-grav-laranja text-marinho-profundo' },
  success: { icone: 'check', rotulo: 'Bom fluxo', marca: 'border-l-verde', bolinha: 'bg-verde text-marinho-profundo' },
  info: { icone: 'info', rotulo: 'Informação', marca: 'border-l-marinho', bolinha: 'bg-marinho text-white' },
  fact: { icone: 'raio', rotulo: 'Fato do plantão', marca: 'border-l-amarelo', bolinha: 'bg-amarelo text-marinho-profundo' },
};

export interface TimelineProps {
  itens: LogEntry[];
  /** Quantos mostrar (os mais recentes). */
  max?: number;
  /** Mais recente no topo (padrão) ou em ordem cronológica. */
  recentesPrimeiro?: boolean;
  tema?: Tema;
  vazio?: string;
  className?: string;
}

/** Linha do tempo: horário à esquerda e cartões, como na referência de medicação. */
export function Timeline({
  itens,
  max = 30,
  recentesPrimeiro = true,
  tema = 'claro',
  vazio = 'Nenhum evento ainda.',
  className,
}: TimelineProps) {
  const escuro = tema === 'escuro';
  const ordenados = [...itens].sort((a, b) => (recentesPrimeiro ? b.t - a.t : a.t - b.t)).slice(0, max);

  if (ordenados.length === 0) {
    return <p className={cx('text-sm', escuro ? 'text-white/70' : 'text-texto-suave', className)}>{vazio}</p>;
  }

  return (
    <ol className={cx('relative flex flex-col gap-3', className)}>
      {ordenados.map((item, i) => {
        const tipo = TIPOS[item.type];
        return (
          <li key={`${item.t}-${i}`} className="grid grid-cols-[3.25rem_1fr] items-start gap-3">
            <time
              className={cx(
                'pt-3 text-right font-space-mono text-[13px] font-bold tabular-nums',
                escuro ? 'text-white/75' : 'text-texto-suave',
              )}
            >
              {horaDoPlantao(item.t)}
            </time>
            <div
              className={cx(
                'flex items-start gap-3 rounded-2xl border-l-4 p-3',
                tipo.marca,
                escuro ? 'bg-white/8 text-white' : 'bg-cartao text-texto shadow-cartao',
              )}
            >
              <span aria-hidden="true" className={cx('grid size-7 shrink-0 place-items-center rounded-full', tipo.bolinha)}>
                <Icone nome={tipo.icone} tamanho={14} strokeWidth={2.5} />
              </span>
              <p className="min-w-0 pt-0.5 text-sm leading-snug">
                <span className="sr-only">{tipo.rotulo}: </span>
                {item.msg}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
