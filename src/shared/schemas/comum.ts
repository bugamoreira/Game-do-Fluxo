// ============================================================
// Peças comuns dos schemas de resposta das RPCs.
//
// As RPCs são escritas em paralelo (etapa B4). Para não quebrar por detalhe
// de convenção, os objetos de primeiro nível aceitam chaves em snake_case
// (padrão do banco) ou camelCase (padrão do contrato). A conversão é rasa:
// nunca entra no estado da simulação nem nas métricas, que são opacos.
// ============================================================

import { z } from 'zod';

function paraCamel(chave: string): string {
  return chave.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Converte as chaves de primeiro nível de snake_case para camelCase. */
export function camelizar(valor: unknown): unknown {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return valor;
  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor)) {
    saida[paraCamel(chave)] = v;
  }
  return saida;
}

/**
 * RPC que devolve `returns table` chega como lista de uma linha; `returns json`
 * chega como objeto. Para respostas de um único registro, aceita as duas.
 */
export function umaLinha(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.length > 0 ? valor[0] : null;
  return valor;
}

/** Objeto com chaves aceitas em snake_case ou camelCase. */
export function objetoCamel<T extends z.ZodType>(schema: T) {
  return z.preprocess(camelizar, schema);
}

/**
 * Converte um timestamp do Postgres em milissegundos. Aceita ISO 8601
 * (`2026-11-01T12:00:00.123456+00:00`) e o formato texto do Postgres
 * (`2026-11-01 12:00:00.123+00`). Devolve NaN se não reconhecer.
 */
export function instanteEmMs(texto: string): number {
  const normalizado = texto
    .trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  return Date.parse(normalizado);
}

export const InstanteSchema = z
  .string()
  .refine((s) => Number.isFinite(instanteEmMs(s)), { message: 'Data/hora inválida' });

export const RodadaSchema = z.union([z.literal(1), z.literal(2)]);
export type Rodada = z.infer<typeof RodadaSchema>;

export const MinutoSchema = z.number().int().min(420).max(1140);

export const CorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, { message: 'Cor deve ser hexadecimal' });

/** Métricas do placar: formato definido pelo motor (B1); aqui só exigimos números finitos. */
export const MetricasSchema = z.record(z.string(), z.number());
export type Metricas = z.infer<typeof MetricasSchema>;

/** Token do grupo: 32 bytes aleatórios em base64url (43 caracteres), gerado pelo servidor. */
export const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, { message: 'Token em formato inválido' });

/** Identificador de registro (uuid no banco; aqui basta não ser vazio). */
export const IdSchema = z.string().min(1);
