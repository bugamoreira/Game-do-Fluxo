import { cx } from './cx';
import { TeamAvatar } from './TeamAvatar';
import type { ItemRanking, Metricas, Tema } from './types';

interface Coluna {
  chave: keyof Metricas;
  rotulo: string;
  curto: string;
  formato?: (v: number) => string;
}

/** Métricas que importam para a discussão (design.md §6). */
export const COLUNAS_PADRAO: Coluna[] = [
  { chave: 'bH', rotulo: 'Horas de boarding', curto: 'Boarding', formato: v => `${v.toFixed(1).replace('.', ',')} h` },
  { chave: 'det', rotulo: 'Deteriorações', curto: 'Deter.' },
  { chave: 'dth', rotulo: 'Óbitos evitáveis', curto: 'Óbitos' },
  { chave: 'cxC', rotulo: 'Cirurgias canceladas', curto: 'Cancel.' },
  { chave: 'dis', rotulo: 'Altas', curto: 'Altas' },
];

export interface RankingTableProps {
  itens: ItemRanking[];
  /** Grupo do computador atual ("você está aqui", em amarelo). */
  destaqueGrupoId?: string;
  colunas?: Coluna[];
  tema?: Tema;
  /** Título acessível da tabela. */
  legenda?: string;
  className?: string;
}

const MEDALHAS = ['bg-amarelo text-marinho-profundo', 'bg-[#D7DBE8] text-marinho-profundo', 'bg-[#E9C9A6] text-marinho-profundo'];

export function RankingTable({
  itens,
  destaqueGrupoId,
  colunas = COLUNAS_PADRAO,
  tema = 'claro',
  legenda = 'Ranking dos grupos',
  className,
}: RankingTableProps) {
  const escuro = tema === 'escuro';
  const ordenados = [...itens].sort((a, b) => b.pontuacao - a.pontuacao);
  const maior = Math.max(1, ...ordenados.map(i => i.pontuacao));

  const th = cx(
    'px-2 py-3 font-space-mono @3xl:px-3 text-rotulo font-bold uppercase tracking-[0.14em]',
    escuro ? 'text-white/70' : 'text-texto-suave',
  );

  return (
    <div className={cx('@container overflow-x-auto', className)}>
      <table className="w-full border-separate border-spacing-y-1.5 text-left">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col" className={cx(th, 'w-12 text-center')}>
              <span aria-hidden="true">#</span>
              <span className="sr-only">Posição</span>
            </th>
            <th scope="col" className={th}>Grupo</th>
            <th scope="col" className={cx(th, 'text-right')}>Pontos</th>
            {colunas.map(c => (
              <th key={c.chave} scope="col" className={cx(th, 'text-right')}>
                <abbr title={c.rotulo} className="no-underline">
                  {c.curto}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenados.map((item, i) => {
            const voce = item.grupoId === destaqueGrupoId;
            const td = cx('px-2 py-2.5 @3xl:px-3', escuro ? 'bg-white/6' : 'bg-cartao');
            return (
              <tr
                key={item.grupoId}
                aria-current={voce ? 'true' : undefined}
                className={cx(voce && (escuro ? '[&>*]:bg-amarelo/20' : '[&>*]:bg-amarelo-suave'))}
              >
                <td className={cx(td, 'rounded-l-2xl text-center')}>
                  <span
                    className={cx(
                      'inline-grid size-8 place-items-center rounded-full font-space-mono text-sm font-bold',
                      MEDALHAS[i] ?? (escuro ? 'bg-white/10 text-white' : 'bg-fundo-app text-texto'),
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <th scope="row" className={cx(td, 'font-normal')}>
                  <span className="flex items-center gap-2">
                    <TeamAvatar nome={item.nome} cor={item.cor} tamanho="p" comNome tema={tema} />
                    {voce && (
                      <span className="rounded-pilula bg-amarelo px-2 py-0.5 text-[11px] font-bold text-marinho-profundo">
                        você
                      </span>
                    )}
                  </span>
                </th>
                <td className={cx(td, 'text-right', colunas.length === 0 && 'rounded-r-2xl')}>
                  <span className="flex items-center justify-end gap-3">
                    <span
                      aria-hidden="true"
                      className={cx('hidden h-1.5 w-20 overflow-hidden rounded-pilula @3xl:block', escuro ? 'bg-white/10' : 'bg-fundo-app')}
                    >
                      <span className="block h-full rounded-pilula" style={{ width: `${(item.pontuacao / maior) * 100}%`, background: item.cor }} />
                    </span>
                    <span className={cx('font-space-mono text-lg font-bold tabular-nums', escuro ? 'text-white' : 'text-texto')}>
                      {item.pontuacao}
                    </span>
                  </span>
                </td>
                {colunas.map((c, ci) => {
                  const v = item.metricas[c.chave] ?? 0;
                  return (
                    <td
                      key={c.chave}
                      className={cx(
                        td,
                        'text-right font-space-mono text-sm tabular-nums',
                        escuro ? 'text-white/90' : 'text-texto-corpo',
                        ci === colunas.length - 1 && 'rounded-r-2xl',
                      )}
                    >
                      {c.formato ? c.formato(v) : v}
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
