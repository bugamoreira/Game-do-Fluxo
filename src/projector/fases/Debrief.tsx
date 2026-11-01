// P3 — debrief: comparativo por grupo da rodada 1 (pontos, boarding, óbitos, cancelamentos).

import type { ItemRanking } from '../../shared/schemas';
import { INDICADORES_DEBRIEF, cargaDoGestor, formatarDecimal, type IndicadorDebrief } from '../derivar';

export function Debrief({ itensR1 }: { itensR1: ItemRanking[] }) {
  const carga = cargaDoGestor(itensR1);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-end justify-between gap-10">
        <h1 className="text-6xl font-bold">Onde o plantão travou?</h1>
        {carga.temDados && (
          <p className="pb-1 text-right text-2xl leading-snug text-white/85">
            Carga do gestor: <strong className="text-white">{formatarDecimal(carga.decisoesPorHora)} decisões</strong> e{' '}
            <strong className="text-white">{formatarDecimal(carga.alertasPorHora)} alertas</strong> por hora
            {carga.fracaoReativa !== null && (
              <>
                <br />
                {Math.round(carga.fracaoReativa * 100)}% das decisões foram para apagar incêndio
              </>
            )}
          </p>
        )}
      </div>

      {itensR1.length === 0 ? (
        <p className="mt-10 text-3xl text-white/80">Os dados da rodada 1 aparecem aqui assim que os grupos enviarem o placar.</p>
      ) : (
        <div className="mt-7 grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-x-12 gap-y-7">
          {INDICADORES_DEBRIEF.map((ind) => (
            <Painel key={ind.chave} indicador={ind} itens={itensR1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Painel({ indicador, itens }: { indicador: IndicadorDebrief; itens: ItemRanking[] }) {
  const valores = itens.map((i) => indicador.valor(i));
  const maior = Math.max(...valores, 0);
  return (
    <section aria-label={indicador.titulo} className="flex min-h-0 flex-col rounded-cartao-g bg-white/8 px-7 py-5 ring-1 ring-white/15">
      <h2 className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-3xl font-bold">{indicador.titulo}</span>
        <span className="font-space-mono text-lg tracking-[0.12em] text-amarelo uppercase">
          {indicador.menorMelhor ? 'Menos é melhor' : 'Mais é melhor'}
        </span>
      </h2>
      <ul className="flex flex-1 flex-col justify-around">
        {itens.map((i, k) => {
          const v = valores[k] ?? 0;
          const largura = maior > 0 ? Math.max(1.5, (v / maior) * 100) : 1.5;
          return (
            <li key={i.grupoId} className="grid grid-cols-[230px_1fr_120px] items-center gap-5">
              <span className="truncate text-2xl font-semibold">{i.nome}</span>
              <span aria-hidden="true" className="h-6 overflow-hidden rounded-pilula bg-white/10">
                <span className="telao-barra block h-full rounded-pilula" style={{ width: `${largura}%`, background: i.cor }} />
              </span>
              <span className="text-right font-space-mono text-3xl font-bold tabular-nums">{indicador.formatar(v)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
