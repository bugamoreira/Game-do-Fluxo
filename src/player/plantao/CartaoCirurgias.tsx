// Centro cirúrgico: as 4 salas (ocupante, status e horário previsto), eletivas
// atrasadas, a próxima cirurgia e o balanço do dia.

import { Icone, cx, horaDoPlantao } from '../../shared/components/ui';
import type { EstadoSimulacao } from '../../shared/lib/simulation';
import { eletivasAtrasadas, linhasSalas, proximaCirurgia } from '../jogo/leitura';

const COR_STATUS = {
  livre: 'bg-verde',
  cirurgia: 'bg-marinho',
  aguardando_rpa: 'bg-amarelo',
} as const;

export function CartaoCirurgias({ estado }: { estado: EstadoSimulacao }) {
  const prox = proximaCirurgia(estado);
  const salas = linhasSalas(estado);
  const atrasadas = eletivasAtrasadas(estado);
  const feitas = estado.cirurgias.filter(s => s.st === 'done' || s.st === 'andamento' || s.st === 'aguardando_rpa').length;
  const canceladas = estado.cirurgias.filter(s => s.st === 'cancelled').length;

  return (
    <section aria-label="Centro cirúrgico" className="flex flex-col gap-2 rounded-cartao border border-black/[0.04] bg-setor-cc p-4 text-texto">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">CC</p>
          <h3 className="font-sora text-lg font-bold leading-tight">Salas operatórias</h3>
        </div>
        <Icone nome="relogio" tamanho={18} className="text-texto-suave" />
      </header>
      <ul className="flex flex-col gap-1 text-sm">
        {salas.map(s => (
          <li key={s.numero} className={cx('flex items-start gap-2', s.status === 'aguardando_rpa' && 'font-bold')}>
            <span aria-hidden="true" className={cx('mt-1.5 size-2 shrink-0 rounded-full', COR_STATUS[s.status])} />
            <span>
              Sala {s.numero}: {s.texto}
            </span>
          </li>
        ))}
      </ul>
      {atrasadas.length > 0 && (
        <p className="flex items-start gap-1 text-xs font-semibold text-texto">
          <Icone nome="alerta" tamanho={14} className="mt-0.5 shrink-0" />
          {atrasadas.map(a => `${a.label} atrasada ${a.atrasoMin} min (sala ${a.sala} ocupada)`).join(' · ')}
        </p>
      )}
      {prox ? (
        <p className="text-sm">
          Próxima: <strong>{horaDoPlantao(Math.round(prox.stH * 60))}</strong> · sala {prox.sala} → {prox.dest === 'uti' ? 'UTI' : 'ENF'}
        </p>
      ) : (
        atrasadas.length === 0 && <p className="text-sm">Sem cirurgias agendadas.</p>
      )}
      <p className="text-xs text-texto-corpo">
        {feitas} {feitas === 1 ? 'iniciada' : 'iniciadas'} · {canceladas} {canceladas === 1 ? 'cancelada' : 'canceladas'}
      </p>
    </section>
  );
}
