// Faixa acima dos setores: o paciente selecionado, o que ele espera e os destinos possíveis.

import { useMemo } from 'react';
import { Button, GRAVIDADE, Icone } from '../../shared/components/ui';
import { destinosPossiveis, type EstadoSimulacao } from '../../shared/lib/simulation';
import { estadoNir, podePcpNoSelecionado, rotuloDestino, situacaoDoPaciente } from '../jogo/leitura';
import { useJogo } from '../jogo/useJogo';

interface BarraSelecaoProps {
  estado: EstadoSimulacao;
  bloqueada: boolean;
}

export function BarraSelecao({ estado, bloqueada }: BarraSelecaoProps) {
  const selecionadoId = useJogo(s => s.selecionadoId);
  const selecionar = useJogo(s => s.selecionar);
  const mover = useJogo(s => s.mover);
  const usarNir = useJogo(s => s.usarNir);
  const usarPcp = useJogo(s => s.usarFullCapacity);

  const p = useMemo(() => estado.pacientes.find(x => x.id === selecionadoId) ?? null, [estado, selecionadoId]);
  const destinos = useMemo(() => (p ? destinosPossiveis(estado, p.id) : []), [estado, p]);

  if (!p) {
    return (
      <div className="flex min-h-16 items-center gap-3 rounded-cartao border border-dashed border-borda-forte bg-cartao/60 px-5 text-sm text-texto-corpo">
        <Icone nome="pessoa" tamanho={18} className="text-texto-suave" />
        <span>
          <strong className="text-texto">Clique em um paciente</strong> para ver para onde ele pode ir. Os destinos possíveis ficam com contorno amarelo.
        </span>
      </div>
    );
  }

  const g = GRAVIDADE[p.sev];
  const nir = estadoNir(estado, p);
  const pcp = podePcpNoSelecionado(estado, p);
  const semAcao = destinos.length === 0 && !nir.podeNoSelecionado && !pcp;

  return (
    <div
      role="region"
      aria-label={`Paciente selecionado: ${p.name}`}
      className="flex min-h-16 flex-wrap items-center gap-x-5 gap-y-2 rounded-cartao border border-marinho/20 bg-cartao px-5 py-2.5 shadow-cartao"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full font-space-mono font-bold ring-2 ring-white ${g.cor} ${g.texto}`}>
          {g.prioridade}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-texto">
            {p.name} <span className="font-normal text-texto-suave">· {g.nome}, {g.categoria}</span>
          </p>
          <p className="truncate text-sm text-texto-corpo">{situacaoDoPaciente(p, estado.minuto)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {destinos.map(d => (
          <Button key={d} variante={d === 'alta' ? 'verde' : 'amarelo'} tamanho="p" disabled={bloqueada} onClick={() => mover(d)}>
            {rotuloDestino(p, d)}
          </Button>
        ))}
        {nir.podeNoSelecionado && (
          <Button variante="marinho" tamanho="p" disabled={bloqueada} onClick={usarNir} icone={<Icone nome="desvio" tamanho={16} />}>
            Transferir pelo NIR ({nir.usos}/{nir.max})
          </Button>
        )}
        {pcp && (
          <Button variante="marinho" tamanho="p" disabled={bloqueada} onClick={usarPcp}>
            PCP: corredor da ENF
          </Button>
        )}
        {semAcao && <span className="text-sm text-texto-suave">Nenhuma ação possível agora.</span>}
        <Button variante="fantasma" tamanho="p" onClick={() => selecionar(null)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
