// Hook da trava por aba (travaAba.ts): um grupo, um motor por navegador.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { TravaAba, type SituacaoAba } from './travaAba';

const assinarNada = () => () => {};
const sempreDona = (): SituacaoAba => 'dona';

/** Situação desta aba para o grupo (`chave` nula = ainda sem grupo: nada a travar). */
export function useTravaAba(chave: string | null): { situacao: SituacaoAba; assumir: () => void } {
  const trava = useMemo(() => (chave ? new TravaAba(chave) : null), [chave]);
  useEffect(() => {
    if (!trava) return;
    trava.iniciar();
    return () => trava.parar();
  }, [trava]);
  const ligacao = useMemo(
    () =>
      trava
        ? { assinar: (o: () => void) => trava.assinar(o), ler: () => trava.situacao, assumir: () => trava.assumir() }
        : { assinar: assinarNada, ler: sempreDona, assumir: () => {} },
    [trava],
  );
  const situacao = useSyncExternalStore(ligacao.assinar, ligacao.ler, ligacao.ler);
  return { situacao, assumir: ligacao.assumir };
}
