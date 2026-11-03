import { ClockBar, Icone, TeamAvatar, horaDoPlantao } from '../shared/components/ui';
import { LOG, MINUTO_AGORA, RANKING } from './dados';

/** Telão P2 (tema escuro, densidade baixa, legível do fundo do auditório). */
export function MockTelao() {
  const ordenados = [...RANKING].sort((a, b) => b.pontuacao - a.pontuacao);
  const maior = ordenados[0]?.pontuacao ?? 1;
  const marcantes = LOG.filter(e => e.type !== 'info' && e.type !== 'fact').slice(0, 3);

  return (
    <div className="relative isolate flex min-h-[900px] flex-col gap-10 overflow-hidden bg-marinho-profundo px-14 py-10 font-sora text-white">
      <img
        src="/img/rio/rio-pao-de-acucar-panorama.jpg"
        alt=""
        className="absolute inset-0 -z-20 h-full w-full object-cover opacity-60"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-degrade-cbmede opacity-[0.88]" />

      <header className="flex items-center justify-between">
        <div>
          <p className="font-space-mono text-base font-bold uppercase tracking-[0.22em] text-amarelo">— Plantão Travado · Rodada 1</p>
          <h1 className="text-titulo-g font-bold">
            Simulador do <span className="text-amarelo">Fluxo</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <img src="/img/brand/edleaders-escuro.png" alt="ED Leaders" className="h-9 mix-blend-screen" />
          <img src="/img/brand/abramede.png" alt="ABRAMEDE" className="h-14 rounded-lg" />
        </div>
      </header>

      <ClockBar minuto={MINUTO_AGORA} tema="escuro" grande rotulo="Hora do plantão" />

      <div className="grid flex-1 grid-cols-[1fr_440px] gap-10">
        <section aria-labelledby="telao-ranking">
          <h2 id="telao-ranking" className="mb-5 text-3xl font-bold">Ranking ao vivo</h2>
          <ol className="flex flex-col gap-4">
            {ordenados.map((g, i) => (
              <li key={g.grupoId} className="grid grid-cols-[56px_300px_1fr_120px] items-center gap-5">
                <span
                  className={`grid size-14 place-items-center rounded-full font-space-mono text-2xl font-bold ${
                    i === 0 ? 'bg-amarelo text-marinho-profundo' : 'bg-white/10'
                  }`}
                >
                  {i + 1}
                </span>
                <TeamAvatar nome={g.nome} cor={g.cor} tamanho="g" comNome tema="escuro" className="text-2xl" />
                <span aria-hidden="true" className="h-5 overflow-hidden rounded-pilula bg-white/10">
                  <span className="block h-full rounded-pilula" style={{ width: `${(g.pontuacao / maior) * 100}%`, background: g.cor }} />
                </span>
                <span className="text-right font-space-mono text-4xl font-bold tabular-nums">{g.pontuacao}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="telao-eventos" className="rounded-cartao-g bg-white/8 p-7 ring-1 ring-white/15">
          <h2 id="telao-eventos" className="mb-5 flex items-center gap-3 text-3xl font-bold">
            <Icone nome="raio" tamanho={28} className="text-amarelo" />
            Agora no plantão
          </h2>
          <ul className="flex flex-col gap-5">
            {marcantes.map(e => (
              <li key={e.t} className="flex gap-4">
                <span className="pt-1 font-space-mono text-xl font-bold text-amarelo tabular-nums">{horaDoPlantao(e.t)}</span>
                <span className="text-xl leading-snug">{e.msg}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="flex items-center justify-between font-space-mono text-lg text-white/75">
        <span>plantaocbmede.netlify.app</span>
        <span>CBMEDE 2026 · Windsor Barra · Rio de Janeiro</span>
      </footer>
    </div>
  );
}
