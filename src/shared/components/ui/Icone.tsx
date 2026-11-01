import type { SVGProps } from 'react';

/** Ícones de traço (24×24), decorativos por padrão: o significado sempre vem também em texto. */
const CAMINHOS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alerta: 'M12 8v5M12 16.5v.5M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  fechar: 'M6 6l12 12M18 6L6 18',
  ampulheta: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
  cadeado: 'M7 11V8a5 5 0 0110 0v3M5.5 11h13v9.5h-13z',
  setaCima: 'M12 19V5M6 11l6-6 6 6',
  setaBaixo: 'M12 5v14M6 13l6 6 6-6',
  setaDireita: 'M5 12h14M13 6l6 6-6 6',
  setaEsquerda: 'M19 12H5M11 6l-6 6 6 6',
  relogio: 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z',
  semSinal: 'M3 3l18 18M8.5 16.5a5 5 0 017 0M5 13a10 10 0 015-2.7M19 13a10 10 0 00-2.4-1.7M2 9.5a15 15 0 014.5-2.8M22 9.5A15 15 0 0011 5.5M12 20h.01',
  recarregar: 'M20 12a8 8 0 11-2.3-5.7M20 4v4.5h-4.5',
  info: 'M12 11v6M12 7.5v.5M12 21a9 9 0 110-18 9 9 0 010 18z',
  raio: 'M13 2L4.5 13.5H12L11 22l8.5-11.5H12z',
  sala: 'M4 21V5a2 2 0 012-2h9l5 5v13M4 21h16M14 3v5h5',
  aoVivo: 'M12 14a2 2 0 100-4 2 2 0 000 4zM7.8 16.2a6 6 0 010-8.4M16.2 7.8a6 6 0 010 8.4M5 19a10 10 0 010-14M19 5a10 10 0 010 14',
  debrief: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  trofeu: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4',
  telao: 'M3 4h18v12H3zM8 20h8M12 16v4',
  pausa: 'M9 5v14M15 5v14',
  play: 'M7 4.5v15l12-7.5z',
  musica: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  pessoa: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  cruz: 'M12 5v14M5 12h14',
  obs: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  tubo: 'M9 3h6M10 3v13a2 2 0 004 0V3M10 10h4',
  desvio: 'M4 7h11l-3-3M20 17H9l3 3',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

interface IconeProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  nome: NomeIcone;
  tamanho?: number;
  /** Texto para leitor de tela; sem ele o ícone é decorativo. */
  rotulo?: string;
}

export function Icone({ nome, tamanho = 20, rotulo, strokeWidth = 2, ...resto }: IconeProps) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      focusable="false"
      {...resto}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
