// Gráfico de linhas R1 × R2 ao longo do plantão (SVG próprio, sem biblioteca),
// para o painel do facilitador (tema claro) e o telão (tema escuro).
// Travado tracejado, Lean contínuo, com rótulo direto no fim de cada linha:
// a diferença não depende só da cor. Uma tabela oculta repete os números
// para leitores de tela.

import { useId } from 'react';
import type { PontoHora } from '../lib/evolucao';

const PALETAS = {
  claro: { r1: '#7B819F', r2: '#1B2A6B', grade: '#E3E5F0', eixo: '#5D6384', fundoPonto: '#ffffff' },
  escuro: { r1: 'rgba(255,255,255,0.72)', r2: '#F5C518', grade: 'rgba(255,255,255,0.14)', eixo: 'rgba(255,255,255,0.8)', fundoPonto: '#0e1840' },
} as const;

export interface GraficoEvolucaoProps {
  titulo: string;
  pontos: PontoHora[];
  tema?: 'claro' | 'escuro';
  unidade?: string;
  casas?: 0 | 1;
  /** Menor valor do topo do eixo (evita escala exagerada com números pequenos). */
  minimoEixo?: number;
  /** Escala do texto (o telão é visto de longe). */
  fonte?: number;
  className?: string;
}

function escalaMax(valores: number[], minimo: number): number {
  const max = Math.max(minimo, ...valores);
  const passo = max <= 5 ? 1 : max <= 10 ? 2 : max <= 50 ? 10 : max <= 150 ? 25 : 50;
  return Math.ceil(max / passo) * passo;
}

function numero(v: number, casas: 0 | 1): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function GraficoEvolucao({
  titulo,
  pontos,
  tema = 'claro',
  unidade = '',
  casas = 0,
  minimoEixo = 1,
  fonte = 13,
  className,
}: GraficoEvolucaoProps) {
  const idTabela = useId();
  const cor = PALETAS[tema];
  const L = 560;
  const A = 260;
  const M = { topo: 16, dir: fonte * 7, base: fonte * 2.6, esq: fonte * 3.6 };
  const LI = L - M.esq - M.dir;
  const AI = A - M.topo - M.base;
  const valores = pontos.flatMap((p) => [p.r1, p.r2]).filter((v): v is number => v !== null);
  const max = escalaMax(valores, minimoEixo);
  const x = (i: number) => M.esq + (pontos.length <= 1 ? 0 : (i / (pontos.length - 1)) * LI);
  const y = (v: number) => M.topo + AI - (v / max) * AI;

  const caminho = (chave: 'r1' | 'r2') => {
    const partes: string[] = [];
    let aberto = false;
    pontos.forEach((p, i) => {
      const v = p[chave];
      if (v === null) {
        aberto = false;
        return;
      }
      partes.push(`${aberto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      aberto = true;
    });
    return partes.join(' ');
  };
  const ultimo = (chave: 'r1' | 'r2') => {
    for (let i = pontos.length - 1; i >= 0; i--) {
      const v = pontos[i]?.[chave];
      if (v !== null && v !== undefined) return { i, v };
    }
    return null;
  };
  const u1 = ultimo('r1');
  const u2 = ultimo('r2');
  let y1 = u1 ? y(u1.v) : 0;
  let y2 = u2 ? y(u2.v) : 0;
  const folga = fonte * 1.3;
  if (u1 && u2 && Math.abs(y1 - y2) < folga) {
    const meio = (y1 + y2) / 2;
    if (y1 <= y2) {
      y1 = meio - folga / 2;
      y2 = meio + folga / 2;
    } else {
      y1 = meio + folga / 2;
      y2 = meio - folga / 2;
    }
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const formatar = (v: number | null) => (v === null ? 'sem dado' : `${numero(v, casas)}${unidade}`);

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={titulo} aria-describedby={idTabela}>
        <g fontFamily="Space Mono, monospace" fontSize={fonte} fill={cor.eixo}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.esq} x2={M.esq + LI} y1={y(t)} y2={y(t)} stroke={cor.grade} strokeWidth="1" />
              <text x={M.esq - 6} y={y(t) + fonte / 3} textAnchor="end">
                {numero(t, max < 5 && t % 1 !== 0 ? 1 : 0)}
              </text>
            </g>
          ))}
          {pontos.map((p, i) =>
            i % 2 === 0 ? (
              <text key={p.hora} x={x(i)} y={A - fonte * 0.8} textAnchor="middle">
                {p.hora}h
              </text>
            ) : null,
          )}
        </g>
        <path d={caminho('r1')} fill="none" stroke={cor.r1} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={caminho('r2')} fill="none" stroke={cor.r2} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {pontos.map((p, i) => (
          <g key={p.hora}>
            {p.r1 !== null && <circle cx={x(i)} cy={y(p.r1)} r="3" fill={cor.fundoPonto} stroke={cor.r1} strokeWidth="2" />}
            {p.r2 !== null && <circle cx={x(i)} cy={y(p.r2)} r="3.5" fill={cor.r2} />}
          </g>
        ))}
        <g fontFamily="Sora, sans-serif" fontSize={fonte + 1} fontWeight="700">
          {u1 && (
            <text x={x(u1.i) + 8} y={y1 + fonte / 3} fill={cor.r1}>
              R1 {numero(u1.v, casas)}
              {unidade}
            </text>
          )}
          {u2 && (
            <text x={x(u2.i) + 8} y={y2 + fonte / 3} fill={cor.r2}>
              R2 {numero(u2.v, casas)}
              {unidade}
            </text>
          )}
        </g>
      </svg>
      <table id={idTabela} className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Plantão Travado</th>
            <th scope="col">Plantão Lean</th>
          </tr>
        </thead>
        <tbody>
          {pontos.map((p) => (
            <tr key={p.hora}>
              <th scope="row">{p.hora}h</th>
              <td>{formatar(p.r1)}</td>
              <td>{formatar(p.r2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Legenda das duas linhas (traço e cor), para acompanhar o gráfico. */
export function LegendaEvolucao({ tema = 'claro', className }: { tema?: 'claro' | 'escuro'; className?: string }) {
  const cor = PALETAS[tema];
  return (
    <div className={className} aria-hidden="true">
      <span className="inline-flex items-center gap-2">
        <svg width="28" height="8">
          <line x1="0" y1="4" x2="28" y2="4" stroke={cor.r1} strokeWidth="3" strokeDasharray="6 4" />
        </svg>
        Plantão Travado (R1)
      </span>
      <span className="ml-5 inline-flex items-center gap-2">
        <svg width="28" height="8">
          <line x1="0" y1="4" x2="28" y2="4" stroke={cor.r2} strokeWidth="3" />
        </svg>
        Plantão Lean (R2)
      </span>
    </div>
  );
}
