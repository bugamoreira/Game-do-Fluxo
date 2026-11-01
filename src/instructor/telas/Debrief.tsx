// F3 — Debrief: números da rodada 1 por grupo para a discussão, incluindo a
// carga do gestor (decisões reativas × produtivas e alertas), a evolução hora a
// hora e os eventos marcantes (quando há séries e eventos), e o início do Lean.

import { Card, Icone, StatTile } from '../../shared/components/ui';
import { BarrasDecisoes } from '../componentes/BarrasDecisoes';
import { ChamadaAula } from '../componentes/ChamadaAula';
import { EvolucaoTurma } from '../componentes/EvolucaoTurma';
import { TabelaMetricas } from '../componentes/TabelaMetricas';
import { contarProntos, rotuloProntos } from '../logica/fases';
import { horas, inteiro, porcento, umaCasa } from '../logica/formato';
import { itensDaRodada, resumoRodada } from '../logica/metricas';
import type { PropsTela } from '../tipos';

const PERGUNTAS = [
  'Onde o paciente ficou parado mais tempo: no DE, esperando leito, ou na RPA?',
  'Quantas decisões do grupo foram para apagar incêndio? O que as provocou?',
  'Quem deteriorou estava em boarding há quanto tempo?',
  'Que informação faltou para decidir antes (altas previstas, cirurgias, leitos)?',
];

export function Debrief({ turma, grupos, ranking, proxima, ocupado, acionar, series, eventos }: PropsTela) {
  const r1 = itensDaRodada(ranking, 1);
  const resumo = resumoRodada(r1);
  const { conectados, total } = contarProntos(grupos);
  const noDebrief = turma.status === 'debrief';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section aria-label="Turma na rodada 1" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile rotulo="Boarding da turma" valor={horas(resumo.boardingHoras)} />
        <StatTile rotulo="Deteriorações" valor={inteiro(resumo.deterioracoes)} />
        <StatTile rotulo="Óbitos evitáveis" valor={inteiro(resumo.obitos)} />
        <StatTile rotulo="No tempo-alvo" valor={porcento(resumo.slaMedio)} />
        <StatTile rotulo="Decisões reativas" valor={porcento(resumo.pctReativas)} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <ChamadaAula
          proxima={proxima}
          onAcao={(tipo) => acionar({ tipo })}
          ocupado={ocupado === proxima.acao}
          detalheBotao={noDebrief ? rotuloProntos(conectados, total) : undefined}
        />
        <Card titulo="Perguntas para a discussão" rotulo="Debrief" espaco="m">
          <ol className="flex flex-col gap-3">
            {PERGUNTAS.map((p, i) => (
              <li key={p} className="flex gap-3 text-[15px] leading-snug">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amarelo-suave font-space-mono text-sm font-bold text-marinho-profundo">
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
          <p className="mt-5 flex items-start gap-2 border-t border-borda pt-4 text-sm text-texto-suave">
            <Icone nome="telao" tamanho={16} className="mt-0.5 shrink-0" />
            Os gráficos do debrief aparecem no telão ao mesmo tempo.
          </p>
        </Card>
      </div>

      <EvolucaoTurma series={series} eventos={eventos} rodadas={[1]} />

      <Card grande rotulo="Plantão Travado" titulo="Rodada 1 por grupo">
        <TabelaMetricas itens={r1} legenda="Resultado do Plantão Travado por grupo" />
      </Card>
      <Card
        grande
        rotulo="Carga do gestor"
        titulo="Quanto cada grupo precisou decidir"
        extra={
          <span className="rounded-pilula bg-fundo-app px-3 py-1.5 font-space-mono text-sm font-bold text-texto">
            {umaCasa(resumo.decisoesPorHora)} decisões/h · {umaCasa(resumo.alertasPorHora)} alertas/h
          </span>
        }
      >
        {r1.length > 0 ? (
          <BarrasDecisoes itens={r1} />
        ) : (
          <p className="text-[15px] text-texto-suave">Sem dados da rodada 1.</p>
        )}
      </Card>
    </div>
  );
}
