// Formatação de números e textos do painel (pt-BR). Funções puras.

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const UMA_CASA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 1234 → "1.234". */
export function inteiro(v: number): string {
  return INTEIRO.format(Math.round(v));
}

/** 3.25 → "3,3". */
export function umaCasa(v: number): string {
  return UMA_CASA.format(v);
}

/** 82.4 → "82%". */
export function porcento(v: number): string {
  return `${INTEIRO.format(Math.round(v))}%`;
}

/** Horas de boarding: 12.5 → "12,5 h". */
export function horas(v: number): string {
  return `${umaCasa(v)} h`;
}

/** Variação com sinal tipográfico: +12, −3, 0. */
export function comSinal(v: number, formato: (n: number) => string = inteiro): string {
  if (v === 0) return formato(0);
  return `${v > 0 ? '+' : '−'}${formato(Math.abs(v))}`;
}

/** Plural simples: plural(1, 'grupo', 'grupos') → "1 grupo". */
export function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** Lista em português: ["A", "B", "C"] → "A, B e C". */
export function listaNatural(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** Segundos decorridos em texto curto: 8 → "8 s", 75 → "1 min", 4000 → "1 h". */
export function tempoDecorrido(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}
