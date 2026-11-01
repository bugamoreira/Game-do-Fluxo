// Ranking da turma por consulta periódica (sem Realtime). docs/contratos.md §3.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { turmaService } from '../services/turmaService';
import { ControladorRanking, type InstantaneoRanking } from './controladores';
import { useTentarAoVoltarRede } from './useTentarAoVoltarRede';

/** Consulta `ranking` a cada `intervaloMs` (padrão 1 s). Sem rede, mantém o último ranking. */
export function useRanking(codigo: string, intervaloMs = 1000): InstantaneoRanking {
  const controlador = useMemo(
    () => new ControladorRanking(codigo, intervaloMs, turmaService.ranking),
    [codigo, intervaloMs],
  );

  useEffect(() => {
    controlador.iniciar();
    return () => controlador.parar();
  }, [controlador]);

  useTentarAoVoltarRede(controlador);

  return useSyncExternalStore(controlador.assinar, controlador.instantaneo, controlador.instantaneo);
}
