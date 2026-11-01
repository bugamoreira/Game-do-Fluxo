// Respostas das RPCs públicas `estado_turma(codigo)` e `ranking(codigo)`.
// Formato de tela: docs/contratos.md §4.

import { z } from 'zod';
import {
  CorSchema,
  IdSchema,
  InstanteSchema,
  MetricasSchema,
  RodadaSchema,
  objetoCamel,
  umaLinha,
} from './comum';

/** Código de acesso da turma: 4 dígitos, mostrado no telão e no painel do facilitador. */
export const CodigoAcessoSchema = z.string().regex(/^[0-9]{4}$/, { message: 'O código de acesso tem 4 dígitos.' });

export const StatusTurmaSchema = z.enum([
  'aberta',
  'rodada1',
  'debrief',
  'rodada2',
  'encerrada',
  'arquivada',
]);
export type StatusTurma = z.infer<typeof StatusTurmaSchema>;

export const GrupoDaTurmaSchema = objetoCamel(
  z.object({
    id: IdSchema,
    nome: z.string().min(1),
    cor: CorSchema,
    /** Visto pelo servidor nos últimos 15 s. */
    conectado: z.boolean(),
    // Só na visão do facilitador (respostas das RPCs do facilitador):
    vistoEm: InstanteSchema.nullable().optional(),
    reconexaoLiberada: z.boolean().optional(),
    removido: z.boolean().optional(),
  }),
);
export type GrupoDaTurma = z.infer<typeof GrupoDaTurmaSchema>;

export const EstadoTurmaSchema = objetoCamel(
  z.object({
    id: IdSchema,
    codigo: z.string().min(1),
    nome: z.string(),
    evento: z.string().nullable().optional(),
    data: z.string().nullable().optional(),
    status: StatusTurmaSchema,
    rodada: RodadaSchema.nullable(),
    rodadaInicio: InstanteSchema.nullable(),
    rodadaFim: InstanteSchema.nullable().optional(),
    pausada: z.boolean(),
    /** Início da pausa em curso: o relógio fica congelado nele. */
    pausadaEm: InstanteSchema.nullable().optional(),
    pausaAcumuladaMs: z.number().int().min(0),
    /** Minuto calculado pelo servidor no instante da resposta (o hook recalcula entre consultas). */
    minuto: z.number().int().nullable().optional(),
    horaServidor: InstanteSchema,
    entradaLiberada: z.boolean(),
    fullCapacityLiberado: z.boolean(),
    musicaMudo: z.boolean(),
    grupos: z.array(GrupoDaTurmaSchema),
    /** Só na visão do facilitador: código de acesso de 4 dígitos para os grupos entrarem. */
    codigoAcesso: CodigoAcessoSchema.optional(),
    /** Só quando a consulta leva o token do grupo: o token ainda vale nesta turma. */
    tokenValido: z.boolean().optional(),
  }),
);
export type EstadoTurma = z.infer<typeof EstadoTurmaSchema>;

/** `estado_turma` devolve objeto (aceita também lista de uma linha); nulo é tratado como turma inexistente. */
export const RespostaEstadoTurmaSchema = z.preprocess(umaLinha, EstadoTurmaSchema.nullable());

export const ItemRankingSchema = objetoCamel(
  z.object({
    posicao: z.number().int().min(1).optional(),
    grupoId: IdSchema,
    nome: z.string().min(1),
    cor: CorSchema,
    rodada: RodadaSchema,
    pontuacao: z.number(),
    metricas: MetricasSchema,
    minuto: z.number().int().min(0).max(1440),
  }),
);
export type ItemRanking = z.infer<typeof ItemRankingSchema>;

/** `ranking` devolve lista (vazia se ninguém jogou); nulo vira lista vazia. */
export const RespostaRankingSchema = z.preprocess(
  (v) => (v === null ? [] : v),
  z.array(ItemRankingSchema),
);
