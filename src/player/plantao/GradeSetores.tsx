// Centro da tela: a fila, o DE (e o Fast Track no Lean) à esquerda; ENF, UTI, RPA e CC à direita.

import { useMemo } from 'react';
import { PatientChip, SectorTile } from '../../shared/components/ui';
import { destinosPossiveis, type EstadoSimulacao, type PacienteSim } from '../../shared/lib/simulation';
import type { Sector } from '../../shared/types/game';
import { enfermariaEmFoco, lotacao, noSetor, ordenarDe } from '../jogo/leitura';
import { useJogo } from '../jogo/useJogo';
import { CartaoCirurgias } from './CartaoCirurgias';
import { FilaDeEspera } from './FilaDeEspera';

interface GradeSetoresProps {
  estado: EstadoSimulacao;
  bloqueada: boolean;
}

export function GradeSetores({ estado, bloqueada }: GradeSetoresProps) {
  const selecionadoId = useJogo(s => s.selecionadoId);
  const selecionar = useJogo(s => s.selecionar);
  const mover = useJogo(s => s.mover);

  const destinos = useMemo(() => new Set<Sector>(selecionadoId !== null ? destinosPossiveis(estado, selecionadoId) : []), [estado, selecionadoId]);
  const clicar = bloqueada ? undefined : (p: PacienteSim) => selecionar(p.id);
  const moverPara = (d: Sector) => (bloqueada ? undefined : () => mover(d));

  const chip = (p: PacienteSim, compacto = false) => (
    <PatientChip<PacienteSim>
      key={p.id}
      paciente={p}
      minuto={estado.minuto}
      selecionado={p.id === selecionadoId}
      onClick={clicar}
      compacto={compacto}
    />
  );

  const lean = estado.rodada === 2;
  const de = ordenarDe(noSetor(estado, 'de'));
  const fastTrack = noSetor(estado, 'fast_track');
  const enfFoco = enfermariaEmFoco(estado);
  const enf = lotacao(estado, 'enf');
  const uti = lotacao(estado, 'uti');
  const utiPacientes = ordenarDe(noSetor(estado, 'uti'));
  const rpa = noSetor(estado, 'rpa');
  const enfExtra = noSetor(estado, 'enf_extra');
  const mostrarEnfExtra = lean && (estado.ferramentas.fcLiberado || enfExtra.length > 0);

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <FilaDeEspera estado={estado} destacado={destinos.has('de')} renderChip={p => chip(p)} />
        <SectorTile
          setor="de"
          {...lotacao(estado, 'de')}
          destacado={destinos.has('de')}
          onMover={moverPara('de')}
          className="flex-1"
          extra={estado.eventos.pcr ? <span className="rounded-pilula bg-marinho px-2.5 py-1 text-xs font-bold text-white">1 maca na PCR</span> : undefined}
        >
          {de.map(p => chip(p))}
        </SectorTile>
        {lean && (
          <SectorTile setor="fast_track" titulo="Fast Track (verdes)" {...lotacao(estado, 'fast_track')}>
            {fastTrack.length > 0 ? fastTrack.map(p => chip(p)) : <span className="text-sm text-texto-suave">Sem pacientes no Fast Track.</span>}
          </SectorTile>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <SectorTile setor="enf" {...enf} destacado={destinos.has('enf')} onMover={moverPara('enf')}>
          {enfFoco.map(p => chip(p, true))}
          <span className="self-center pl-1 text-xs font-semibold text-texto-suave">
            {enfFoco.length > 0 ? `+${enf.ocupacao - enfFoco.length} internados` : `${enf.ocupacao} internados, nenhuma alta pronta`}
          </span>
        </SectorTile>
        {mostrarEnfExtra && (
          <SectorTile setor="enf_extra" titulo="PCP: corredor da ENF" {...lotacao(estado, 'enf_extra')}>
            {enfExtra.length > 0 ? enfExtra.map(p => chip(p)) : <span className="text-sm text-texto-suave">Vagas livres para o PCP.</span>}
          </SectorTile>
        )}
        <SectorTile setor="uti" {...uti} destacado={destinos.has('uti')} onMover={moverPara('uti')}>
          {utiPacientes.map(p => chip(p, true))}
        </SectorTile>
        <div className="grid grid-cols-2 gap-4">
          <SectorTile setor="rpa" titulo="RPA" {...lotacao(estado, 'rpa')}>
            {rpa.length > 0 ? rpa.map(p => chip(p, true)) : <span className="text-sm text-texto-suave">Vazia.</span>}
          </SectorTile>
          <CartaoCirurgias estado={estado} />
        </div>
      </div>
    </div>
  );
}
