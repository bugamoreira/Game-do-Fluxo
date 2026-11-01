// ============================================================
// O que o app do jogador precisa da sala. Online, é a casca fina sobre os
// services e hooks compartilhados (online.ts); na demonstração, um falso
// (src/player/demo/). O modo é decidido uma vez, no carregamento da página,
// então trocar a implementação dos hooks não viola as regras de hooks.
// ============================================================

import { createContext, useContext } from 'react';
import type { InstantaneoRanking, InstantaneoTurma } from '../../shared/hooks/controladores';
import type { ResultadoSincronizarJogo } from '../../shared/hooks/useSincronizarJogo';
import type { Entrada, SessaoLocal } from '../../shared/schemas/sync.schema';
import type { EstadoSimulacao } from '../../shared/lib/simulation';
import type { ResumoRodada } from '../jogo/sincronia';

export interface PortaJogo {
  modo: 'online' | 'demo';
  /** grupoService.entrar */
  entrar: (codigo: string, nome: string, tokenLocal?: string | null) => Promise<Entrada>;
  useEstadoTurma: (codigo: string, intervaloMs: number, token: string | null) => InstantaneoTurma;
  useSincronizarJogo: (
    token: string | null,
    estado: EstadoSimulacao | null,
    resumir: (e: EstadoSimulacao) => ResumoRodada,
  ) => ResultadoSincronizarJogo;
  useRanking: (codigo: string, intervaloMs?: number) => InstantaneoRanking;
  sessao: {
    ler: (codigo: string) => SessaoLocal | null;
    salvar: (s: Omit<SessaoLocal, 'formato'>) => void;
    limpar: () => void;
  };
  /** Cópia local do estado do jogo deste grupo (qualquer rodada). */
  lerCopia: (token: string) => unknown;
}

export const ContextoPorta = createContext<PortaJogo | null>(null);

export function usePorta(): PortaJogo {
  const p = useContext(ContextoPorta);
  if (!p) throw new Error('usePorta fora do ContextoPorta');
  return p;
}
