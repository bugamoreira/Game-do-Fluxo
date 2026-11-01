// ============================================================
// Evolução ao longo do plantão e eventos marcantes, a partir das leituras do
// facilitador (`series_turma`, `eventos_turma`). Funções puras, usadas pelo
// painel do facilitador e pelo telão. Mesma regra do relatório
// (src/report/transformar.ts): em cada hora, o último ponto de cada grupo até
// aquela hora; a turma é a média dos grupos.
// ============================================================

export type RodadaEvolucao = 1 | 2;

/** O mínimo de um ponto de série (formato de `PontoSerieTurma`). */
export interface PontoSerieBasico {
  grupoId: string;
  rodada: RodadaEvolucao;
  minuto: number;
  metricas: Record<string, number>;
}

/** O mínimo de um evento (formato de `EventoTurma`). */
export interface EventoBasico {
  id: number | string;
  grupoId: string;
  nome: string;
  cor: string;
  rodada: RodadaEvolucao;
  minuto: number;
  tipo: string;
  mensagem: string;
}

export interface PontoHora {
  hora: number;
  r1: number | null;
  r2: number | null;
}

/** Horas cheias do plantão: 7h a 19h. */
export const HORAS_DO_PLANTAO: readonly number[] = Array.from({ length: 13 }, (_, i) => 7 + i);

function media(valores: number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((a, v) => a + v, 0) / valores.length;
}

/**
 * Média da turma, hora a hora, de uma métrica da série (R1 e R2).
 * Horas sem nenhum ponto ficam `null` (a linha para ali).
 */
export function evolucaoPorHora(
  series: readonly PontoSerieBasico[],
  valor: (m: Record<string, number>) => number | undefined,
): PontoHora[] {
  const porGrupoRodada = new Map<string, PontoSerieBasico[]>();
  for (const p of series) {
    const k = `${p.rodada}|${p.grupoId}`;
    const lista = porGrupoRodada.get(k) ?? [];
    lista.push(p);
    porGrupoRodada.set(k, lista);
  }
  for (const lista of porGrupoRodada.values()) lista.sort((a, b) => a.minuto - b.minuto);

  const valorEm = (rodada: RodadaEvolucao, hora: number): number | null => {
    const vals: number[] = [];
    for (const [k, pontos] of porGrupoRodada) {
      if (!k.startsWith(`${rodada}|`)) continue;
      let escolhido: PontoSerieBasico | undefined;
      for (const p of pontos) {
        if (p.minuto <= hora * 60) escolhido = p;
        else break;
      }
      // 7h sem ponto exato: aceita o primeiro registrado na primeira meia hora.
      if (!escolhido && pontos[0] && pontos[0].minuto <= hora * 60 + 30) escolhido = pontos[0];
      const v = escolhido ? valor(escolhido.metricas) : undefined;
      if (v !== undefined && Number.isFinite(v)) vals.push(v);
    }
    return media(vals);
  };
  return HORAS_DO_PLANTAO.map((hora) => ({ hora, r1: valorEm(1, hora), r2: valorEm(2, hora) }));
}

/** Há pelo menos um valor na rodada pedida (ou em qualquer uma)? */
export function temEvolucao(pontos: readonly PontoHora[], rodada?: RodadaEvolucao): boolean {
  return pontos.some((p) => (rodada === 2 ? false : p.r1 !== null) || (rodada === 1 ? false : p.r2 !== null));
}

// ── Eventos marcantes ────────────────────────────────────────

export interface DescricaoEvento {
  rotulo: string;
  /** Problema (vermelho/âmbar) ou ferramenta de fluxo (verde). */
  problema: boolean;
}

/** Tipos gravados pelo jogo (`TipoOcorrencia` do motor) que viram destaque. */
const DESCRICOES: Readonly<Record<string, DescricaoEvento>> = {
  obito: { rotulo: 'Óbito', problema: true },
  obito_espera: { rotulo: 'Óbito na espera', problema: true },
  emergencia_obito: { rotulo: 'Óbito sem sala cirúrgica', problema: true },
  deterioracao: { rotulo: 'Deterioração', problema: true },
  deterioracao_espera: { rotulo: 'Deterioração na espera', problema: true },
  deterioracao_leito_inadequado: { rotulo: 'Deterioração em leito inadequado', problema: true },
  retorno_de: { rotulo: 'Retorno ao DE', problema: true },
  cirurgia_cancelada: { rotulo: 'Cirurgia cancelada', problema: true },
  de_lotado: { rotulo: 'DE lotado', problema: true },
  corredor: { rotulo: 'Paciente no corredor', problema: true },
  lwbs: { rotulo: 'Saída sem atendimento', problema: true },
  surto: { rotulo: 'Surto de chegadas', problema: true },
  leito_inadequado: { rotulo: 'Leito inadequado', problema: true },
  nir: { rotulo: 'NIR acionado', problema: false },
  nir_concluido: { rotulo: 'Transferência pelo NIR', problema: false },
  full_capacity: { rotulo: 'PCP (Full Capacity)', problema: false },
  full_capacity_liberado: { rotulo: 'PCP liberado', problema: false },
};

export function descreverEvento(tipo: string): DescricaoEvento | null {
  return DESCRICOES[tipo] ?? null;
}

/** "07:30" a partir do minuto do plantão (420 = 7h). */
export function horaDoMinuto(minuto: number): string {
  const h = Math.floor(minuto / 60);
  const m = minuto % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface EventoMarcante extends EventoBasico, DescricaoEvento {}

/**
 * Eventos conhecidos, na ordem recebida (mais recentes primeiro), opcionalmente
 * de uma rodada, até `limite`.
 */
export function eventosMarcantes(
  eventos: readonly EventoBasico[],
  opcoes: { rodada?: RodadaEvolucao; limite?: number } = {},
): EventoMarcante[] {
  const saida: EventoMarcante[] = [];
  for (const e of eventos) {
    if (opcoes.rodada !== undefined && e.rodada !== opcoes.rodada) continue;
    const d = descreverEvento(e.tipo);
    if (!d) continue;
    saida.push({ ...e, ...d });
    if (opcoes.limite !== undefined && saida.length >= opcoes.limite) break;
  }
  return saida;
}

/** Contagem por rótulo (para "o que mais aconteceu"), da maior para a menor. */
export function contarPorRotulo(eventos: readonly EventoMarcante[]): { rotulo: string; problema: boolean; total: number }[] {
  const mapa = new Map<string, { rotulo: string; problema: boolean; total: number }>();
  for (const e of eventos) {
    const atual = mapa.get(e.rotulo) ?? { rotulo: e.rotulo, problema: e.problema, total: 0 };
    atual.total++;
    mapa.set(e.rotulo, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
