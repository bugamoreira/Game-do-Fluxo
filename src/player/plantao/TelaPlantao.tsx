// J3 (Plantão Travado) e J5 (Plantão Lean): a mesma tela, com o estado do motor no store.

import type { ReactNode } from 'react';
import { ConnectionBanner, Icone, type Conexao } from '../../shared/components/ui';
import { encerrado, pontuacao } from '../../shared/lib/simulation';
import { useJogo } from '../jogo/useJogo';
import { AvisosDoJogo } from './AvisosDoJogo';
import { BarraSelecao } from './BarraSelecao';
import { Cabecalho } from './Cabecalho';
import { GradeSetores } from './GradeSetores';
import { PainelLateral } from './PainelLateral';

interface TelaPlantaoProps {
  nomeGrupo: string;
  corGrupo: string;
  /** `null` no modo solo (sem servidor). */
  conexao: Conexao | null;
  pausado: boolean;
  /** Texto do aviso de pausa (facilitador ou o próprio grupo no solo). */
  textoPausa?: string;
  /** Texto quando o relógio chega às 19h e a rodada ainda não foi encerrada pelo facilitador. */
  textoFim?: string;
  podeAutorizarPcp?: boolean;
  extraCabecalho?: ReactNode;
}

export function TelaPlantao({
  nomeGrupo,
  corGrupo,
  conexao,
  pausado,
  textoPausa = 'O facilitador pausou o plantão. Aguarde a retomada.',
  textoFim = 'Plantão encerrado às 19h. Aguarde o facilitador.',
  podeAutorizarPcp = false,
  extraCabecalho,
}: TelaPlantaoProps) {
  const estado = useJogo(s => s.estado);
  if (!estado) return null;

  const fim = encerrado(estado);
  const bloqueada = pausado || fim;

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fundo-app p-4 font-sora text-texto-corpo">
      <Cabecalho
        nomeGrupo={nomeGrupo}
        corGrupo={corGrupo}
        rodada={estado.rodada}
        minuto={estado.minuto}
        pontuacao={pontuacao(estado)}
        pausado={pausado}
        conexao={conexao}
        extra={extraCabecalho}
      />
      {conexao && <ConnectionBanner conexao={conexao} />}
      <BarraSelecao estado={estado} bloqueada={bloqueada} />

      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-4">
        <main className="relative min-h-0" aria-label="Setores do hospital">
          <GradeSetores estado={estado} bloqueada={bloqueada} />
          {bloqueada && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-cartao bg-fundo-app/70 backdrop-blur-[1px]">
              <div role="status" className="flex max-w-md items-center gap-4 rounded-cartao-g bg-degrade-cbmede px-7 py-5 text-white shadow-elevada">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-amarelo">
                  <Icone nome={fim ? 'check' : 'pausa'} tamanho={22} />
                </span>
                <p className="text-lg font-bold leading-snug">{fim ? textoFim : textoPausa}</p>
              </div>
            </div>
          )}
        </main>
        <PainelLateral estado={estado} podeAutorizarPcp={podeAutorizarPcp} />
      </div>

      <AvisosDoJogo />
    </div>
  );
}
