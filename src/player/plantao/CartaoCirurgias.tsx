// Centro cirúrgico: próxima cirurgia e o balanço do dia.

import { Icone, horaDoPlantao } from '../../shared/components/ui';
import type { EstadoSimulacao } from '../../shared/lib/simulation';
import { proximaCirurgia } from '../jogo/leitura';

export function CartaoCirurgias({ estado }: { estado: EstadoSimulacao }) {
  const prox = proximaCirurgia(estado);
  const feitas = estado.cirurgias.filter(s => s.st === 'done' || s.st === 'andamento').length;
  const canceladas = estado.cirurgias.filter(s => s.st === 'cancelled').length;
  const emAndamento = estado.cirurgias.filter(s => s.st === 'andamento').length;

  return (
    <section aria-label="Centro cirúrgico" className="flex flex-col gap-2 rounded-cartao border border-black/[0.04] bg-setor-cc p-4 text-texto">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">CC</p>
          <h3 className="font-sora text-lg font-bold leading-tight">Cirurgias</h3>
        </div>
        <Icone nome="relogio" tamanho={18} className="text-texto-suave" />
      </header>
      {prox ? (
        <p className="text-sm">
          Próxima: <strong>{horaDoPlantao(Math.round(prox.stH * 60))}</strong> · sala {prox.sala} → {prox.dest === 'uti' ? 'UTI' : 'ENF'}
        </p>
      ) : (
        <p className="text-sm">Sem cirurgias agendadas.</p>
      )}
      <p className="text-xs text-texto-corpo">
        {feitas} {feitas === 1 ? 'iniciada' : 'iniciadas'}
        {emAndamento > 0 ? ` (${emAndamento} em andamento)` : ''} · {canceladas} {canceladas === 1 ? 'cancelada' : 'canceladas'}
      </p>
    </section>
  );
}
