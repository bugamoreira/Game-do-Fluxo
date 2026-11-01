// J6: resultado final. Plantão Travado × Plantão Lean do grupo e a posição na turma.

import type { ReactNode } from 'react';
import { Card, DarkCallout, Icone, RankingTable, StatTile, TeamAvatar, type Conexao, type ItemRanking } from '../../shared/components/ui';
import type { ResumoRodada } from '../jogo/sincronia';
import { GradeMetricas, METRICAS_CLINICAS, METRICAS_GESTOR, mensagemDaRodada } from './resumo';
import { Moldura } from './Moldura';

interface TelaResultadoProps {
  sala: string | null;
  nomeGrupo: string;
  corGrupo: string;
  r1: ResumoRodada | null;
  r2: ResumoRodada | null;
  /** Ranking da rodada 2 (online); vazio no modo solo. */
  rankingR2: ItemRanking[];
  grupoId?: string;
  conexao?: Conexao | null;
  acao?: ReactNode;
}

export function TelaResultado({ sala, nomeGrupo, corGrupo, r1, r2, rankingR2, grupoId, conexao, acao }: TelaResultadoProps) {
  const ordenado = [...rankingR2].sort((a, b) => b.pontuacao - a.pontuacao);
  const posicao = grupoId ? ordenado.findIndex(i => i.grupoId === grupoId) + 1 : 0;
  const variacao = r1 && r2 ? r2.pontuacao - r1.pontuacao : undefined;

  return (
    <Moldura rotulo={sala ? `Sala ${sala}` : 'Treino'} conexao={conexao} largura="g">
      <div className="flex items-center gap-4">
        <TeamAvatar nome={nomeGrupo} cor={corGrupo} tamanho="g" />
        <div>
          <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">Resultado final</p>
          <h1 className="text-titulo-s font-bold text-texto">{nomeGrupo}</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile rotulo="Plantão Travado" valor={r1 ? r1.pontuacao : '—'} tom="uti" />
        <StatTile rotulo="Plantão Lean" valor={r2 ? r2.pontuacao : '—'} tom="enf" variacao={variacao} referencia="vs. Travado" />
        <StatTile
          rotulo="Posição na turma"
          valor={posicao > 0 ? `${posicao}º de ${ordenado.length}` : '—'}
          tom="de"
          icone={<Icone nome="trofeu" tamanho={20} className="text-texto-suave" />}
        />
      </div>

      {r2 && (
        <DarkCallout rotulo="O que mudou" titulo="Mesma demanda, outro sistema" icone={<Icone nome="raio" tamanho={22} />} acoes={acao}>
          {mensagemDaRodada(2, r2)}
        </DarkCallout>
      )}

      {r2 && (
        <Card rotulo="Plantão Lean comparado ao Travado" titulo="Resultado clínico">
          <GradeMetricas itens={METRICAS_CLINICAS} atual={r2} referencia={r1} rotuloReferencia="vs. Travado" />
        </Card>
      )}
      {r2 && (
        <Card rotulo="Carga do gestor" titulo="Menos decisões, decisões melhores">
          <GradeMetricas itens={METRICAS_GESTOR} atual={r2} referencia={r1} rotuloReferencia="vs. Travado" />
        </Card>
      )}

      {ordenado.length > 0 && (
        <Card rotulo="Turma" titulo="Ranking do Plantão Lean">
          <RankingTable itens={ordenado} destaqueGrupoId={grupoId} legenda="Ranking do Plantão Lean" />
        </Card>
      )}
    </Moldura>
  );
}
