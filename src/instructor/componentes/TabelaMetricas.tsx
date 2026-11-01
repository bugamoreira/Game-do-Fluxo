// Tabela de ranking com as métricas da discussão. Mesmo desenho da
// RankingTable do design system, mas com colunas calculadas (inclui % no
// tempo-alvo de Manchester e a carga do gestor, que não cabem no tipo da UI).

import { TeamAvatar, cx } from '../../shared/components/ui';
import type { ItemRanking } from '../../shared/schemas';
import { horas, inteiro, porcento, umaCasa } from '../logica/formato';
import { cargaDoGestor, metrica } from '../logica/metricas';

export interface ColunaMetrica {
  id: string;
  rotulo: string;
  curto: string;
  valor: (item: ItemRanking) => number;
  formato?: (v: number) => string;
}

export const COLUNAS_DISCUSSAO: ColunaMetrica[] = [
  { id: 'bH', rotulo: 'Horas de boarding', curto: 'Boarding', valor: (i) => metrica(i, 'bH'), formato: horas },
  { id: 'det', rotulo: 'Deteriorações', curto: 'Deter.', valor: (i) => metrica(i, 'det') },
  { id: 'dth', rotulo: 'Óbitos evitáveis', curto: 'Óbitos', valor: (i) => metrica(i, 'dth') },
  { id: 'cxC', rotulo: 'Cirurgias canceladas', curto: 'Cancel.', valor: (i) => metrica(i, 'cxC') },
  { id: 'dis', rotulo: 'Altas', curto: 'Altas', valor: (i) => metrica(i, 'dis') },
  {
    id: 'slaPct',
    rotulo: 'Pacientes atendidos no tempo-alvo de Manchester',
    curto: 'No alvo',
    valor: (i) => metrica(i, 'slaPct'),
    formato: porcento,
  },
];

export const COLUNAS_CARGA: ColunaMetrica[] = [
  {
    id: 'decH',
    rotulo: 'Decisões por hora',
    curto: 'Decisões/h',
    valor: (i) => cargaDoGestor(i).decisoesPorHora,
    formato: umaCasa,
  },
  {
    id: 'reat',
    rotulo: 'Decisões reativas (apagar incêndio)',
    curto: 'Reativas',
    valor: (i) => cargaDoGestor(i).pctReativas,
    formato: porcento,
  },
  {
    id: 'alH',
    rotulo: 'Alertas e crises por hora',
    curto: 'Alertas/h',
    valor: (i) => cargaDoGestor(i).alertasPorHora,
    formato: umaCasa,
  },
  {
    id: 'auto',
    rotulo: 'Tarefas feitas pelas ferramentas automáticas',
    curto: 'Automáticas',
    valor: (i) => cargaDoGestor(i).automatico,
  },
];

const MEDALHAS = [
  'bg-amarelo text-marinho-profundo',
  'bg-[#D7DBE8] text-marinho-profundo',
  'bg-[#E9C9A6] text-marinho-profundo',
];

interface TabelaMetricasProps {
  itens: ItemRanking[];
  colunas?: ColunaMetrica[];
  legenda: string;
  className?: string;
}

export function TabelaMetricas({ itens, colunas = COLUNAS_DISCUSSAO, legenda, className }: TabelaMetricasProps) {
  const ordenados = [...itens].sort((a, b) => b.pontuacao - a.pontuacao);
  const maior = Math.max(1, ...ordenados.map((i) => i.pontuacao));
  const th =
    'px-2 py-3 font-space-mono text-[11px] font-bold uppercase tracking-[0.08em] text-texto-suave whitespace-nowrap';

  if (ordenados.length === 0)
    return (
      <p className="rounded-2xl bg-fundo-app px-5 py-8 text-center text-[15px] text-texto-suave">
        Nenhum placar recebido ainda. Os números aparecem assim que os grupos começarem a jogar.
      </p>
    );

  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-separate border-spacing-y-1.5 text-left">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col" className={cx(th, 'w-12 text-center')}>
              <span aria-hidden="true">#</span>
              <span className="sr-only">Posição</span>
            </th>
            <th scope="col" className={th}>
              Grupo
            </th>
            <th scope="col" className={cx(th, 'text-right')}>
              Pontos
            </th>
            {colunas.map((c) => (
              <th key={c.id} scope="col" className={cx(th, 'text-right')}>
                <abbr title={c.rotulo} className="no-underline">
                  {c.curto}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenados.map((item, i) => {
            const td = 'bg-fundo-app/70 px-2 py-2.5';
            return (
              <tr key={item.grupoId}>
                <td className={cx(td, 'rounded-l-2xl text-center')}>
                  <span
                    className={cx(
                      'inline-grid size-8 place-items-center rounded-full font-space-mono text-sm font-bold',
                      MEDALHAS[i] ?? 'bg-cartao text-texto',
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <th scope="row" className={cx(td, 'max-w-48 font-normal')}>
                  <TeamAvatar nome={item.nome} cor={item.cor} tamanho="p" comNome className="max-w-44" />
                </th>
                <td className={td}>
                  <span className="flex items-center justify-end gap-3">
                    <span
                      aria-hidden="true"
                      className="hidden h-1.5 w-16 overflow-hidden rounded-pilula bg-cartao 2xl:block"
                    >
                      <span
                        className="block h-full rounded-pilula"
                        style={{ width: `${(item.pontuacao / maior) * 100}%`, background: item.cor }}
                      />
                    </span>
                    <span className="font-space-mono text-lg font-bold text-texto tabular-nums">
                      {inteiro(item.pontuacao)}
                    </span>
                  </span>
                </td>
                {colunas.map((c, ci) => {
                  const v = c.valor(item);
                  return (
                    <td
                      key={c.id}
                      className={cx(
                        td,
                        'text-right font-space-mono text-sm text-texto-corpo tabular-nums',
                        ci === colunas.length - 1 && 'rounded-r-2xl',
                      )}
                    >
                      {c.formato ? c.formato(v) : inteiro(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
