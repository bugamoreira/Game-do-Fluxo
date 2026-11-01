import type { ReactNode } from 'react';
import { cx, Icone } from '../../shared/components/ui';
import { formatarNumero, type DefMetrica } from '../transformar';

export const LOGO_ABRAMEDE = '/img/brand/abramede.png';
export const LOGO_EDLEADERS = '/img/brand/edleaders-escuro.png';

/** Logos oficiais. O ED Leaders tem fundo preto: sobre o azul-marinho, `screen` apaga o preto. */
export function Logos({ className }: { className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-6 gap-y-3', className)}>
      <img src={LOGO_ABRAMEDE} alt="ABRAMEDE — Associação Brasileira de Medicina de Emergência" className="h-10 w-auto" />
      <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70">
        realização
        <img src={LOGO_EDLEADERS} alt="ED Leaders" className="h-6 w-auto mix-blend-screen" />
      </span>
    </div>
  );
}

interface SecaoProps {
  id: string;
  numero: number;
  rotulo: string;
  titulo: string;
  intro?: ReactNode;
  /** Começa numa página nova na impressão. */
  quebraAntes?: boolean;
  children: ReactNode;
}

export function Secao({ id, numero, rotulo, titulo, intro, quebraAntes = true, children }: SecaoProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cx('secao py-10 sm:py-14', quebraAntes && 'quebra-antes')}>
      <p className="mb-2 flex items-center gap-3 font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-verde-texto">
        <span aria-hidden="true" className="inline-block h-0.5 w-8 bg-verde" />
        {String(numero).padStart(2, '0')} · {rotulo}
      </p>
      <h2 id={`${id}-titulo`} className="font-sora text-titulo-s font-bold text-texto sm:text-[2.1rem]">
        {titulo}
      </h2>
      {intro && <div className="mt-3 max-w-3xl text-[0.9375rem] leading-relaxed text-texto-corpo">{intro}</div>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

/** Valor de métrica formatado ("12,5 h", "96%", "3"); "—" sem dado. */
export function valorMetrica(def: Pick<DefMetrica, 'unidade'>, v: number | undefined): string {
  if (v === undefined) return '—';
  if (def.unidade === 'h') return `${formatarNumero(v, 1)} h`;
  if (def.unidade === '%') return `${formatarNumero(v)}%`;
  return formatarNumero(v);
}

/** Variação R2 − R1 com seta, sinal e cor; o sentido (melhorou/piorou) também vai em texto. */
export function Variacao({
  antes,
  depois,
  def,
  casas: casasFixas,
  sufixo: sufixoFixo,
  className,
}: {
  antes: number | undefined;
  depois: number | undefined;
  def: Pick<DefMetrica, 'unidade' | 'sentidoBom'>;
  casas?: 0 | 1;
  sufixo?: string;
  className?: string;
}) {
  if (antes === undefined || depois === undefined) return <span className={cx('text-texto-suave', className)}>—</span>;
  const casas = casasFixas ?? (def.unidade === 'h' ? 1 : 0);
  const d = Number((depois - antes).toFixed(casas));
  if (d === 0) return <span className={cx('text-texto-suave', className)}>=</span>;
  const subiu = d > 0;
  const neutro = def.sentidoBom === 'neutro';
  const bom = subiu === (def.sentidoBom === 'subir');
  const sufixo = sufixoFixo ?? (def.unidade === 'h' ? ' h' : def.unidade === '%' ? ' p.p.' : '');
  return (
    <span className={cx('inline-flex items-center justify-end gap-0.5 font-semibold', neutro ? 'text-texto-suave' : bom ? 'text-verde-texto' : 'text-negativo-texto', className)}>
      <Icone nome={subiu ? 'setaCima' : 'setaBaixo'} tamanho={13} strokeWidth={2.6} />
      {subiu ? '+' : '−'}
      {formatarNumero(Math.abs(d), casas)}
      {sufixo}
      {!neutro && <span className="sr-only">{bom ? ' (melhorou)' : ' (piorou)'}</span>}
    </span>
  );
}
