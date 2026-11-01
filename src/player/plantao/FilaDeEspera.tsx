// Triagem e corredor: quem espera maca no DE. Não tem capacidade (sem barra de lotação).

import type { ReactNode } from 'react';
import { Icone, cx } from '../../shared/components/ui';
import type { EstadoSimulacao, PacienteSim } from '../../shared/lib/simulation';
import { noSetor } from '../jogo/leitura';

interface FilaDeEsperaProps {
  estado: EstadoSimulacao;
  destacado: boolean;
  renderChip: (p: PacienteSim) => ReactNode;
}

export function FilaDeEspera({ estado, destacado, renderChip }: FilaDeEsperaProps) {
  const triagem = noSetor(estado, 'triagem');
  const corredor = noSetor(estado, 'corredor');
  const total = triagem.length + corredor.length;

  return (
    <section
      aria-label={`Fila de espera: ${total} ${total === 1 ? 'paciente' : 'pacientes'}`}
      className={cx(
        'flex flex-col gap-3 rounded-cartao bg-setor-triagem p-4 text-texto',
        destacado ? 'outline-[3px] outline-dashed outline-offset-2 outline-amarelo' : 'border border-black/[0.04]',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">Triagem e corredor</p>
          <h3 className="font-sora text-lg font-bold leading-tight">Esperando maca no DE</h3>
        </div>
        <p className="font-space-mono text-xl font-bold tabular-nums" aria-hidden="true">
          {total}
        </p>
      </header>
      {total === 0 ? (
        <p className="text-sm text-texto-suave">Ninguém esperando.</p>
      ) : (
        <div className="flex flex-wrap content-start gap-2">
          {triagem.map(renderChip)}
          {corredor.length > 0 && (
            <>
              <span className="flex items-center gap-1 self-center rounded-pilula bg-marinho px-2.5 py-1 text-xs font-bold text-white">
                <Icone nome="alerta" tamanho={12} /> Corredor
              </span>
              {corredor.map(renderChip)}
            </>
          )}
        </div>
      )}
    </section>
  );
}
