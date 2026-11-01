import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icone } from './Icone';
import type { SetorUi } from './types';

export interface StatTileProps {
  rotulo: string;
  valor: ReactNode;
  /** Diferença em relação à referência (rodada anterior, último minuto…). */
  variacao?: number;
  /** Quando subir é bom (pontuação) ou ruim (boarding, óbitos). */
  sentidoBom?: 'subir' | 'descer';
  /** Texto após a variação, ex.: "vs. R1". */
  referencia?: string;
  /** Cor do time: faixa à esquerda. */
  cor?: string;
  /** Fundo pastel de setor, como os cartões de ativos das referências. */
  tom?: SetorUi | 'branco';
  /** Mini-tendência (valores em ordem). */
  tendencia?: number[];
  icone?: ReactNode;
  className?: string;
}

const TONS: Record<NonNullable<StatTileProps['tom']>, string> = {
  branco: 'bg-cartao border border-borda',
  de: 'bg-setor-de',
  enf: 'bg-setor-enf',
  uti: 'bg-setor-uti',
  rpa: 'bg-setor-rpa',
  cc: 'bg-setor-cc',
  triagem: 'bg-setor-triagem',
  corredor: 'bg-setor-corredor',
};

function MiniTendencia({ valores, cor }: { valores: number[]; cor: string }) {
  if (valores.length < 2) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const L = 96;
  const A = 32;
  const pontos = valores
    .map((v, i) => `${((i / (valores.length - 1)) * L).toFixed(1)},${(A - 3 - ((v - min) / faixa) * (A - 6)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} aria-hidden="true" className="overflow-visible">
      <polyline points={pontos} fill="none" stroke={cor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatTile({
  rotulo,
  valor,
  variacao,
  sentidoBom = 'subir',
  referencia,
  cor,
  tom = 'branco',
  tendencia,
  icone,
  className,
}: StatTileProps) {
  const temVariacao = variacao !== undefined && variacao !== 0;
  const subiu = (variacao ?? 0) > 0;
  const bom = temVariacao && (subiu ? sentidoBom === 'subir' : sentidoBom === 'descer');

  return (
    <div
      className={cx(
        'relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-cartao p-5 text-texto shadow-cartao',
        TONS[tom],
        className,
      )}
    >
      {cor && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: cor }} />}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-space-mono text-rotulo font-bold uppercase tracking-[0.16em] text-texto-suave">
          {rotulo}
        </p>
        {icone}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="font-space-mono text-titulo-s font-bold tabular-nums">{valor}</p>
        {tendencia && <MiniTendencia valores={tendencia} cor={cor ?? 'var(--color-marinho)'} />}
      </div>
      {variacao !== undefined && (
        <p
          className={cx(
            'flex items-center gap-1 text-sm font-semibold',
            !temVariacao ? 'text-texto-suave' : bom ? 'text-verde-texto' : 'text-negativo-texto',
          )}
        >
          {temVariacao && <Icone nome={subiu ? 'setaCima' : 'setaBaixo'} tamanho={14} strokeWidth={2.5} />}
          <span>
            {temVariacao ? `${subiu ? '+' : '−'}${Math.abs(variacao)}` : 'sem variação'}
            {referencia && <span className="font-normal text-texto-suave"> {referencia}</span>}
          </span>
          {temVariacao && <span className="sr-only">{bom ? '(melhorou)' : '(piorou)'}</span>}
        </p>
      )}
    </div>
  );
}
