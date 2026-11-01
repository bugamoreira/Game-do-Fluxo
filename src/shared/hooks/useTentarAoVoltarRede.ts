import { useEffect } from 'react';

/** Quando o navegador avisa que a rede voltou, antecipa a próxima tentativa. */
export function useTentarAoVoltarRede(alvo: { tentarAgora(): void } | null): void {
  useEffect(() => {
    if (!alvo || typeof window === 'undefined') return;
    const aoVoltar = () => alvo.tentarAgora();
    window.addEventListener('online', aoVoltar);
    return () => window.removeEventListener('online', aoVoltar);
  }, [alvo]);
}
