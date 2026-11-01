import { useState } from 'react';
import {
  Button,
  Card,
  ClockBar,
  DarkCallout,
  Icone,
  RankingTable,
  Sidebar,
  StatTile,
  type ItemSidebar,
} from '../shared/components/ui';
import { MINUTO_AGORA, RANKING } from './dados';

const FASES: ItemSidebar[] = [
  { id: 'sala', rotulo: 'Sala', icone: <Icone nome="sala" />, selo: '6' },
  { id: 'aovivo', rotulo: 'Ao vivo', icone: <Icone nome="aoVivo" />, selo: 'R1' },
  { id: 'debrief', rotulo: 'Debrief', icone: <Icone nome="debrief" /> },
  { id: 'resultado', rotulo: 'Resultado', icone: <Icone nome="trofeu" />, desabilitado: true },
];

const TENDENCIAS = [
  [420, 520, 610, 690, 760, 812],
  [430, 500, 590, 650, 700, 744],
  [440, 520, 560, 620, 660, 690],
  [450, 500, 540, 570, 590, 602],
  [460, 480, 500, 510, 520, 515],
  [470, 460, 455, 450, 440, 431],
];

/** Painel F2 (ao vivo) do facilitador com a barra lateral. */
export function MockFacilitador() {
  const [fase, setFase] = useState('aovivo');
  return (
    <div className="flex min-h-[900px] bg-fundo-app font-sora text-texto-corpo">
      <Sidebar
        itens={FASES}
        ativo={fase}
        onSelecionar={setFase}
        className="min-h-[900px]"
        cabecalho={
          <div>
            <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">Facilitador</p>
            <p className="mt-1 text-xl leading-tight font-bold">
              Simulador do <span className="text-amarelo">Plantão</span>
            </p>
          </div>
        }
        rodape={
          <div className="flex flex-col gap-4">
            <Button variante="contorno" sobreEscuro tamanho="p" larguraTotal icone={<Icone nome="telao" tamanho={18} />}>
              Abrir telão
            </Button>
            <img src="/img/brand/abramede.png" alt="ABRAMEDE" className="w-full rounded-xl" />
            <p className="text-xs text-white/70">CBMEDE 2026 · Rio de Janeiro</p>
          </div>
        }
      />

      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <header className="flex items-end justify-between gap-8">
          <div>
            <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">
              Turma CBM-T3 · 6 grupos conectados
            </p>
            <h1 className="text-titulo-m font-bold text-texto">Plantão Travado ao vivo</h1>
          </div>
          <ClockBar minuto={MINUTO_AGORA} className="w-[420px]" />
        </header>

        <section aria-label="Pontuação por grupo" className="grid grid-cols-6 gap-4">
          {RANKING.map((g, i) => (
            <StatTile
              key={g.grupoId}
              rotulo={g.nome}
              valor={g.pontuacao}
              cor={g.cor}
              tendencia={TENDENCIAS[i]}
              variacao={(TENDENCIAS[i]![5]! - TENDENCIAS[i]![4]!)}
              referencia="em 1 h"
            />
          ))}
        </section>

        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_340px] gap-6">
          <Card grande titulo="Ranking e métricas da discussão" rotulo="Ao vivo">
            <RankingTable itens={RANKING} />
          </Card>
          <div className="flex flex-col gap-6">
            <DarkCallout
              rotulo="Próxima ação da aula"
              titulo="Encerrar o Plantão Travado às 19:00"
              acoes={<Button variante="verde">Ir para o debrief</Button>}
            >
              Faltam 8h15 de plantão simulado (cerca de 8 min). Peça aos grupos que olhem o boarding antes do fim.
            </DarkCallout>
            <Card titulo="Controles" espaco="m">
              <div className="flex flex-col gap-3">
                <Button variante="marinho" icone={<Icone nome="pausa" tamanho={18} />} larguraTotal>
                  Pausar todos
                </Button>
                <Button variante="contorno" icone={<Icone nome="musica" tamanho={18} />} larguraTotal>
                  Silenciar música
                </Button>
                <Button variante="fantasma" tamanho="p" larguraTotal>
                  Liberar entrada de grupo atrasado
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
