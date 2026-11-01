// Estado da simulação em trânsito (RPCs `entrar_grupo`, `obter_estado`,
// `enviar_estado`) e cópia local guardada no navegador do grupo.
//
// O estado completo é definido pelo motor (B1, docs/contratos.md §1). Aqui ele
// é opaco: só os campos de que a sincronização depende são validados; o resto
// passa intacto.

import { z } from 'zod';
import {
  CorSchema,
  IdSchema,
  InstanteSchema,
  MinutoSchema,
  RodadaSchema,
  TokenSchema,
  objetoCamel,
  umaLinha,
  type Rodada,
} from './comum';
import { StatusTurmaSchema } from './turma.schema';

export const EstadoSimulacaoTransporteSchema = z.looseObject({
  versao: z.number().int().min(0),
  rodada: RodadaSchema,
  minuto: MinutoSchema,
});

/** Estado da simulação visto pela camada de sincronização. O tipo completo é do B1. */
export type EstadoSimulacaoTransporte = { versao: number; rodada: 1 | 2; minuto: number } & Record<string, unknown>;

/**
 * Campos do estado de que a sincronização depende. Use nos parâmetros de entrada:
 * aceita a interface `EstadoSimulacao` do motor (interfaces não satisfazem tipos
 * com assinatura de índice, como `Record<string, unknown>`).
 */
export interface EstadoBaseSync {
  versao: number;
  rodada: 1 | 2;
  minuto: number;
}

/** Objeto cujas chaves são todas números (aceita a interface `Metricas` do motor). */
export type NumerosPorChave<T> = { [K in keyof T]: number };

/** Registro de `estado_jogo` devolvido por `obter_estado` e em `estado_salvo`: `{ rodada, minuto, versao, estado, atualizado_em }`. */
function extrairEstado(v: unknown): unknown {
  const linha = umaLinha(v);
  if (linha !== null && typeof linha === 'object' && 'estado' in linha) {
    return (linha as { estado: unknown }).estado;
  }
  return linha;
}

/** `obter_estado(p_token, p_rodada?)`: nulo (nada salvo) ou o registro com o estado. */
export const RespostaObterEstadoSchema = z.preprocess(extrairEstado, EstadoSimulacaoTransporteSchema.nullable());

export const GrupoEntradaSchema = objetoCamel(
  z.object({
    id: IdSchema,
    nome: z.string().min(1),
    cor: CorSchema,
  }),
);

/**
 * Resposta crua de `entrar_grupo`:
 * `{ turma_id, status, rodada, grupo{id,nome,cor}, token, reconectado, estado_salvo, hora_servidor }`.
 * `token` vem nulo quando o grupo reconectou com o próprio token (não troca).
 */
export const RespostaEntrarGrupoSchema = z.preprocess(
  umaLinha,
  objetoCamel(
    z.object({
      turmaId: IdSchema,
      status: StatusTurmaSchema,
      rodada: RodadaSchema.nullable(),
      grupo: GrupoEntradaSchema,
      token: TokenSchema.nullable(),
      reconectado: z.boolean(),
      estadoSalvo: z.preprocess(extrairEstado, EstadoSimulacaoTransporteSchema.nullable()).optional(),
      horaServidor: InstanteSchema.optional(),
    }),
  ),
);

/** Resultado de `grupoService.entrar` (contrato §2): o token é sempre o que vale para o grupo. */
export interface Entrada {
  turmaId: string;
  status: z.infer<typeof StatusTurmaSchema>;
  rodada: Rodada | null;
  grupo: { id: string; nome: string; cor: string };
  token: string;
  reconectado: boolean;
  estadoSalvo: EstadoSimulacaoTransporte | null;
}

/** Versão do formato da cópia local. Mudou o formato? Incremente: cópias antigas são descartadas. */
export const VERSAO_FORMATO_COPIA = 1;

export const CopiaLocalSchema = z.object({
  formato: z.literal(VERSAO_FORMATO_COPIA),
  token: TokenSchema,
  salvoEm: z.number().int().min(0),
  estado: EstadoSimulacaoTransporteSchema,
});
export type CopiaLocal = z.infer<typeof CopiaLocalSchema>;

/** Sessão do grupo neste computador: permite reconectar com o mesmo token. */
export const SessaoLocalSchema = z.object({
  formato: z.literal(VERSAO_FORMATO_COPIA),
  codigo: z.string().min(1),
  /** Turma em que o grupo entrou: sessão de outra turma com o mesmo código não reentra sozinha. */
  turmaId: IdSchema.optional(),
  grupoId: IdSchema,
  nome: z.string().min(1),
  cor: CorSchema,
  token: TokenSchema,
});
export type SessaoLocal = z.infer<typeof SessaoLocalSchema>;

/**
 * Item de `registrar_eventos(p_token, p_rodada, p_eventos)`: óbito, cancelamento, surto...
 * `chave` torna o reenvio idempotente (o servidor ignora chave repetida).
 */
export const EventoJogoSchema = z.object({
  minuto: MinutoSchema,
  tipo: z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/, { message: 'Tipo de evento inválido' }),
  mensagem: z.string().max(300).optional(),
  chave: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,64}$/, { message: 'Chave de evento inválida' })
    .optional(),
});
export type EventoJogo = z.infer<typeof EventoJogoSchema>;

/** Máximo de eventos por chamada de `registrar_eventos` (o service divide em lotes). */
export const EVENTOS_POR_LOTE = 50;
