// Parâmetros de entrada do app do jogador (jogar.html).

export const SALA_PADRAO = 'CBMEDE';

export type ModoApp = 'online' | 'solo' | 'demo';

/** Telas do modo demonstração (revisão visual sem servidor). */
export type TelaDemo = 'nome' | 'espera' | 'travado' | 'debrief' | 'lean' | 'final';

export interface ParametrosApp {
  modo: ModoApp;
  sala: string;
  telaDemo: TelaDemo;
  /** Demo: entra direto com este grupo (pula a J1). */
  grupoDemo: string | null;
}

const TELAS_DEMO: readonly TelaDemo[] = ['nome', 'espera', 'travado', 'debrief', 'lean', 'final'];

function ehTelaDemo(v: string | null): v is TelaDemo {
  return v !== null && (TELAS_DEMO as readonly string[]).includes(v);
}

/** Código da sala: letras e números, até 32; vazio ou inválido cai no padrão. */
export function normalizarSala(bruto: string | null): string {
  const limpo = (bruto ?? '').trim().toUpperCase();
  return /^[A-Z0-9_-]{1,32}$/.test(limpo) ? limpo : SALA_PADRAO;
}

export function lerParametros(busca: string): ParametrosApp {
  const q = new URLSearchParams(busca);
  const grupo = q.get('grupo')?.trim();
  const tela = q.get('tela');
  return {
    modo: q.get('demo') === '1' ? 'demo' : q.get('modo') === 'solo' ? 'solo' : 'online',
    sala: normalizarSala(q.get('sala')),
    telaDemo: ehTelaDemo(tela) ? tela : 'nome',
    grupoDemo: grupo ? grupo.slice(0, 30) : null,
  };
}
