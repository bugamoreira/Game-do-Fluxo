// Estado da turma por consulta periódica (sem Realtime). docs/contratos.md §3.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { turmaService } from '../services/turmaService';
import { ControladorEstadoTurma, type InstantaneoTurma } from './controladores';
import { useTentarAoVoltarRede } from './useTentarAoVoltarRede';

/**
 * Consulta `estado_turma` a cada `intervaloMs` (padrão 1 s), com backoff em
 * falha de rede. `minutoServidor` anda sozinho entre as consultas, corrigido
 * pela hora do servidor, e continua andando sem rede.
 *
 * @param token token do grupo, quando houver: cada consulta marca o grupo como
 *   presente na sala ("conectado" = visto nos últimos 15 s) e a turma volta com
 *   `tokenValido`. Facilitador e telão chamam sem token.
 */
export function useEstadoTurma(codigo: string, intervaloMs = 1000, token: string | null = null): InstantaneoTurma {
  const controlador = useMemo(
    () => new ControladorEstadoTurma(codigo, intervaloMs, { buscar: turmaService.estado, token }),
    [codigo, intervaloMs, token],
  );

  useEffect(() => {
    controlador.iniciar();
    return () => controlador.parar();
  }, [controlador]);

  useTentarAoVoltarRede(controlador);

  return useSyncExternalStore(controlador.assinar, controlador.instantaneo, controlador.instantaneo);
}
