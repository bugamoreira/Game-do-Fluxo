// P3 — debrief: comparativo por grupo da rodada 1 (pontos, boarding, óbitos, cancelamentos).
// Com séries (telão aberto pela janela logada do facilitador), acrescenta as
// curvas do DE e do boarding hora a hora.

import { GraficoEvolucao } from '../../shared/components/GraficoEvolucao';
import { evolucaoPorHora, temEvolucao } from '../../shared/lib/evolucao';
import type { ItemRanking, PontoSerieTurma } from '../../shared/schemas';
import { INDICADORES_DEBRIEF, cargaDoGestor, formatarDecimal, type IndicadorDebrief } from '../derivar';

export function Debrief({ itensR1, series = null }: { itensR1: ItemRanking[]; series?: PontoSerieTurma[] | null }) {
  const carga = cargaDoGestor(itensR1);
  const so1 = (p: { hora: number; r1: number | null; r2: number | null }) => ({ ...p, r2: null });
  const curvaDe = series ? evolucaoPorHora(series, (m) => m.deOcc).map(so1) : [];
  const curvaBoarding = series ? evolucaoPorHora(series, (m) => m.boarding).map(so1) : [];
  const comCurvas = temEvolucao(curvaDe, 1) || temEvolucao(curvaBoarding, 1);
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
        <div className={comCurvas ? 'mt-7 grid min-h-0 flex-1 grid-cols-[1fr_600px] gap-10' : 'mt-7 flex min-h-0 flex-1'}>
          <div className={`grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-y-7 ${comCurvas ? 'gap-x-8' : 'gap-x-12'}`}>
            {INDICADORES_DEBRIEF.map((ind) => (
              <Painel key={ind.chave} indicador={ind} itens={itensR1} compacto={comCurvas} />
            ))}
          </div>
          {comCurvas && (
            <div className="flex min-h-0 flex-col gap-7">
              <Curva titulo="Pacientes no DE ao longo do plantão" pontos={curvaDe} minimoEixo={5} />
              <Curva titulo="Pacientes em boarding ao longo do plantão" pontos={curvaBoarding} minimoEixo={4} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Curva({ titulo, pontos, minimoEixo }: { titulo: string; pontos: ReturnType<typeof evolucaoPorHora>; minimoEixo: number }) {
  return (
    <section aria-label={titulo} className="flex min-h-0 flex-1 flex-col rounded-cartao-g bg-white/8 px-7 py-5 ring-1 ring-white/15">
      <h2 className="mb-2 text-2xl leading-tight font-bold">{titulo}</h2>
      <p className="mb-1 text-lg text-white/80">Média dos grupos, hora a hora</p>
      <GraficoEvolucao titulo={`${titulo}, média dos grupos`} pontos={pontos} tema="escuro" fonte={20} altura={250} minimoEixo={minimoEixo} />
    </section>
  );
}

function Painel({ indicador, itens, compacto = false }: { indicador: IndicadorDebrief; itens: ItemRanking[]; compacto?: boolean }) {
  const valores = itens.map((i) => indicador.valor(i));
  const maior = Math.max(...valores, 0);
  return (
    <section aria-label={indicador.titulo} className="flex min-h-0 flex-col rounded-cartao-g bg-white/8 px-7 py-5 ring-1 ring-white/15">
      <h2 className="mb-3 flex items-baseline justify-between gap-4">
        <span className={compacto ? 'text-[26px] leading-tight font-bold' : 'text-3xl font-bold'}>{indicador.titulo}</span>
        <span
          className={`shrink-0 font-space-mono text-amarelo uppercase ${compacto ? 'text-sm tracking-[0.08em]' : 'text-lg tracking-[0.12em]'}`}
        >
          {indicador.menorMelhor ? 'Menos é melhor' : 'Mais é melhor'}
        </span>
      </h2>
      <ul className="flex flex-1 flex-col justify-around">
        {itens.map((i, k) => {
          const v = valores[k] ?? 0;
          const largura = maior > 0 ? Math.max(1.5, (v / maior) * 100) : 1.5;
          return (
            <li key={i.grupoId} className={`grid items-center ${compacto ? 'grid-cols-[160px_1fr_118px] gap-3' : 'grid-cols-[230px_1fr_120px] gap-5'}`}>
              <span className={`truncate font-semibold ${compacto ? 'text-[22px]' : 'text-2xl'}`}>{i.nome}</span>
              <span aria-hidden="true" className="h-6 overflow-hidden rounded-pilula bg-white/10">
                <span className="telao-barra block h-full rounded-pilula" style={{ width: `${largura}%`, background: i.cor }} />
              </span>
              <span className={`text-right font-space-mono font-bold whitespace-nowrap tabular-nums ${compacto ? 'text-[26px]' : 'text-3xl'}`}>
                {indicador.formatar(v)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
