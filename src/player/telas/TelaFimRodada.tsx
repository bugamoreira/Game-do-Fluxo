// J4: fim do Plantão Travado. Resumo do grupo enquanto o facilitador conduz o debrief.

import type { ReactNode } from 'react';
import { Card, DarkCallout, Icone, TeamAvatar, type Conexao } from '../../shared/components/ui';
import type { ResumoRodada } from '../jogo/sincronia';
import { GradeMetricas, METRICAS_CLINICAS, METRICAS_GESTOR, mensagemDaRodada } from './resumo';
import { Moldura, type Voltar } from './Moldura';

interface TelaFimRodadaProps {
  sala: string | null;
  nomeGrupo: string;
  corGrupo: string;
  resumo: ResumoRodada | null;
  conexao?: Conexao | null;
  /** Texto do cartão escuro (online: aguardar o facilitador). */
  proximoPasso: string;
  /** Modo solo: botão para seguir para o Plantão Lean. */
  acao?: ReactNode;
  voltar?: Voltar;
}

export function TelaFimRodada({ sala, nomeGrupo, corGrupo, resumo, conexao, proximoPasso, acao, voltar }: TelaFimRodadaProps) {
  return (
    <Moldura rotulo={sala ? `Sala ${sala}` : 'Treino'} conexao={conexao} largura="g" voltar={voltar}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <TeamAvatar nome={nomeGrupo} cor={corGrupo} tamanho="g" />
          <div>
            <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">Fim da rodada 1 · Plantão Travado</p>
            <h1 className="text-titulo-s font-bold text-texto">{nomeGrupo}</h1>
          </div>
        </div>
        {resumo && (
          <div className="flex items-center gap-3 rounded-pilula bg-marinho px-6 py-3 text-white">
            <span className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">Pontos</span>
            <span className="font-space-mono text-titulo-s font-bold tabular-nums">{resumo.pontuacao}</span>
          </div>
        )}
      </div>

      <DarkCallout rotulo="Próximo passo" titulo={proximoPasso} icone={<Icone nome="debrief" tamanho={22} />} acoes={acao}>
        {resumo ? mensagemDaRodada(1, resumo) : 'O resumo do grupo aparece aqui assim que o jogo deste computador for recuperado.'}
      </DarkCallout>

      {resumo && (
        <>
          <Card rotulo="Resultado clínico" titulo="Como o plantão terminou">
            <GradeMetricas itens={METRICAS_CLINICAS} atual={resumo} />
          </Card>
          <Card rotulo="Carga do gestor" titulo="Quanto vocês precisaram decidir">
            <GradeMetricas itens={METRICAS_GESTOR} atual={resumo} />
          </Card>
        </>
      )}
    </Moldura>
  );
}
