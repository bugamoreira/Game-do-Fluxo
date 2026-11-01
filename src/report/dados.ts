// ============================================================
// Leitura de `relatorios.dados` (retrato congelado por `gerar_relatorio`,
// supabase/migrations/20261101190100_cbmede_rpcs.sql).
//
// O banco grava snake_case; as métricas são opacas (formato do motor) e
// podem não ter todas as chaves. A leitura é tolerante: o que faltar vira
// "sem dado" na tela, nunca erro. Só a estrutura mínima é exigida.
// ============================================================

import { z } from 'zod';

/** Registro de números: ignora qualquer valor que não seja número finito. */
const NumerosSchema = z
  .record(z.string(), z.unknown())
  .nullish()
  .transform(rec => {
    const saida: Record<string, number> = {};
    for (const [k, v] of Object.entries(rec ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) saida[k] = v;
    }
    return saida;
  });

const RodadaSchema = z.union([z.literal(1), z.literal(2)]);

const TurmaSchema = z.object({
  id: z.string().optional(),
  codigo: z.string().nullish(),
  nome: z.string().nullish(),
  evento: z.string().nullish(),
  data: z.string().nullish(),
});

const GrupoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  cor: z.string(),
  rodada_entrada: z.number().nullish(),
});

const ItemRankingSchema = z.object({
  grupo_id: z.string(),
  nome: z.string().optional(),
  cor: z.string().optional(),
  rodada: RodadaSchema,
  pontuacao: z.number(),
  minuto: z.number().nullish(),
  metricas: NumerosSchema,
});

const PlacarSchema = z.object({
  grupo_id: z.string(),
  rodada: RodadaSchema,
  minuto: z.number().nullish(),
  pontuacao: z.number(),
  metricas: NumerosSchema,
});

const PontoSerieSchema = z.object({
  grupo_id: z.string(),
  rodada: RodadaSchema,
  minuto: z.number(),
  metricas: NumerosSchema,
});

const EventoSchema = z.object({
  grupo_id: z.string(),
  rodada: RodadaSchema,
  minuto: z.number(),
  tipo: z.string(),
  mensagem: z.string().nullish(),
});

/** Lista em que um item malformado é descartado, sem derrubar o relatório. */
function listaTolerante<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .nullish()
    .transform(itens => {
      const ok: z.infer<T>[] = [];
      for (const i of itens ?? []) {
        const r = item.safeParse(i);
        if (r.success) ok.push(r.data);
      }
      return ok;
    });
}

export const DadosRelatorioSchema = z.object({
  turma: TurmaSchema,
  /** Nome do facilitador (`facilitadores.nome`), gravado por `gerar_relatorio`. */
  facilitador: z.string().nullish(),
  /** Local do evento, gravado por `gerar_relatorio` (`p_local`). */
  local: z.string().nullish(),
  gerado_em: z.string().nullish(),
  versao_regras: z.string().nullish(),
  grupos: listaTolerante(GrupoSchema),
  ranking: z
    .object({
      rodada1: listaTolerante(ItemRankingSchema),
      rodada2: listaTolerante(ItemRankingSchema),
    })
    .nullish(),
  placar: listaTolerante(PlacarSchema),
  series: listaTolerante(PontoSerieSchema),
  eventos: listaTolerante(EventoSchema),
});

export type DadosRelatorio = z.infer<typeof DadosRelatorioSchema>;
export type PontoSerie = z.infer<typeof PontoSerieSchema>;
export type EventoRelatorio = z.infer<typeof EventoSchema>;

export class DadosRelatorioInvalidos extends Error {
  constructor() {
    super('Os dados deste relatório estão incompletos ou num formato desconhecido.');
    this.name = 'DadosRelatorioInvalidos';
  }
}

/** Valida `relatorios.dados`. Lança `DadosRelatorioInvalidos` se faltar a estrutura mínima. */
export function lerDadosRelatorio(dados: unknown): DadosRelatorio {
  const r = DadosRelatorioSchema.safeParse(dados);
  if (!r.success) throw new DadosRelatorioInvalidos();
  return r.data;
}
