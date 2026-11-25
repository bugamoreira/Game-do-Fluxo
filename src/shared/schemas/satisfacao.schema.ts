// Pesquisa de satisfação do curso (migração 20261125090000).
import { z } from 'zod';

const Nota5 = z.number().int().min(1).max(5);

/** Resposta enviada pelo formulário. Só o NPS é obrigatório. */
export const RespostaSatisfacaoSchema = z.object({
  turma: z.string().regex(/^[a-z0-9]{2,20}$/).default('cbmede26'),
  nps: z.number().int().min(0).max(10),
  nps_motivo: z.string().max(1000).optional(),
  aplicabilidade: Nota5.optional(),
  profundidade: z.enum(['basico', 'adequado', 'avancado']).optional(),
  bloco_ito: Nota5.optional(),
  bloco_filas: Nota5.optional(),
  bloco_indicadores: Nota5.optional(),
  bloco_triagem: Nota5.optional(),
  bloco_lean: Nota5.optional(),
  bloco_superlotacao: Nota5.optional(),
  bloco_lideranca: Nota5.optional(),
  pratica_game_fluxo: Nota5.optional(),
  pratica_conflito: Nota5.optional(),
  equilibrio: z.enum(['teoria_demais', 'equilibrado', 'pratica_demais']).optional(),
  gustavo_dominio: Nota5.optional(),
  gustavo_clareza: Nota5.optional(),
  gustavo_interacao: Nota5.optional(),
  juliana_dominio: Nota5.optional(),
  juliana_clareza: Nota5.optional(),
  juliana_interacao: Nota5.optional(),
  log_sala: Nota5.optional(),
  log_duracao: Nota5.optional(),
  log_ritmo: Nota5.optional(),
  log_intervalos: Nota5.optional(),
  aplicar_30_dias: z.string().max(1000).optional(),
  mudaria: z.string().max(1000).optional(),
  temas_futuros: z.string().max(1000).optional(),
  email: z.email({ message: 'Confira o e-mail.' }).max(200).optional(),
  quer_conteudos: z.boolean().default(false),
  interesse_consultoria: z.boolean().default(false),
});
export type RespostaSatisfacao = z.input<typeof RespostaSatisfacaoSchema>;

const Media = z.coerce.number().nullable();
const Contagem = z.coerce.number().int().min(0);
const Textos = z.array(z.string()).default([]);

export const PainelSatisfacaoSchema = z.object({
  n: Contagem,
  nps: z.coerce.number().nullable(),
  promotores: Contagem,
  neutros: Contagem,
  detratores: Contagem,
  distribuicao_nps: z.array(Contagem),
  medias: z.record(z.string(), Media),
  profundidade: z.object({ basico: Contagem, adequado: Contagem, avancado: Contagem }),
  equilibrio: z.object({ teoria_demais: Contagem, equilibrado: Contagem, pratica_demais: Contagem }),
  aplicar_30_dias: Textos,
  nps_motivo: Textos,
  mudaria: Textos,
  temas_futuros: Textos,
});
export type PainelSatisfacao = z.infer<typeof PainelSatisfacaoSchema>;

export const LeadSatisfacaoSchema = z.object({
  data: z.string(),
  email: z.string().nullable(),
  quer_conteudos: z.boolean(),
  interesse_consultoria: z.boolean(),
  nps: z.number().int(),
});
export const LeadsSatisfacaoSchema = z.array(LeadSatisfacaoSchema);
export type LeadSatisfacao = z.infer<typeof LeadSatisfacaoSchema>;
