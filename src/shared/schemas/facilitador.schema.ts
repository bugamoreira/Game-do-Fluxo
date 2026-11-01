// Entradas e respostas das RPCs do facilitador e do relatório.
// As RPCs do facilitador devolvem o estado da turma (visão do facilitador),
// validado com `EstadoTurmaSchema` (turma.schema.ts).

import { z } from 'zod';
import { IdSchema, InstanteSchema, objetoCamel, umaLinha } from './comum';
import { StatusTurmaSchema } from './turma.schema';

export const LoginEntradaSchema = z.object({
  email: z.email({ message: 'E-mail inválido' }),
  senha: z.string().min(6, { message: 'Senha curta demais' }),
});
export type LoginEntrada = z.infer<typeof LoginEntradaSchema>;

export const SessaoFacilitadorSchema = z.object({
  userId: IdSchema,
  email: z.string(),
});
export type SessaoFacilitador = z.infer<typeof SessaoFacilitadorSchema>;

/** Mesmas regras de `abrir_turma` no banco: código 3–16 letras/números, nome 2–80, evento até 120. */
export const AbrirTurmaEntradaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{3,16}$/, { message: 'Código: de 3 a 16 letras ou números, sem espaço.' })),
  nome: z.string().trim().min(2, { message: 'Nome da turma: de 2 a 80 caracteres.' }).max(80),
  evento: z.string().trim().max(120).optional(),
  /** Data do evento, `AAAA-MM-DD`. Sem ela, o servidor usa a data de hoje. */
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data no formato AAAA-MM-DD.' })
    .optional(),
  /** Arquiva a turma em andamento de mesmo código (depois de `CodigoEmUso` e confirmação). */
  substituir: z.boolean().optional(),
});
export type AbrirTurmaEntrada = z.input<typeof AbrirTurmaEntradaSchema>;

export const MudarStatusEntradaSchema = z.object({
  turmaId: IdSchema,
  status: StatusTurmaSchema,
});

/** Slug público do relatório (o banco gera 24 caracteres base64url). */
export const SlugSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

/** `gerar_relatorio` devolve `{ slug, turma }`. */
export const RelatorioGeradoSchema = z.preprocess(umaLinha, z.object({ slug: SlugSchema }));

/**
 * `obter_relatorio(p_slug)`: `{ slug, criado_em, versao_regras, dados }`.
 * `dados` é o retrato congelado (turma, grupos, ranking R1/R2, placar, séries,
 * eventos); o formato detalhado é tratado na tela do relatório (C4).
 */
export const RelatorioSchema = z.preprocess(
  umaLinha,
  objetoCamel(
    z.object({
      slug: SlugSchema,
      criadoEm: InstanteSchema,
      versaoRegras: z.string().nullable(),
      dados: z.record(z.string(), z.unknown()),
    }),
  ).nullable(),
);
export type Relatorio = NonNullable<z.infer<typeof RelatorioSchema>>;
