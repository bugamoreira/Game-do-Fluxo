// F2 (Plantão Travado) e F4 (Plantão Lean) — ao vivo: pontuação por grupo,
// ranking com as métricas da discussão, próxima ação e controles da sala.

import { useState } from 'react';
import { Button, Card, Icone, StatTile } from '../../shared/components/ui';
import type { ItemRanking } from '../../shared/schemas';
import { ChamadaAula } from '../componentes/ChamadaAula';
import { CodigoAcesso } from '../componentes/CodigoAcesso';
import { ConexaoGrupos } from '../componentes/ConexaoGrupos';
import { TabelaMetricas } from '../componentes/TabelaMetricas';
import { emRodada } from '../logica/fases';
import { inteiro } from '../logica/formato';
import { itensDaRodada } from '../logica/metricas';
import { acrescentar, variacaoUmaHora, type Historico } from '../logica/tendencias';
import type { PropsTela } from '../tipos';

const VAZIO: Historico = new Map();

export function AoVivo({ turma, grupos, ranking, proxima, ocupado, acionar }: PropsTela) {
  // Em rodada, mostra a rodada atual; consultando depois (debrief/resultado), a última jogada.
  const rodada: 1 | 2 = turma.rodada ?? 1;
  const itens = itensDaRodada(ranking, rodada);
  const ativa = emRodada(turma.status);
  const lean = rodada === 2;
  const historico = useHistorico(itens, rodada);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section aria-label="Pontuação por grupo" className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
        {itens.length === 0 && (
          <p className="col-span-full rounded-cartao bg-cartao px-5 py-4 text-[15px] text-texto-suave shadow-cartao">
            Aguardando o primeiro placar dos grupos…
          </p>
        )}
        {itens.map((g) => {
          const pontos = historico.get(g.grupoId);
          return (
            <StatTile
              key={g.grupoId}
              rotulo={g.nome}
              valor={inteiro(g.pontuacao)}
              cor={g.cor}
              tendencia={pontos && pontos.length > 1 ? pontos.map((p) => p.pontuacao) : undefined}
              variacao={variacaoUmaHora(pontos)}
              referencia="em 1 h"
            />
          );
        })}
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 items-start xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          grande
          titulo="Ranking e métricas da discussão"
          rotulo={ativa ? 'Ao vivo' : lean ? 'Plantão Lean' : 'Plantão Travado'}
        >
          <TabelaMetricas itens={itens} legenda={`Ranking do ${lean ? 'Plantão Lean' : 'Plantão Travado'}`} />
        </Card>

        <div className="flex flex-col gap-6">
          <ChamadaAula proxima={proxima} onAcao={(tipo) => acionar({ tipo })} ocupado={ocupado === proxima.acao} />
          {ativa && <CodigoAcesso codigo={turma.codigoAcesso} compacto />}
          {ativa && <ConexaoGrupos grupos={grupos} />}

          {ativa && (
            <Card titulo="Controles" espaco="m">
              <div className="flex flex-col gap-3">
                {turma.pausada ? (
                  <Button
                    variante="marinho"
                    icone={<Icone nome="play" tamanho={18} />}
                    larguraTotal
                    carregando={ocupado === 'retomar'}
                    onClick={() => acionar({ tipo: 'retomar' })}
                  >
                    Retomar todos
                  </Button>
                ) : (
                  <Button
                    variante="marinho"
                    icone={<Icone nome="pausa" tamanho={18} />}
                    larguraTotal
                    carregando={ocupado === 'pausar'}
                    onClick={() => acionar({ tipo: 'pausar' })}
                  >
                    Pausar todos
                  </Button>
                )}
                <Button
                  variante="contorno"
                  icone={<Icone nome="musica" tamanho={18} />}
                  larguraTotal
                  aria-pressed={turma.musicaMudo}
                  carregando={ocupado === 'musica'}
                  onClick={() => acionar({ tipo: 'musica' })}
                >
                  {turma.musicaMudo ? 'Ligar música' : 'Silenciar música'}
                </Button>
                {lean && (
                  <Button
                    variante={turma.fullCapacityLiberado ? 'contorno' : 'amarelo'}
                    icone={<Icone nome={turma.fullCapacityLiberado ? 'cadeado' : 'raio'} tamanho={18} />}
                    larguraTotal
                    carregando={ocupado === 'liberarFullCapacity' || ocupado === 'revogarFullCapacity'}
                    onClick={() =>
                      acionar({ tipo: turma.fullCapacityLiberado ? 'revogarFullCapacity' : 'liberarFullCapacity' })
                    }
                  >
                    {turma.fullCapacityLiberado ? 'Revogar PCP (Full Capacity)' : 'Liberar PCP (Full Capacity)'}
                  </Button>
                )}
                {lean && turma.fullCapacityLiberado && (
                  <p className="-mt-1 text-center text-sm font-semibold text-verde-texto">
                    PCP liberado para todos os grupos.
                  </p>
                )}
                <Button
                  variante="fantasma"
                  tamanho="p"
                  larguraTotal
                  carregando={ocupado === 'entrada'}
                  onClick={() => acionar({ tipo: 'entrada' })}
                >
                  {turma.entradaLiberada ? 'Fechar entrada de grupos novos' : 'Liberar entrada de grupo atrasado'}
                </Button>
                <div className="mt-1 border-t border-borda pt-4">
                  <Button
                    variante="contorno"
                    icone={<Icone nome="relogio" tamanho={18} />}
                    larguraTotal
                    carregando={ocupado === 'encerrar'}
                    onClick={() => acionar({ tipo: 'encerrar' })}
                  >
                    Encerrar rodada
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** Guarda a evolução da pontuação vista pelo painel (padrão "estado derivado da renderização anterior"). */
function useHistorico(itens: ItemRanking[], rodada: 1 | 2): Historico {
  const [estado, setEstado] = useState({ rodada, itens: [] as ItemRanking[], historico: VAZIO });
  if (estado.itens !== itens || estado.rodada !== rodada) {
    const base = estado.rodada === rodada ? estado.historico : VAZIO;
    const mesmos = estado.itens.length === itens.length && estado.itens.every((a, i) => a === itens[i]);
    if (!mesmos || estado.rodada !== rodada) setEstado({ rodada, itens, historico: acrescentar(base, itens) });
  }
  return estado.historico;
}
