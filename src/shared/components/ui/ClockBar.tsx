import { cx, horaDoPlantao } from './cx';
import { Icone } from './Icone';
import type { Tema } from './types';

export const INICIO_PLANTAO = 420; // 07:00
export const FIM_PLANTAO = 1140; // 19:00

export interface ClockBarProps {
  /** Minuto do dia, 420 (07:00) a 1140 (19:00). */
  minuto: number;
  /** Ex.: "Plantão Travado". */
  rotulo?: string;
  pausado?: boolean;
  tema?: Tema;
  /** Relógio grande para o telão. */
  grande?: boolean;
  className?: string;
}

const MARCAS = [420, 600, 780, 960, 1140]; // 07, 10, 13, 16, 19 h

/** Relógio do plantão 07:00 → 19:00 com barra de progresso. */
export function ClockBar({ minuto, rotulo, pausado = false, tema = 'claro', grande = false, className }: ClockBarProps) {
  const m = Math.min(FIM_PLANTAO, Math.max(INICIO_PLANTAO, minuto));
  const fracao = (m - INICIO_PLANTAO) / (FIM_PLANTAO - INICIO_PLANTAO);
  const pct = Math.round(fracao * 100);
  const hora = horaDoPlantao(m);
  const escuro = tema === 'escuro';

  return (
    <div className={cx('flex min-w-0 items-center', grande ? 'gap-8' : 'gap-4', className)}>
      <div className="shrink-0">
        {rotulo && (
          <p
            className={cx(
              'font-space-mono font-bold uppercase tracking-[0.18em]',
              grande ? 'text-base' : 'text-rotulo',
              escuro ? 'text-amarelo' : 'text-texto-suave',
            )}
          >
            {rotulo}
          </p>
        )}
        <p
          className={cx(
            'flex items-center gap-2 font-space-mono font-bold tabular-nums',
            grande ? 'text-telao' : 'text-titulo-s leading-none',
            escuro ? 'text-white' : 'text-texto',
          )}
        >
          <time aria-label={`Hora do plantão: ${hora}`}>{hora}</time>
          {pausado && (
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-pilula px-2.5 py-1 font-sora text-xs font-bold tracking-normal',
                escuro ? 'bg-white/15 text-white' : 'bg-marinho text-white',
              )}
            >
              <Icone nome="pausa" tamanho={12} strokeWidth={3} />
              Pausado
            </span>
          )}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div
          role="progressbar"
          aria-label="Andamento do plantão"
          aria-valuemin={INICIO_PLANTAO}
          aria-valuemax={FIM_PLANTAO}
          aria-valuenow={m}
          aria-valuetext={`${hora}, ${pct}% do plantão`}
          className={cx('relative overflow-hidden rounded-pilula', grande ? 'h-5' : 'h-2.5', escuro ? 'bg-white/15' : 'bg-borda')}
        >
          <div
            className={cx('h-full rounded-pilula motion-safe:transition-[width] motion-safe:duration-700', escuro ? 'bg-amarelo' : 'bg-marinho')}
            style={{ width: `${fracao * 100}%` }}
          />
        </div>
        <div
          aria-hidden="true"
          className={cx(
            'mt-1.5 flex justify-between font-space-mono tabular-nums',
            grande ? 'text-lg' : 'text-[11px]',
            escuro ? 'text-white/70' : 'text-texto-suave',
          )}
        >
          {MARCAS.map(mk => (
            <span key={mk}>{horaDoPlantao(mk)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
