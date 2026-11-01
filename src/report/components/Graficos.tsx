// Gráficos SVG próprios (sem biblioteca): R1 × R2 ao longo do plantão.
// Travado em cinza tracejado, Lean em marinho contínuo: a diferença não
// depende só da cor (traço e rótulo direto no fim da linha).

import { useId } from 'react';
import { formatarNumero, type PontoHora } from '../transformar';

export const COR_R1 = '#7B819F';
export const COR_R2 = '#1B2A6B';

const A = 270;
const M = { topo: 18, dir: 82, base: 36, esq: 46 };
const AI = A - M.topo - M.base;
/** Largura do viewBox: menor no gráfico de meia coluna, para o texto não encolher demais. */
const L_LINHAS = 520;
const L_BARRAS = 900;
const FONTE_EIXO = 13;

function escalaMax(valores: number[], minimo: number): number {
  const max = Math.max(minimo, ...valores);
  const passo = max <= 5 ? 1 : max <= 10 ? 2 : max <= 50 ? 10 : max <= 150 ? 25 : 50;
  return Math.ceil(max / passo) * passo;
}

function ticks(max: number): number[] {
  const n = 4;
  return Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
}

interface GraficoProps {
  titulo: string;
  descricao: string;
  pontos: PontoHora[];
  unidade?: string;
  /** Linha de referência (ex.: 100% das macas). */
  referencia?: { valor: number; rotulo: string };
  minimoEixo?: number;
  casas?: 0 | 1;
}

function Legenda({ barras = false }: { barras?: boolean }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm text-texto-corpo" aria-hidden="true">
      <span className="flex items-center gap-2">
        {barras ? (
          <svg width="16" height="14"><rect x="1" y="1" width="14" height="12" rx="2" fill="#fff" stroke={COR_R1} strokeWidth="2" strokeDasharray="4 2" /></svg>
        ) : (
          <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke={COR_R1} strokeWidth="3" strokeDasharray="6 4" /></svg>
        )}
        Plantão Travado (R1)
      </span>
      <span className="flex items-center gap-2">
        {barras ? (
          <svg width="16" height="14"><rect x="1" y="1" width="14" height="12" rx="2" fill={COR_R2} /></svg>
        ) : (
          <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke={COR_R2} strokeWidth="3" /></svg>
        )}
        Plantão Lean (R2)
      </span>
    </div>
  );
}

function Eixos({ max, unidade, casas, horas }: { max: number; unidade: string; casas: 0 | 1; horas: number[] }) {
  const L = L_LINHAS;
  const LI = L - M.esq - M.dir;
  const x = (i: number) => M.esq + (horas.length === 1 ? 0 : (i / (horas.length - 1)) * LI);
  return (
    <g fontFamily="Space Mono, monospace" fontSize={FONTE_EIXO} fill="#5D6384">
      {ticks(max).map(t => {
        const y = M.topo + AI - (t / max) * AI;
        return (
          <g key={t}>
            <line x1={M.esq} x2={M.esq + LI} y1={y} y2={y} stroke="#E3E5F0" strokeWidth="1" />
            <text x={M.esq - 8} y={y + 4} textAnchor="end">
              {formatarNumero(t, casas)}
              {unidade}
            </text>
          </g>
        );
      })}
      {horas.map((h, i) =>
        i % 2 === 0 ? (
          <text key={h} x={x(i)} y={A - 12} textAnchor="middle">
            {h}h
          </text>
        ) : null,
      )}
    </g>
  );
}

function tabelaAcessivel(titulo: string, pontos: PontoHora[], unidade: string, casas: 0 | 1) {
  const f = (v: number | null) => (v === null ? 'sem dado' : `${formatarNumero(v, casas)}${unidade}`);
  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <thead>
        <tr><th scope="col">Hora</th><th scope="col">Plantão Travado</th><th scope="col">Plantão Lean</th></tr>
      </thead>
      <tbody>
        {pontos.map(p => (
          <tr key={p.hora}><th scope="row">{p.hora}h</th><td>{f(p.r1)}</td><td>{f(p.r2)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function GraficoLinhas({ titulo, descricao, pontos, unidade = '', referencia, minimoEixo = 1, casas = 0 }: GraficoProps) {
  const idDesc = useId();
  const L = L_LINHAS;
  const LI = L - M.esq - M.dir;
  const valores = pontos.flatMap(p => [p.r1, p.r2]).filter((v): v is number => v !== null);
  const max = escalaMax([...valores, referencia?.valor ?? 0], minimoEixo);
  const x = (i: number) => M.esq + (pontos.length === 1 ? 0 : (i / (pontos.length - 1)) * LI);
  const y = (v: number) => M.topo + AI - (v / max) * AI;

  const linha = (chave: 'r1' | 'r2') => {
    const segs: string[] = [];
    let aberto = false;
    pontos.forEach((p, i) => {
      const v = p[chave];
      if (v === null) { aberto = false; return; }
      segs.push(`${aberto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      aberto = true;
    });
    return segs.join(' ');
  };
  const ultimo = (chave: 'r1' | 'r2') => {
    for (let i = pontos.length - 1; i >= 0; i--) {
      const v = pontos[i]![chave];
      if (v !== null) return { i, v };
    }
    return null;
  };
  const u1 = ultimo('r1');
  const u2 = ultimo('r2');
  // Rótulos diretos sem sobreposição.
  let y1 = u1 ? y(u1.v) : 0;
  let y2 = u2 ? y(u2.v) : 0;
  if (u1 && u2 && Math.abs(y1 - y2) < 17) {
    const meio = (y1 + y2) / 2;
    if (y1 <= y2) { y1 = meio - 9; y2 = meio + 9; } else { y1 = meio + 9; y2 = meio - 9; }
  }

  return (
    <figure className="grafico flex flex-col gap-3">
      <figcaption>
        <p className="font-sora text-base font-bold text-texto">{titulo}</p>
        <p id={idDesc} className="text-sm text-texto-suave">{descricao}</p>
      </figcaption>
      <Legenda />
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={titulo} aria-describedby={idDesc}>
        <Eixos max={max} unidade={unidade} casas={casas} horas={pontos.map(p => p.hora)} />
        {referencia && (
          <g>
            <line x1={M.esq} x2={M.esq + LI} y1={y(referencia.valor)} y2={y(referencia.valor)} stroke="#C9CDE0" strokeWidth="1.5" strokeDasharray="2 3" />
            <text x={M.esq + 4} y={y(referencia.valor) - 5} fontFamily="Space Mono, monospace" fontSize="12" fill="#5D6384">
              {referencia.rotulo}
            </text>
          </g>
        )}
        <path d={linha('r1')} fill="none" stroke={COR_R1} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={linha('r2')} fill="none" stroke={COR_R2} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {pontos.map((p, i) => (
          <g key={p.hora}>
            {p.r1 !== null && <circle cx={x(i)} cy={y(p.r1)} r="3" fill="#fff" stroke={COR_R1} strokeWidth="2" />}
            {p.r2 !== null && <circle cx={x(i)} cy={y(p.r2)} r="3.5" fill={COR_R2} />}
          </g>
        ))}
        <g fontFamily="Sora, sans-serif" fontSize="14" fontWeight="700">
          {u1 && (
            <text x={x(u1.i) + 8} y={y1 + 4} fill={COR_R1}>
              R1 {formatarNumero(u1.v, casas)}{unidade}
            </text>
          )}
          {u2 && (
            <text x={x(u2.i) + 8} y={y2 + 4} fill={COR_R2}>
              R2 {formatarNumero(u2.v, casas)}{unidade}
            </text>
          )}
        </g>
      </svg>
      {tabelaAcessivel(titulo, pontos, unidade, casas)}
    </figure>
  );
}

export function GraficoBarras({ titulo, descricao, pontos, unidade = '', minimoEixo = 1, casas = 1 }: GraficoProps) {
  const idDesc = useId();
  const L = L_BARRAS;
  const LI = L - M.esq - M.dir;
  const valores = pontos.flatMap(p => [p.r1, p.r2]).filter((v): v is number => v !== null);
  const max = escalaMax(valores, minimoEixo);
  const passo = LI / Math.max(1, pontos.length);
  const larg = Math.min(22, passo / 2 - 4);
  const y = (v: number) => M.topo + AI - (v / max) * AI;

  return (
    <figure className="grafico flex flex-col gap-3">
      <figcaption>
        <p className="font-sora text-base font-bold text-texto">{titulo}</p>
        <p id={idDesc} className="text-sm text-texto-suave">{descricao}</p>
      </figcaption>
      <Legenda barras />
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={titulo} aria-describedby={idDesc}>
        <g fontFamily="Space Mono, monospace" fontSize={FONTE_EIXO} fill="#5D6384">
          {ticks(max).map(t => (
            <g key={t}>
              <line x1={M.esq} x2={M.esq + LI} y1={y(t)} y2={y(t)} stroke="#E3E5F0" />
              <text x={M.esq - 8} y={y(t) + 4} textAnchor="end">{formatarNumero(t, casas)}{unidade}</text>
            </g>
          ))}
          {pontos.map((p, i) => (
            <text key={p.hora} x={M.esq + passo * i + passo / 2} y={A - 12} textAnchor="middle">
              {i % 2 === 0 ? `${p.hora}h` : ''}
            </text>
          ))}
        </g>
        {pontos.map((p, i) => {
          const cx = M.esq + passo * i + passo / 2;
          return (
            <g key={p.hora}>
              {p.r1 !== null && p.r1 > 0 && (
                <rect x={cx - larg - 1} y={y(p.r1)} width={larg} height={M.topo + AI - y(p.r1)} rx="3" fill="#fff" stroke={COR_R1} strokeWidth="2" strokeDasharray="4 2" />
              )}
              {p.r2 !== null && p.r2 > 0 && (
                <rect x={cx + 1} y={y(p.r2)} width={larg} height={M.topo + AI - y(p.r2)} rx="3" fill={COR_R2} />
              )}
            </g>
          );
        })}
      </svg>
      {tabelaAcessivel(titulo, pontos, unidade, casas)}
    </figure>
  );
}
