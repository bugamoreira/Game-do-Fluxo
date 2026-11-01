// Coluna direita: o evento ativo (cartão escuro), as ferramentas e a linha do plantão.

import type { ReactNode } from 'react';
import { Button, DarkCallout, Icone, Timeline, horaDoPlantao } from '../../shared/components/ui';
import { ENF_EXTRA_VAGAS, type EstadoSimulacao } from '../../shared/lib/simulation';
import { estadoNir, eventoAtivo } from '../jogo/leitura';
import { useJogo } from '../jogo/useJogo';

interface PainelLateralProps {
  estado: EstadoSimulacao;
  /** Modo solo: sem facilitador, o grupo autoriza o PCP por aqui. */
  podeAutorizarPcp?: boolean;
}

export function PainelLateral({ estado, podeAutorizarPcp = false }: PainelLateralProps) {
  const evento = eventoAtivo(estado);
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1 *:shrink-0" aria-label="Eventos e ferramentas do plantão">
      {evento && (
        <DarkCallout rotulo={evento.rotulo} titulo={evento.titulo} icone={<Icone nome={evento.icone} tamanho={22} />} aoVivo>
          {evento.texto}
        </DarkCallout>
      )}
      <Ferramentas estado={estado} podeAutorizarPcp={podeAutorizarPcp} />
      <section className="flex min-h-60 flex-1 flex-col rounded-cartao border border-borda bg-cartao p-4 shadow-cartao">
        <h2 className="mb-3 text-lg font-bold text-texto">Linha do plantão</h2>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Timeline itens={estado.log} max={25} vazio="O plantão acabou de começar." />
        </div>
      </section>
    </aside>
  );
}

function Linha({ titulo, valor, children }: { titulo: string; valor: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-borda pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-texto">{titulo}</p>
        <p className="font-space-mono text-sm font-bold tabular-nums text-texto">{valor}</p>
      </div>
      {children}
    </div>
  );
}

function Ferramentas({ estado, podeAutorizarPcp }: { estado: EstadoSimulacao; podeAutorizarPcp: boolean }) {
  const liberarPcp = useJogo(s => s.liberarFullCapacity);
  const nir = estadoNir(estado, null);
  const lean = estado.rodada === 2;
  const f = estado.ferramentas;
  const auto = estado.carga.automatico;

  return (
    <section aria-label="Ferramentas" className="flex flex-col gap-2.5 rounded-cartao border border-borda bg-cartao p-4 shadow-cartao">
      <h2 className="text-lg font-bold text-texto">Ferramentas</h2>

      <Linha titulo="NIR: transferência externa" valor={`${nir.usos}/${nir.max} usos`}>
        <p className="text-xs leading-snug text-texto-corpo">
          {nir.usos >= nir.max
            ? 'Usos esgotados nesta rodada.'
            : nir.espera > 0
              ? `Disponível de novo em ${nir.espera} min.`
              : `Selecione um paciente em boarding. Transferência em ${lean ? 'cerca de 1 h' : '3 a 4 h'}.`}
        </p>
        {nir.emAndamento.map(p => (
          <p key={p.id} className="flex items-center gap-1.5 text-xs font-semibold text-texto">
            <Icone nome="desvio" tamanho={12} />
            Transferência em andamento: {p.name}, saída prevista às {horaDoPlantao(p.transferenciaAte)}
          </p>
        ))}
      </Linha>

      {lean && (
        <Linha titulo="PCP (Full Capacity)" valor={f.fcLiberado ? `${f.fcUsos} ${f.fcUsos === 1 ? 'uso' : 'usos'}` : 'bloqueado'}>
          <p className="text-xs leading-snug text-texto-corpo">
            {f.fcLiberado
              ? `Autorizado: ${ENF_EXTRA_VAGAS} vagas no corredor da enfermaria para quem espera leito na ENF.`
              : 'Aguarda a autorização da diretoria (facilitador).'}
          </p>
          {!f.fcLiberado && podeAutorizarPcp && (
            <Button variante="contorno" tamanho="p" className="self-start" onClick={liberarPcp}>
              Autorizar como diretoria
            </Button>
          )}
        </Linha>
      )}

      {lean && (
        <Linha titulo="Trabalho automático (Lean)" valor="">
          <ul className="flex flex-col gap-0.5 text-xs text-texto-corpo">
            <ItemAuto rotulo="Fluxista: altas do DE" valor={auto.fluxista} />
            <ItemAuto rotulo="Discharge Lounge: leitos liberados" valor={auto.dischargeLounge} />
            <ItemAuto rotulo="Fast Track: verdes atendidos" valor={auto.fastTrack} />
            <ItemAuto rotulo="Cirurgias viabilizadas por altas" valor={auto.cirurgiasViabilizadas} />
          </ul>
        </Linha>
      )}
    </section>
  );
}

function ItemAuto({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{rotulo}</span>
      <strong className="font-space-mono text-sm text-texto tabular-nums">{valor}</strong>
    </li>
  );
}
