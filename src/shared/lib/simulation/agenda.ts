// ============================================================
// Agenda do plantão: chegadas e lotes de alta gerados da semente.
// Usa o gerador de DEMANDA, separado do de eventos: a mesma semente
// produz a mesma agenda na R1 e na R2.
// ============================================================

import type { Severity } from '../../types/game';
import { nomeAleatorio } from '../game-engine';
import { MINUTO_FIM_PLANTAO, MINUTO_INICIO_PLANTAO } from './relogio';
import {
  DESTINO_POR_GRAVIDADE, LOTES_ALTA, P_FORA_DO_PERFIL, PERFIL_GRAVIDADE, SURTO_MINUTO, SURTO_PACIENTES,
  TAXA_CHEGADA_POR_HORA, TEMPO_DECISAO, type DestinoChegada,
} from './constantes';
import type { Gerador } from './rng';
import type { ChaveLote, ChegadaPlanejada, LoteAlta } from './types';

const GRAVIDADES: readonly Severity[] = ['red', 'orange', 'yellow', 'green'];
const DESTINOS: readonly DestinoChegada[] = ['uti', 'enf', 'alta_de'];

function sortearPor<T extends string>(g: Gerador, opcoes: readonly T[], pesos: Partial<Record<T, number>>): T {
  const total = opcoes.reduce((a, o) => a + (pesos[o] ?? 0), 0);
  let r = g.proximo() * total;
  for (const o of opcoes) {
    r -= pesos[o] ?? 0;
    if (r < 0) return o;
  }
  const validas = opcoes.filter(o => (pesos[o] ?? 0) > 0);
  return validas[validas.length - 1]!;
}

function sortearChegada(g: Gerador, minuto: number, surto: boolean, forcar?: { sev: Severity; dest: DestinoChegada }): ChegadaPlanejada {
  const sev = forcar?.sev ?? sortearPor(g, GRAVIDADES, PERFIL_GRAVIDADE);
  const dest = forcar?.dest ?? sortearPor(g, DESTINOS, DESTINO_POR_GRAVIDADE[sev]);
  const [a, b] = TEMPO_DECISAO[sev];
  const deNeed = g.inteiro(a, b);
  const nome = nomeAleatorio(g.proximo);
  const foraDoPerfil = !forcar && !surto && g.proximo() < P_FORA_DO_PERFIL;
  return { minuto, sev, dest, deNeed, nome, surto, foraDoPerfil };
}

/** Taxa da hora do minuto m (minutos 421–480 pertencem às 7h, …, 1081–1140 às 18h). */
export function taxaDoMinuto(m: number): number {
  return TAXA_CHEGADA_POR_HORA[Math.floor((m - 1) / 60)] ?? 0;
}

export function gerarChegadas(g: Gerador): ChegadaPlanejada[] {
  const lista: ChegadaPlanejada[] = [];
  for (let m = MINUTO_INICIO_PLANTAO + 1; m <= MINUTO_FIM_PLANTAO; m++) {
    if (g.proximo() < taxaDoMinuto(m) / 60) lista.push(sortearChegada(g, m, false));
    if (m === SURTO_MINUTO) {
      for (let i = 0; i < SURTO_PACIENTES; i++) {
        lista.push(sortearChegada(g, m, true, i === SURTO_PACIENTES - 1 ? { sev: 'red', dest: 'uti' } : undefined));
      }
    }
  }
  return lista;
}

function embaralhar<T>(g: Gerador, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(g.proximo() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Sorteia quais pacientes do censo inicial recebem alta em cada lote (sem repetir). */
export function gerarLotesAlta(g: Gerador, idsEnf: readonly number[], idsUti: readonly number[]): LoteAlta[] {
  const filas = { enf: embaralhar(g, idsEnf), uti: embaralhar(g, idsUti) };
  return (Object.keys(LOTES_ALTA) as ChaveLote[]).map(chave => {
    const cfg = LOTES_ALTA[chave];
    const n = g.inteiro(cfg.quantidade[0], cfg.quantidade[1]);
    const ids = filas[cfg.setor].splice(0, n);
    return { chave, pacientes: ids.map(id => ({ id, prepR1: g.inteiro(cfg.prepR1[0], cfg.prepR1[1]) })) };
  });
}
