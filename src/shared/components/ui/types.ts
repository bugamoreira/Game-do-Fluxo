// Tipos locais da pasta ui. ItemRanking segue docs/contratos.md §4;
// será unificado com src/shared/types na integração.
import type { Round } from '../../types/game';
import type { DbMetrics } from '../../types/supabase';

export type Rodada = Round;

/** O mesmo formato do placar atual (game_state.metrics). */
export type Metricas = DbMetrics;

export interface ItemRanking {
  grupoId: string;
  nome: string;
  cor: string;
  rodada: Rodada;
  pontuacao: number;
  metricas: Metricas;
  minuto: number;
}

export type Conexao = 'online' | 'reconectando' | 'offline';

/** Setores que têm cartão próprio. 'corredor' é extensão do contrato (design.md: tom cinza). */
export type SetorUi = 'de' | 'enf' | 'uti' | 'rpa' | 'cc' | 'triagem' | 'corredor';

export type Tema = 'claro' | 'escuro';
