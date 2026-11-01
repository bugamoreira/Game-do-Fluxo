// Sincronização do jogo do grupo com o servidor. docs/contratos.md §3.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { EstadoBaseSync, EventoJogo, NumerosPorChave, Rodada } from '../schemas';
import { copiaLocal } from '../services/armazenamentoLocal';
import { syncService } from '../services/syncService';
import { ControladorSincronizacao, type InstantaneoSync } from './controladores';
import { useTentarAoVoltarRede } from './useTentarAoVoltarRede';

export interface ResultadoSincronizarJogo extends InstantaneoSync {
  /** Enfileira um ponto da série de métricas; sai junto com o próximo envio (sobrevive a quedas de rede). */
  registrarSerie: <M extends NumerosPorChave<M>>(rodada: Rodada, minuto: number, metricas: M) => void;
  /** Enfileira ocorrências do plantão para `eventos_jogo` (use `chave` para reenvio idempotente). */
  registrarEventos: (rodada: Rodada, eventos: EventoJogo[]) => void;
}

const SEM_SYNC: InstantaneoSync = { conexao: 'online', ultimaSincronizacao: null, erro: null, pendentes: 0 };
const assinarNada = () => () => {};
const instantaneoVazio = () => SEM_SYNC;

/**
 * - Guarda a cópia local a cada mudança de `estado` (localStorage, validada na leitura).
 * - Envia o estado mais recente a cada 2 s, só se a versão (ou a rodada) mudou, sem sobrepor envios.
 * - Falha de rede: backoff 1→2→4→8→15 s e `conexao` 'reconectando'/'offline'.
 * - Nunca expulsa o grupo: nenhum erro limpa token, sessão ou cópia local.
 *
 * @param token token do grupo (`null` antes de entrar: nada é enviado)
 * @param estado estado atual do motor (`EstadoSimulacao`)
 * @param resumir pontuação e métricas do placar a partir do estado
 *   (motor: `pontuacao(estado)` e `metricas(estado)`); chamado só no envio
 */
export function useSincronizarJogo<E extends EstadoBaseSync, M extends NumerosPorChave<M>>(
  token: string | null,
  estado: E | null,
  resumir: (estado: E) => { pontuacao: number; metricas: M },
): ResultadoSincronizarJogo {
  const controlador = useMemo(
    () =>
      token
        ? new ControladorSincronizacao(token, {
            enviarEstado: syncService.enviarEstado,
            registrarSerie: syncService.registrarSerie,
            registrarEventos: syncService.registrarEventos,
            salvarCopia: (t, e) => {
              copiaLocal.salvar(t, e);
            },
          })
        : null,
    [token],
  );

  useEffect(() => {
    if (!controlador) return;
    controlador.iniciar();
    return () => controlador.parar();
  }, [controlador]);

  useEffect(() => {
    // O controlador só recebe estados que vieram deste hook, então o tipo E é preservado.
    controlador?.definirResumir((e) => resumir(e as E));
  }, [controlador, resumir]);

  useEffect(() => {
    controlador?.definirEstado(estado);
  }, [controlador, estado]);

  useTentarAoVoltarRede(controlador);

  const instantaneo = useSyncExternalStore(
    controlador ? controlador.assinar : assinarNada,
    controlador ? controlador.instantaneo : instantaneoVazio,
    controlador ? controlador.instantaneo : instantaneoVazio,
  );

  const registrarSerie = useCallback(
    <MS extends NumerosPorChave<MS>>(rodada: Rodada, minuto: number, metricas: MS) =>
      controlador?.registrarSerie(rodada, minuto, metricas),
    [controlador],
  );
  const registrarEventos = useCallback(
    (rodada: Rodada, eventos: EventoJogo[]) => controlador?.registrarEventos(rodada, eventos),
    [controlador],
  );

  return { ...instantaneo, registrarSerie, registrarEventos };
}
