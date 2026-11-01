// Evolução da turma ao longo do plantão (séries) e eventos marcantes, para o
// debrief e o resultado. Só aparece quando há séries ou eventos; sem eles, as
// telas seguem com o ranking (comportamento anterior).

import { Card } from '../../shared/components/ui';
import { GraficoEvolucao, LegendaEvolucao } from '../../shared/components/GraficoEvolucao';
import {
  contarPorRotulo,
  eventosMarcantes,
  evolucaoPorHora,
  horaDoMinuto,
  temEvolucao,
  type RodadaEvolucao,
} from '../../shared/lib/evolucao';
import type { EventoTurma, PontoSerieTurma } from '../../shared/schemas';

interface Props {
  series: PontoSerieTurma[] | null;
  eventos: EventoTurma[] | null;
  /** Debrief: só a rodada 1. Resultado: as duas. */
  rodadas: readonly RodadaEvolucao[];
}

export function EvolucaoTurma({ series, eventos, rodadas }: Props) {
  const so1 = rodadas.length === 1 && rodadas[0] === 1;
  const filtrar = (p: { r1: number | null; r2: number | null; hora: number }) => (so1 ? { ...p, r2: null } : p);
  const pontosDe = series ? evolucaoPorHora(series, (m) => m.deOcc).map(filtrar) : [];
  const pontosBoarding = series ? evolucaoPorHora(series, (m) => m.boarding).map(filtrar) : [];
  const temSeries = temEvolucao(pontosDe) || temEvolucao(pontosBoarding);

  const marcantes = eventos ? eventosMarcantes(eventos, so1 ? { rodada: 1 } : {}) : [];
  const recentes = marcantes.slice(0, 8);
  const contagens = rodadas.map((r) => ({
    rodada: r,
    itens: contarPorRotulo(marcantes.filter((e) => e.rodada === r)).slice(0, 6),
  }));

  if (!temSeries && marcantes.length === 0) return null;

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
      {temSeries && (
        <Card
          rotulo="Evolução"
          titulo="O plantão hora a hora"
          extra={<LegendaEvolucao className="text-sm text-texto-corpo" />}
          espaco="m"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-texto">Pacientes no DE (média por grupo)</p>
              <GraficoEvolucao
                titulo="Pacientes no DE, média por grupo, hora a hora"
                pontos={pontosDe}
                minimoEixo={5}
              />
            </div>
            <div>
              <p className="text-sm font-bold text-texto">Pacientes em boarding (média por grupo)</p>
              <GraficoEvolucao
                titulo="Pacientes em boarding, média por grupo, hora a hora"
                pontos={pontosBoarding}
                minimoEixo={4}
              />
            </div>
          </div>
        </Card>
      )}
      {marcantes.length > 0 && (
        <Card rotulo="Eventos" titulo="O que marcou o plantão" espaco="m">
          <div className={rodadas.length > 1 ? 'grid grid-cols-2 gap-4' : ''}>
            {contagens.map(({ rodada, itens }) => (
              <div key={rodada}>
                {rodadas.length > 1 && (
                  <p className="mb-2 font-space-mono text-rotulo font-bold tracking-[0.14em] text-texto-suave uppercase">
                    {rodada === 1 ? 'Plantão Travado' : 'Plantão Lean'}
                  </p>
                )}
                {itens.length === 0 ? (
                  <p className="text-sm text-texto-suave">Nenhum evento marcante.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {itens.map((c) => (
                      <li
                        key={c.rotulo}
                        className={
                          c.problema
                            ? 'rounded-pilula bg-amarelo-suave px-3 py-1 text-sm font-semibold text-marinho-profundo'
                            : 'rounded-pilula bg-fundo-app px-3 py-1 text-sm font-semibold text-verde-texto'
                        }
                      >
                        {c.rotulo}: {c.total}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="mt-5 mb-2 text-sm font-bold text-texto">Mais recentes</p>
          <ul className="flex flex-col gap-2">
            {recentes.map((e) => (
              <li key={`${e.rodada}-${e.id}`} className="flex items-start gap-3 text-[15px] leading-snug">
                <span className="font-space-mono text-sm font-bold text-texto-suave tabular-nums">
                  {rodadas.length > 1 ? `R${e.rodada} ` : ''}
                  {horaDoMinuto(e.minuto)}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-3 shrink-0 rounded-full"
                  style={{ background: e.cor }}
                />
                <span>
                  <strong className="font-bold">{e.nome}:</strong> {e.rotulo}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
