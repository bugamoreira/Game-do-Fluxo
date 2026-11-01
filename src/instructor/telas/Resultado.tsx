// F5 — Resultado: comparativo R1 × R2 por grupo e da turma, a mensagem do
// Lean (menos sobrecarga do gestor), o relatório e a nova turma.

import { Button, Card, Icone, StatTile, TeamAvatar, cx } from '../../shared/components/ui';
import type { ItemRanking } from '../../shared/schemas';
import { ChamadaAula } from '../componentes/ChamadaAula';
import { comSinal, horas, inteiro, porcento, umaCasa } from '../logica/formato';
import { cargaDoGestor, comparativo, itensDaRodada, mensagensLean, metrica, resumoRodada } from '../logica/metricas';
import type { PropsTela } from '../tipos';

interface ColunaComparativa {
  id: string;
  rotulo: string;
  curto: string;
  valor: (i: ItemRanking) => number;
  formato: (v: number) => string;
  /** Quando cair é bom (boarding, óbitos). */
  menorMelhor: boolean;
}

const COLUNAS: ColunaComparativa[] = [
  {
    id: 'bH',
    rotulo: 'Horas de boarding',
    curto: 'Boarding',
    valor: (i) => metrica(i, 'bH'),
    formato: horas,
    menorMelhor: true,
  },
  {
    id: 'dth',
    rotulo: 'Óbitos evitáveis',
    curto: 'Óbitos',
    valor: (i) => metrica(i, 'dth'),
    formato: inteiro,
    menorMelhor: true,
  },
  {
    id: 'det',
    rotulo: 'Deteriorações',
    curto: 'Deter.',
    valor: (i) => metrica(i, 'det'),
    formato: inteiro,
    menorMelhor: true,
  },
  {
    id: 'cxC',
    rotulo: 'Cirurgias canceladas',
    curto: 'Cancel.',
    valor: (i) => metrica(i, 'cxC'),
    formato: inteiro,
    menorMelhor: true,
  },
  {
    id: 'sla',
    rotulo: 'Pacientes no tempo-alvo de Manchester',
    curto: 'No alvo',
    valor: (i) => metrica(i, 'slaPct'),
    formato: porcento,
    menorMelhor: false,
  },
  {
    id: 'decH',
    rotulo: 'Decisões por hora',
    curto: 'Decisões/h',
    valor: (i) => cargaDoGestor(i).decisoesPorHora,
    formato: umaCasa,
    menorMelhor: true,
  },
  {
    id: 'reat',
    rotulo: 'Decisões reativas',
    curto: 'Reativas',
    valor: (i) => cargaDoGestor(i).pctReativas,
    formato: porcento,
    menorMelhor: true,
  },
];

export function Resultado({ ranking, proxima, ocupado, acionar, linkRelatorio, turma }: PropsTela) {
  const r1 = resumoRodada(itensDaRodada(ranking, 1));
  const r2 = resumoRodada(itensDaRodada(ranking, 2));
  const linhas = comparativo(ranking);
  const frases = mensagensLean(r1, r2);
  const temR2 = r2.grupos > 0;
  const varia = (a: number, b: number) => (temR2 ? Math.round(b - a) : undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section
        aria-label="Turma: Plantão Lean comparado ao Travado"
        className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatTile
          rotulo="Pontuação"
          valor={inteiro(r2.pontuacaoMedia)}
          variacao={varia(Math.round(r1.pontuacaoMedia), Math.round(r2.pontuacaoMedia))}
          referencia="vs. Travado"
        />
        <StatTile
          rotulo="Boarding"
          valor={horas(r2.boardingHoras)}
          variacao={varia(r1.boardingHoras, r2.boardingHoras)}
          sentidoBom="descer"
          referencia="vs. Travado"
        />
        <StatTile
          rotulo="Óbitos"
          valor={inteiro(r2.obitos)}
          variacao={varia(r1.obitos, r2.obitos)}
          sentidoBom="descer"
          referencia="vs. Travado"
        />
        <StatTile
          rotulo="No alvo"
          valor={porcento(r2.slaMedio)}
          variacao={varia(Math.round(r1.slaMedio), Math.round(r2.slaMedio))}
          referencia="vs. Travado"
        />
        <StatTile
          rotulo="Decisões/h"
          valor={umaCasa(r2.decisoesPorHora)}
          variacao={varia(Math.round(r1.decisoesPorHora), Math.round(r2.decisoesPorHora))}
          sentidoBom="descer"
          referencia="vs. Travado"
        />
        <StatTile
          rotulo="Alertas/h"
          valor={umaCasa(r2.alertasPorHora)}
          variacao={varia(Math.round(r1.alertasPorHora), Math.round(r2.alertasPorHora))}
          sentidoBom="descer"
          referencia="vs. Travado"
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card rotulo="A mensagem do Lean" titulo="Menos sobrecarga do gestor" espaco="m">
          {frases.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {frases.map((f) => (
                <li key={f} className="flex gap-3 text-[15px] leading-snug">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-amarelo-suave text-marinho-profundo"
                  >
                    <Icone nome="check" tamanho={14} strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-texto-suave">
              {temR2
                ? 'Os números desta turma não mostraram redução de carga. Vale discutir por quê.'
                : 'Aguardando o placar do Plantão Lean.'}
            </p>
          )}
          <p className="mt-4 rounded-2xl bg-fundo-app px-4 py-3 text-[15px] font-semibold text-texto">
            No Lean, o sistema faz o trabalho repetitivo; o gestor decide menos e melhor, e a operação funciona.
          </p>
        </Card>
        <div className="flex flex-col gap-4">
          <ChamadaAula proxima={proxima} onAcao={(tipo) => acionar({ tipo })} ocupado={ocupado === proxima.acao}>
            {linkRelatorio && (
              <div className="mt-4 flex flex-col gap-2">
                <label
                  htmlFor="link-relatorio"
                  className="font-space-mono text-rotulo font-bold uppercase tracking-[0.16em] text-amarelo"
                >
                  Link do relatório
                </label>
                <input
                  id="link-relatorio"
                  readOnly
                  value={linkRelatorio}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-11 w-full rounded-2xl border border-white/25 bg-white/10 px-3 font-space-mono text-sm text-white"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variante="amarelo"
                    tamanho="p"
                    icone={<Icone nome="check" tamanho={16} />}
                    onClick={() => acionar({ tipo: 'copiarLink', link: linkRelatorio })}
                  >
                    Copiar link
                  </Button>
                  <a
                    href={linkRelatorio}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-10 items-center rounded-pilula px-4 text-sm font-bold text-white hover:bg-white/10"
                  >
                    Abrir relatório
                  </a>
                </div>
              </div>
            )}
          </ChamadaAula>
          {proxima.acao !== 'novaTurma' && (turma.status === 'encerrada' || turma.status === 'arquivada') && (
            <Button
              variante="contorno"
              larguraTotal
              carregando={ocupado === 'novaTurma'}
              onClick={() => acionar({ tipo: 'novaTurma' })}
            >
              Nova turma
            </Button>
          )}
        </div>
      </div>

      <Card grande rotulo="Travado × Lean" titulo="Comparativo por grupo">
        {linhas.length === 0 ? (
          <p className="text-[15px] text-texto-suave">Nenhum placar recebido nesta turma.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-1.5 text-left">
              <caption className="sr-only">
                Pontuação e métricas de cada grupo no Plantão Travado e no Plantão Lean
              </caption>
              <thead>
                <tr className="font-space-mono text-rotulo font-bold uppercase tracking-[0.12em] text-texto-suave">
                  <th scope="col" className="px-2 py-3">
                    Grupo
                  </th>
                  <th scope="col" className="px-2 py-3 text-right">
                    Travado
                  </th>
                  <th scope="col" className="px-2 py-3 text-right">
                    Lean
                  </th>
                  <th scope="col" className="px-2 py-3 text-right">
                    Ganho
                  </th>
                  {COLUNAS.map((c) => (
                    <th key={c.id} scope="col" className="px-2 py-3 text-right">
                      <abbr title={`${c.rotulo}: Travado → Lean`} className="no-underline">
                        {c.curto}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const td = 'bg-fundo-app/70 px-2 py-2.5';
                  return (
                    <tr key={l.grupoId}>
                      <th scope="row" className={cx(td, 'max-w-52 rounded-l-2xl font-normal')}>
                        <TeamAvatar nome={l.nome} cor={l.cor} tamanho="p" comNome className="max-w-48" />
                      </th>
                      <td className={cx(td, 'text-right font-space-mono text-texto-corpo tabular-nums')}>
                        {l.r1 ? inteiro(l.r1.pontuacao) : '—'}
                      </td>
                      <td className={cx(td, 'text-right font-space-mono text-lg font-bold text-texto tabular-nums')}>
                        {l.r2 ? inteiro(l.r2.pontuacao) : '—'}
                      </td>
                      <td
                        className={cx(
                          td,
                          'text-right font-space-mono text-sm font-bold tabular-nums',
                          l.ganho === null
                            ? 'text-texto-suave'
                            : l.ganho >= 0
                              ? 'text-verde-texto'
                              : 'text-negativo-texto',
                        )}
                      >
                        {l.ganho === null ? '—' : comSinal(l.ganho)}
                      </td>
                      {COLUNAS.map((c, ci) => (
                        <td
                          key={c.id}
                          className={cx(
                            td,
                            'text-right font-space-mono text-sm whitespace-nowrap text-texto-corpo tabular-nums',
                            ci === COLUNAS.length - 1 && 'rounded-r-2xl',
                          )}
                        >
                          <CelulaAntesDepois coluna={c} r1={l.r1} r2={l.r2} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CelulaAntesDepois({ coluna, r1, r2 }: { coluna: ColunaComparativa; r1?: ItemRanking; r2?: ItemRanking }) {
  if (!r1 && !r2) return <>—</>;
  const a = r1 ? coluna.valor(r1) : null;
  const b = r2 ? coluna.valor(r2) : null;
  const melhorou = a !== null && b !== null && (coluna.menorMelhor ? b < a : b > a);
  const piorou = a !== null && b !== null && (coluna.menorMelhor ? b > a : b < a);
  return (
    <span>
      <span className="text-texto-suave">{a === null ? '—' : coluna.formato(a)}</span>
      <span aria-hidden="true" className="px-1 text-texto-suave">
        →
      </span>
      <span className="sr-only"> para </span>
      <span className={cx('font-bold', melhorou ? 'text-verde-texto' : piorou ? 'text-negativo-texto' : 'text-texto')}>
        {b === null ? '—' : coluna.formato(b)}
      </span>
    </span>
  );
}
