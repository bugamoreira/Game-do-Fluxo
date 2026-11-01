// P4 — pódio final animado e comparativo R1 × R2.
// As animações só rodam com motion-safe (classes em telao.css).

import { Icone, cx } from '../../shared/components/ui';
import { GraficoEvolucao, LegendaEvolucao } from '../../shared/components/GraficoEvolucao';
import { evolucaoPorHora, temEvolucao } from '../../shared/lib/evolucao';
import type { ItemRanking, PontoSerieTurma } from '../../shared/schemas';
import { cargaDoGestor, classificacaoFinal, comparativoTurma, formatarInteiro, itensDaRodada, type ColocacaoFinal, type LinhaComparativo } from '../derivar';
import { Medalhao } from '../componentes';

// Ordem visual do pódio: 2º, 1º, 3º.
const DEGRAUS = [
  { posicao: 2, altura: 250, atraso: 500 },
  { posicao: 1, altura: 340, atraso: 1000 },
  { posicao: 3, altura: 190, atraso: 0 },
];

export function Final({ itens, series = null }: { itens: ItemRanking[]; series?: PontoSerieTurma[] | null }) {
  // Com séries (telão aberto pela janela logada do facilitador): curva do DE R1 × R2.
  const curvaDe = series ? evolucaoPorHora(series, (m) => m.deOcc) : [];
  const comCurva = temEvolucao(curvaDe, 1) && temEvolucao(curvaDe, 2);
  const classificacao = classificacaoFinal(itens);
  const linhas = comparativoTurma(itens);
  const restantes = classificacao.slice(3);
  const cargaLean = cargaDoGestor(itensDaRodada(itens, 2));
  const cargaTravado = cargaDoGestor(itensDaRodada(itens, 1));
  const gestorAliviado = cargaLean.temDados && cargaTravado.temDados && cargaLean.decisoesPorHora < cargaTravado.decisoesPorHora;

  if (classificacao.length === 0) {
    return <p className="text-3xl text-white/80">O resultado aparece aqui assim que os placares chegarem.</p>;
  }

  return (
    <div className="grid h-full grid-cols-[900px_1fr] gap-14">
      <section aria-labelledby="telao-podio" className="flex min-h-0 flex-col">
        <h1 id="telao-podio" className="flex items-center gap-4 text-6xl font-bold">
          <Icone nome="trofeu" tamanho={56} className="text-amarelo" />
          Pódio final
        </h1>
        <ol className="mt-auto grid grid-cols-3 items-end gap-6">
          {DEGRAUS.map(({ posicao, altura, atraso }) => {
            const g = classificacao[posicao - 1];
            return (
              <li key={posicao} className="flex flex-col items-center" aria-label={g ? `${posicao}º lugar: ${g.nome}` : undefined}>
                {g ? <Vencedor g={g} posicao={posicao} atraso={atraso} /> : <span className="h-40" />}
                <div className="w-full overflow-hidden rounded-t-[28px]" style={{ height: altura }}>
                  <div
                    className={cx(
                      'telao-subir flex h-full w-full items-start justify-center rounded-t-[28px] pt-5',
                      posicao === 1 ? 'telao-brilho bg-amarelo text-marinho-profundo' : 'bg-white/15 text-white',
                    )}
                    style={{ animationDelay: `${atraso}ms` }}
                  >
                    <span className="font-space-mono text-8xl font-bold">{posicao}º</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {restantes.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-2xl">
            {restantes.map((g, i) => (
              <li key={g.grupoId} className="flex items-center gap-3">
                <span className="font-space-mono font-bold text-white/75">{i + 4}º</span>
                <span aria-hidden="true" className="size-4 rounded-full" style={{ background: g.cor }} />
                <span className="font-semibold">{g.nome}</span>
                <span className="font-space-mono text-white/85 tabular-nums">{formatarInteiro(g.final)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="telao-comparativo" className="flex min-h-0 flex-col">
        <h2 id="telao-comparativo" className="text-4xl font-bold">
          Plantão Travado <span className="text-white/70">×</span> Plantão Lean
        </h2>
        <table className="mt-5 w-full border-separate border-spacing-y-2.5 text-left">
          <thead>
            <tr className="font-space-mono text-lg tracking-[0.14em] text-white/75 uppercase">
              <th scope="col" className="font-normal">Turma</th>
              <th scope="col" className="w-[140px] text-right font-normal">Rodada 1</th>
              <th scope="col" className="w-[140px] text-right font-normal">Rodada 2</th>
              <th scope="col" className="w-[170px] text-right font-normal">Variação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaTabela key={l.rotulo} linha={l} />
            ))}
          </tbody>
        </table>

        {comCurva ? (
          <>
            <h3 className="mt-5 flex items-baseline justify-between gap-6 text-[28px] leading-tight font-bold">
              Pacientes no DE
              <LegendaEvolucao tema="escuro" className="shrink-0 text-lg font-normal text-white/85" />
            </h3>
            <GraficoEvolucao
              titulo="Pacientes no DE, média dos grupos, Plantão Travado e Plantão Lean"
              pontos={curvaDe}
              tema="escuro"
              fonte={13}
              altura={130}
              minimoEixo={5}
              className="mt-1"
            />
          </>
        ) : (
          <>
          <h3 className="mt-6 text-3xl font-bold">Evolução por grupo</h3>
          <ul className="mt-3 grid grid-cols-2 gap-x-10 gap-y-2.5">
            {classificacao.map((g) => (
              <li key={g.grupoId} className="flex items-center gap-3 text-2xl">
                <span aria-hidden="true" className="size-4 shrink-0 rounded-full" style={{ background: g.cor }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{g.nome}</span>
                <span className="font-space-mono text-white/80 tabular-nums">{g.r1 === null ? '–' : formatarInteiro(g.r1)}</span>
                <Icone nome="setaDireita" tamanho={20} className="text-white/60" />
                <span className="font-space-mono font-bold tabular-nums">{g.r2 === null ? '–' : formatarInteiro(g.r2)}</span>
              </li>
            ))}
          </ul>
          </>
        )}

        {gestorAliviado && (
          <p className="mt-auto rounded-cartao bg-white/10 px-6 py-4 text-2xl leading-snug ring-1 ring-white/15">
            No Lean, o sistema faz o trabalho repetitivo: o gestor decide menos e melhor.
          </p>
        )}
      </section>
    </div>
  );
}

function Vencedor({ g, posicao, atraso }: { g: ColocacaoFinal; posicao: number; atraso: number }) {
  const primeiro = posicao === 1;
  return (
    <div className="telao-surgir mb-5 flex flex-col items-center text-center" style={{ animationDelay: `${atraso + 900}ms` }}>
      <Medalhao nome={g.nome} cor={g.cor} tamanho={primeiro ? 120 : 92} />
      <p className={cx('mt-3 max-w-[280px] truncate font-bold', primeiro ? 'text-[40px]' : 'text-[32px]')}>{g.nome}</p>
      <p className={cx('font-space-mono font-bold tabular-nums', primeiro ? 'text-6xl text-amarelo' : 'text-5xl')}>{formatarInteiro(g.final)}</p>
    </div>
  );
}

function LinhaTabela({ linha }: { linha: LinhaComparativo }) {
  const { r1, r2 } = linha;
  const delta = r1 !== null && r2 !== null ? r2 - r1 : null;
  const melhorou = delta !== null && delta !== 0 && (linha.menorMelhor ? delta < 0 : delta > 0);
  const piorou = delta !== null && delta !== 0 && !melhorou;
  return (
    <tr className="text-[28px]">
      <th scope="row" className="py-1 pr-4 font-semibold">{linha.rotulo}</th>
      <td className="text-right font-space-mono text-white/80 tabular-nums">{r1 === null ? '–' : linha.formatar(r1)}</td>
      <td className="text-right font-space-mono font-bold tabular-nums">{r2 === null ? '–' : linha.formatar(r2)}</td>
      <td className="text-right">
        {delta !== null && (
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-pilula px-3 py-0.5 font-space-mono text-2xl font-bold',
              melhorou && 'bg-verde text-marinho-profundo',
              piorou && 'bg-amarelo text-marinho-profundo',
              !melhorou && !piorou && 'bg-white/15',
            )}
          >
            {delta === 0 ? '=' : <Icone nome={delta > 0 ? 'setaCima' : 'setaBaixo'} tamanho={20} strokeWidth={3} />}
            {delta !== 0 && linha.formatar(Math.abs(delta))}
          </span>
        )}
      </td>
    </tr>
  );
}
