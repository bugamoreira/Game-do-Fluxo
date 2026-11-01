// ============================================================
// Gerador determinístico mulberry32
// O estado é um inteiro de 32 bits guardado em EstadoSimulacao.rng.
// ============================================================

export interface Gerador {
  /** Número em [0, 1) */
  proximo: () => number;
  /** Inteiro em [a, b], inclusivo */
  inteiro: (a: number, b: number) => number;
  /** Estado atual, para gravar de volta no EstadoSimulacao */
  estado: () => number;
}

/** Normaliza qualquer semente numérica para um estado inicial de 32 bits. */
export function estadoDaSemente(semente: number): number {
  return Math.trunc(semente) >>> 0;
}

/** Cria um gerador local a partir do estado. A mutação fica confinada ao gerador. */
export function criarGerador(estadoInicial: number): Gerador {
  let a = estadoInicial >>> 0;
  const proximo = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    inteiro: (x, y) => x + Math.floor(proximo() * (y - x + 1)),
    estado: () => a,
  };
}

/** Canais independentes derivados da mesma semente (demanda ≠ eventos). */
export const CANAL_DEMANDA = 1;
export const CANAL_EVENTOS = 2;

/** Estado inicial de um gerador independente para o canal pedido. */
export function estadoDoCanal(semente: number, canal: number): number {
  const g = criarGerador((estadoDaSemente(semente) ^ Math.imul(canal, 0x9e3779b9)) >>> 0);
  g.proximo();
  return g.estado();
}
