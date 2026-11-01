// P2 — rodada ao vivo: relógio do plantão, ranking em barras e eventos marcantes.

import { ClockBar, Icone, TeamAvatar, cx, horaDoPlantao } from '../../shared/components/ui';
import type { EstadoTurma, ItemRanking, Rodada as NumeroRodada } from '../../shared/schemas';
import { formatarInteiro, resumoAoVivo, type EventoTelao } from '../derivar';

export interface RodadaProps {
  turma: EstadoTurma;
  rodada: NumeroRodada;
  minuto: number | null;
  itens: ItemRanking[];
  eventos: EventoTelao[];
}

export function Rodada({ turma, rodada, minuto, itens, eventos }: RodadaProps) {
  const lean = rodada === 2;
  const maior = Math.max(1, ...itens.map((i) => i.pontuacao));
  const semPlacar = turma.grupos.filter((g) => !itens.some((i) => i.grupoId === g.id));
  const resumo = resumoAoVivo(itens);

  return (
    <div className="flex h-full flex-col gap-8">
      <div className="grid shrink-0 grid-cols-[600px_1fr] items-center gap-12">
        <ModoDoPlantao lean={lean} />
        <ClockBar minuto={minuto ?? 420} tema="escuro" grande pausado={turma.pausada} rotulo="Hora do plantão" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_600px] gap-12">
        <section aria-labelledby="telao-ranking" className="flex min-h-0 flex-col">
          <h2 id="telao-ranking" className="mb-5 text-4xl font-bold">Ranking ao vivo</h2>
          {itens.length === 0 && semPlacar.length === 0 ? (
            <p className="text-3xl text-white/80">O ranking aparece assim que os grupos enviarem o primeiro placar.</p>
          ) : (
            <ol className="flex min-h-0 flex-col gap-3">
              {itens.map((g, i) => (
                <li key={g.grupoId} className="grid grid-cols-[60px_330px_1fr_190px] items-center gap-6">
                  <span
                    className={cx(
                      'grid size-[60px] place-items-center rounded-full font-space-mono text-3xl font-bold',
                      i === 0 ? 'bg-amarelo text-marinho-profundo' : 'bg-white/12',
                    )}
                  >
                    {i + 1}
                  </span>
                  <TeamAvatar nome={g.nome} cor={g.cor} tamanho="g" comNome tema="escuro" className="text-[32px]" />
                  <span aria-hidden="true" className="h-7 overflow-hidden rounded-pilula bg-white/10">
                    <span
                      className="telao-barra block h-full rounded-pilula"
                      style={{ width: `${Math.max(2, (g.pontuacao / maior) * 100)}%`, background: g.cor }}
                    />
                  </span>
                  <span className="text-right font-space-mono text-5xl font-bold tabular-nums">{formatarInteiro(g.pontuacao)}</span>
                </li>
              ))}
              {semPlacar.map((g) => (
                <li key={g.id} className="grid grid-cols-[60px_330px_1fr_190px] items-center gap-6 opacity-60">
                  <span className="grid size-[60px] place-items-center rounded-full bg-white/8 font-space-mono text-3xl">–</span>
                  <TeamAvatar nome={g.nome} cor={g.cor} tamanho="g" comNome tema="escuro" className="text-[32px]" />
                  <span className="text-2xl text-white/80">Aguardando o primeiro placar</span>
                  <span />
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <Numero rotulo="Óbitos" valor={resumo.obitos} />
            <Numero rotulo="Em boarding agora" valor={resumo.boardingAgora} />
            {lean ? <Numero rotulo="Ações automáticas" valor={resumo.automatico} /> : <Numero rotulo="Altas" valor={resumo.altas} />}
          </div>

          <section aria-labelledby="telao-eventos" className="flex min-h-0 flex-1 flex-col rounded-cartao-g bg-white/8 p-7 ring-1 ring-white/15">
            <h2 id="telao-eventos" className="mb-5 flex items-center gap-3 text-3xl font-bold">
              <Icone nome="raio" tamanho={30} className="text-amarelo" />
              Agora no plantão
            </h2>
            {eventos.length === 0 ? (
              <p className="text-2xl leading-snug text-white/80">
                {lean ? 'Fluxo estável. Os eventos marcantes aparecem aqui.' : 'Os eventos marcantes aparecem aqui.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-5 overflow-hidden">
                {eventos.map((e) => (
                  <li key={e.id} className="telao-entrar-evento flex items-start gap-4">
                    <span className="pt-0.5 font-space-mono text-2xl font-bold text-amarelo tabular-nums">{horaDoPlantao(e.minuto)}</span>
                    <span aria-hidden="true" className="mt-2 size-5 shrink-0 rounded-full ring-2 ring-white/30" style={{ background: e.cor }} />
                    <span className="text-[26px] leading-snug">
                      <strong className="font-bold">{e.nome}:</strong>{' '}
                      <span className={e.problema ? 'text-white' : 'text-verde'}>{e.texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ModoDoPlantao({ lean }: { lean: boolean }) {
  return (
    <div
      className={cx(
        'flex items-center gap-6 rounded-cartao-g px-8 py-6 ring-2',
        lean ? 'bg-verde/15 ring-verde' : 'bg-amarelo/12 ring-amarelo',
      )}
    >
      <span
        className={cx(
          'grid size-20 shrink-0 place-items-center rounded-2xl',
          lean ? 'bg-verde text-marinho-profundo' : 'bg-amarelo text-marinho-profundo',
        )}
      >
        <Icone nome={lean ? 'setaDireita' : 'cadeado'} tamanho={44} strokeWidth={2.4} />
      </span>
      <div>
        <p className="text-5xl leading-tight font-bold">{lean ? 'Plantão Lean' : 'Plantão Travado'}</p>
        <p className="mt-1 text-2xl text-white/85">{lean ? 'O sistema puxa o fluxo.' : 'Cada decisão depende do gestor.'}</p>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-cartao bg-white/10 px-5 py-4 ring-1 ring-white/15">
      <p className="font-space-mono text-6xl leading-none font-bold tabular-nums">{formatarInteiro(valor)}</p>
      <p className="mt-2 text-xl leading-tight text-white/85">{rotulo}</p>
    </div>
  );
}
