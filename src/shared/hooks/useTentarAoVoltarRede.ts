import { useEffect } from 'react';
import { aoVoltar } from './aoVoltar';

/**
 * Quando a rede volta ou a aba volta a ficar visível, antecipa a próxima
 * tentativa (e o relógio do servidor é medido de novo na resposta).
 */
export function useTentarAoVoltarRede(alvo: { tentarAgora(): void } | null): void {
  useEffect(() => {
    if (!alvo) return;
    return aoVoltar(() => alvo.tentarAgora());
  }, [alvo]);
}
