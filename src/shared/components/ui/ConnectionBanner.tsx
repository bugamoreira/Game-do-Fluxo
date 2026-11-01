import { cx } from './cx';
import { Icone } from './Icone';
import type { Conexao } from './types';

export interface ConnectionBannerProps {
  conexao: Conexao;
  /** Só faz sentido no computador do grupo: a simulação continua localmente. */
  simulacaoLocal?: boolean;
  className?: string;
}

/** Faixa de conexão. 'online' não mostra nada. */
export function ConnectionBanner({ conexao, simulacaoLocal = true, className }: ConnectionBannerProps) {
  if (conexao === 'online') return <div role="status" aria-live="polite" className="sr-only" />;

  const reconectando = conexao === 'reconectando';
  const titulo = reconectando ? 'Reconectando…' : 'Sem conexão com o servidor';
  const detalhe = simulacaoLocal
    ? reconectando
      ? 'O jogo continua neste computador. O placar sincroniza assim que a conexão voltar.'
      : 'O jogo continua neste computador e nada se perde. Confira o Wi-Fi ou use o 5G de um celular.'
    : reconectando
      ? 'Tentando de novo. Os dados na tela podem estar alguns segundos atrasados.'
      : 'Os dados na tela estão parados. Confira o Wi-Fi.';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm',
        reconectando ? 'bg-amarelo text-marinho-profundo' : 'bg-marinho-profundo text-white',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'grid size-8 shrink-0 place-items-center rounded-full',
          reconectando ? 'bg-marinho-profundo/10' : 'bg-white/15 text-amarelo',
        )}
      >
        {reconectando ? (
          <Icone nome="recarregar" tamanho={18} strokeWidth={2.5} className="motion-safe:animate-spin" />
        ) : (
          <Icone nome="semSinal" tamanho={18} strokeWidth={2.5} />
        )}
      </span>
      <p className="min-w-0">
        <strong className="font-bold">{titulo}</strong> <span className={reconectando ? '' : 'text-white/85'}>{detalhe}</span>
      </p>
    </div>
  );
}
