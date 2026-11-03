import { Card, cx, Icone, TeamAvatar } from '../../shared/components/ui';
import { BONUS_SEM_OBITO, PONTUACAO, PONTUACAO_INICIAL, PONTUACAO_MINIMA, REGRAS } from '../regras';
import {
  dataPorExtenso,
  formatarNumero,
  METRICAS_GRUPO,
  type ChaveMetrica,
  type DefMetrica,
  type GrupoVista,
  type RelatorioVista,
  type Resultado,
} from '../transformar';
import { Logos, Secao, valorMetrica, Variacao } from './Base';
import { COR_R1, COR_R2, GraficoBarras, GraficoLinhas } from './Graficos';

function valorDe(r: Resultado | null, chave: DefMetrica['chave']): number | undefined {
  if (!r) return undefined;
  return chave === 'pontuacao' ? r.pontuacao : r.metricas[chave];
}

// ── Capa ────────────────────────────────────────────────────

export function Capa({ vista }: { vista: RelatorioVista }) {
  const data = dataPorExtenso(vista.turma.data);
  const linhas: [string, string][] = [];
  if (vista.turma.evento) linhas.push(['Evento', vista.turma.evento]);
  if (data) linhas.push(['Data', data]);
  if (vista.facilitador) linhas.push(['Facilitador', vista.facilitador]);
  linhas.push(['Local', vista.local]);
  linhas.push(['Grupos', String(vista.grupos.length)]);
  if (vista.turma.codigo) linhas.push(['Código da sala', vista.turma.codigo]);

  return (
    <header className="capa relative isolate overflow-hidden bg-marinho-profundo text-white">
      <img src="/img/rio/windsor-barra.jpg" alt="" aria-hidden="true" className="absolute inset-0 -z-20 size-full object-cover object-[50%_30%]" />
      {/* Véu do degradê oficial sobre a foto, como no site */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(14,24,64,0.97)_0%,rgba(27,42,107,0.9)_55%,rgba(31,51,128,0.72)_100%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 -z-10 size-96 rounded-full bg-amarelo/15 blur-3xl" />
      <div className="capa__miolo mx-auto flex max-w-[1040px] flex-col gap-10 px-4 pt-10 pb-14 sm:px-8 sm:pt-12 sm:pb-20">
        <Logos />
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-3 font-space-mono text-rotulo font-bold uppercase tracking-[0.2em] text-amarelo">
            <span aria-hidden="true" className="inline-block h-0.5 w-8 bg-amarelo" />
            Relatório da turma
          </p>
          <h1 className="font-sora text-[2.5rem] leading-[1.05] font-bold tracking-tight sm:text-titulo-g">
            Simulador do <span className="text-amarelo">Fluxo</span>
          </h1>
          <p className="max-w-2xl text-lg font-light text-white/90 sm:text-xl">{vista.turma.nome}</p>
        </div>
        <dl className="grid max-w-3xl grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {linhas.map(([k, v]) => (
            <div key={k} className="border-l-2 border-amarelo/70 pl-4">
              <dt className="font-space-mono text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-white/65">{k}</dt>
              <dd className="mt-0.5 text-base font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-white/70">Plantão Travado × Plantão Lean</p>
      </div>
    </header>
  );
}

// ── Regras ──────────────────────────────────────────────────

export function SecaoRegras({ numero }: { numero: number }) {
  return (
    <Secao
      id="regras"
      numero={numero}
      rotulo="Como o jogo funciona"
      titulo="Regras do jogo"
      intro="Resumo das regras em vigor nesta turma, para quem não estava na sala ou quer rever a dinâmica."
    >
      <div className="impressao-2col grid gap-4 md:grid-cols-2">
        {REGRAS.map(b => (
          <Card key={b.titulo} as="article" className="sem-quebra" titulo={b.titulo}>
            <div className="flex flex-col gap-2.5 text-[0.9062rem] leading-relaxed">
              {b.paragrafos.map(p => (
                <p key={p.slice(0, 32)}>{p}</p>
              ))}
            </div>
          </Card>
        ))}
        <Card as="article" className="sem-quebra impressao-inteira md:col-span-2" titulo="Pontuação">
          <p className="mb-4 text-[0.9062rem] leading-relaxed">
            Cada grupo começa com {formatarNumero(PONTUACAO_INICIAL)} pontos e perde ou ganha conforme o que acontece no plantão.
            Quem termina sem nenhum óbito ganha {formatarNumero(BONUS_SEM_OBITO)} pontos de bônus. A pontuação nunca fica abaixo de{' '}
            {PONTUACAO_MINIMA}. A mesma fórmula vale nas duas rodadas.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PONTUACAO.map(p => (
              <li key={p.campo} className="flex items-center justify-between gap-3 rounded-chip bg-fundo-app px-3 py-2 text-sm">
                <span>{p.item}</span>
                <span className={cx('font-space-mono font-bold tabular-nums', p.pontos > 0 ? 'text-verde-texto' : 'text-negativo-texto')}>
                  {p.pontos > 0 ? '+' : '−'}
                  {Math.abs(p.pontos)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Secao>
  );
}

// ── Ranking e pódio ─────────────────────────────────────────

const DEGRAUS = [
  { altura: 'h-28', medalha: 'bg-amarelo text-marinho-profundo', rotulo: '1º lugar' },
  { altura: 'h-20', medalha: 'bg-[#D7DBE8] text-marinho-profundo', rotulo: '2º lugar' },
  { altura: 'h-14', medalha: 'bg-[#E9C9A6] text-marinho-profundo', rotulo: '3º lugar' },
];

function Podio({ grupos }: { grupos: GrupoVista[] }) {
  const top = grupos.slice(0, 3);
  // Ordem visual: 2º, 1º, 3º
  const ordem = [top[1], top[0], top[2]].map((g, i) => ({ g, pos: [1, 0, 2][i]! })).filter(x => x.g);
  return (
    <ol className="sem-quebra mx-auto grid max-w-2xl grid-cols-3 items-end gap-3" aria-label="Pódio">
      {ordem.map(({ g, pos }) => {
        const d = DEGRAUS[pos]!;
        return (
          <li key={g!.id} className={cx('flex flex-col items-center gap-2 text-center', pos === 0 && 'order-2', pos === 1 && 'order-1', pos === 2 && 'order-3')}>
            <TeamAvatar nome={g!.nome} cor={g!.cor} tamanho={pos === 0 ? 'g' : 'm'} />
            <p className="max-w-full truncate font-sora text-sm font-bold text-texto sm:text-base">{g!.nome}</p>
            <p className="font-space-mono text-lg font-bold tabular-nums text-texto">
              {formatarNumero(g!.r2?.pontuacao ?? g!.r1?.pontuacao ?? 0)}
              <span className="ml-1 text-xs font-normal text-texto-suave">pts</span>
            </p>
            <div className={cx('grid w-full place-items-center rounded-t-2xl bg-marinho text-white', d.altura)}>
              <span className={cx('grid size-9 place-items-center rounded-full font-space-mono font-bold', d.medalha)}>
                {pos + 1}
              </span>
              <span className="sr-only">{d.rotulo}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function SecaoRanking({ numero, vista }: { numero: number; vista: RelatorioVista }) {
  const { grupos } = vista;
  return (
    <Secao
      id="ranking"
      numero={numero}
      rotulo="Resultado"
      titulo="Ranking final e pódio"
      intro="O ranking final premia a evolução: quanto cada grupo melhorou do Plantão Travado para o Plantão Lean. Em caso de empate, vale a pontuação do Plantão Lean."
    >
      {grupos.length === 0 ? (
        <p className="text-texto-suave">Nenhum grupo tem pontuação registrada.</p>
      ) : (
        <div className="flex flex-col gap-8">
          <Podio grupos={grupos} />
          <div className="sem-quebra relative overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-y-1.5 text-left">
              <caption className="sr-only">Ranking final com a pontuação de cada rodada</caption>
              <thead>
                <tr className="font-space-mono text-rotulo font-bold uppercase tracking-[0.14em] text-texto-suave">
                  <th scope="col" className="w-12 px-3 py-2 text-center">#</th>
                  <th scope="col" className="px-3 py-2">Grupo</th>
                  <th scope="col" className="px-3 py-2 text-right">Travado (R1)</th>
                  <th scope="col" className="px-3 py-2 text-right">Lean (R2)</th>
                  <th scope="col" className="px-3 py-2 text-right">Evolução</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(g => (
                  <tr key={g.id} className="[&>*]:bg-cartao">
                    <td className="rounded-l-2xl border-y border-l border-borda px-3 py-2.5 text-center font-space-mono font-bold text-texto">{g.posicao}</td>
                    <th scope="row" className="border-y border-borda px-3 py-2.5 font-normal">
                      <TeamAvatar nome={g.nome} cor={g.cor} tamanho="p" comNome />
                    </th>
                    <td className="border-y border-borda px-3 py-2.5 text-right font-space-mono tabular-nums text-texto-corpo">
                      {g.r1 ? formatarNumero(g.r1.pontuacao) : '—'}
                    </td>
                    <td className="border-y border-borda px-3 py-2.5 text-right font-space-mono text-lg font-bold tabular-nums text-texto">
                      {g.r2 ? formatarNumero(g.r2.pontuacao) : '—'}
                    </td>
                    <td className="rounded-r-2xl border-y border-r border-borda px-3 py-2.5 text-right font-space-mono text-sm tabular-nums">
                      <Variacao antes={g.r1?.pontuacao} depois={g.r2?.pontuacao} def={{ sentidoBom: 'subir' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Secao>
  );
}

// ── Desempenho por grupo ────────────────────────────────────

function CartaoGrupo({ g }: { g: GrupoVista }) {
  return (
    <Card as="article" className="sem-quebra" espaco="p">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <TeamAvatar nome={g.nome} cor={g.cor} comNome />
        <span className="rounded-pilula bg-fundo-app px-3 py-1 font-space-mono text-xs font-bold text-texto">{g.posicao}º</span>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Desempenho do grupo {g.nome} nas duas rodadas</caption>
        <thead>
          <tr className="font-space-mono text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-texto-suave">
            <th scope="col" className="px-1 pb-1.5 text-left font-bold">Métrica</th>
            <th scope="col" className="px-1 pb-1.5 text-right font-bold">R1</th>
            <th scope="col" className="px-1 pb-1.5 text-right font-bold">R2</th>
            <th scope="col" className="px-1 pb-1.5 text-right font-bold">Variação</th>
          </tr>
        </thead>
        <tbody>
          {METRICAS_GRUPO.map(def => {
            const a = valorDe(g.r1, def.chave);
            const d = valorDe(g.r2, def.chave);
            const destaque = def.chave === 'pontuacao';
            return (
              <tr key={def.chave} className={cx('border-t border-borda', destaque && 'font-bold text-texto')}>
                <th scope="row" className="px-1 py-1.5 text-left font-normal">{def.rotulo}</th>
                <td className="px-1 py-1.5 text-right font-space-mono tabular-nums">{valorMetrica(def, a)}</td>
                <td className="px-1 py-1.5 text-right font-space-mono tabular-nums">{valorMetrica(def, d)}</td>
                <td className="px-1 py-1.5 text-right font-space-mono text-[0.8125rem] tabular-nums">
                  <Variacao antes={a} depois={d} def={def} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function SecaoGrupos({ numero, vista }: { numero: number; vista: RelatorioVista }) {
  const r1 = vista.rodadas[1];
  const r2 = vista.rodadas[2];
  const resumo: DefMetrica[] = METRICAS_GRUPO.filter(m => ['bH', 'det', 'dth', 'cxC', 'lw', 'dis'].includes(m.chave));
  return (
    <Secao
      id="grupos"
      numero={numero}
      rotulo="R1 × R2"
      titulo="Desempenho de cada grupo"
      intro="As mesmas métricas nas duas rodadas. Verde indica melhora; vermelho, piora. A demanda de pacientes foi a mesma nas duas rodadas."
    >
      <p className="mb-2 font-sora text-sm font-bold text-texto">Totais da turma (Travado → Lean)</p>
      <div className="sem-quebra mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {resumo.map(def => {
          const k = def.chave as ChaveMetrica;
          return (
            <div key={k} className="rounded-cartao border border-borda bg-cartao p-4">
              <p className="font-space-mono text-[0.6562rem] font-bold uppercase leading-tight tracking-[0.12em] text-texto-suave">
                {def.rotulo}
              </p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 font-space-mono whitespace-nowrap tabular-nums">
                <span className="text-sm text-texto-suave">{valorMetrica(def, r1.totais[k])}</span>
                <Icone nome="setaDireita" tamanho={12} className="text-texto-suave" />
                <span className="text-lg font-bold text-texto">{valorMetrica(def, r2.totais[k])}</span>
              </p>
              <Variacao antes={r1.totais[k]} depois={r2.totais[k]} def={def} className="mt-1 text-xs" />
            </div>
          );
        })}
      </div>
      <div className="impressao-2col grid gap-4 sm:grid-cols-2">
        {vista.grupos.map(g => (
          <CartaoGrupo key={g.id} g={g} />
        ))}
      </div>
    </Secao>
  );
}

// ── Evolução ao longo do plantão ────────────────────────────

export function SecaoEvolucao({ numero, vista }: { numero: number; vista: RelatorioVista }) {
  return (
    <Secao
      id="evolucao"
      numero={numero}
      rotulo="Hora a hora"
      titulo="Evolução ao longo do plantão"
      intro="Média dos grupos em cada hora simulada. Compare quando o departamento de emergência enche em cada rodada e se ele consegue esvaziar à tarde: no Lean, as altas cedo abrem espaço antes do pico de chegadas."
    >
      {vista.temSeries ? (
        <div className="impressao-2col grid gap-5 lg:grid-cols-2">
          <Card className="sem-quebra">
            <GraficoLinhas
              titulo="Ocupação do departamento de emergência"
              descricao="Pacientes no DE em relação às 15 macas (média da turma)."
              pontos={vista.ocupacaoDe}
              unidade="%"
              referencia={{ valor: 100, rotulo: '15 macas' }}
              minimoEixo={100}
            />
          </Card>
          <Card className="sem-quebra">
            <GraficoLinhas
              titulo="Pacientes em boarding"
              descricao="Pacientes prontos para internar que continuam no DE (média por grupo)."
              pontos={vista.boarding}
              minimoEixo={4}
              casas={1}
            />
          </Card>
        </div>
      ) : (
        <Card>
          <p>Esta turma não tem a série de métricas por horário, por isso os gráficos de evolução não aparecem.</p>
        </Card>
      )}
    </Secao>
  );
}

// ── Carga do gestor ─────────────────────────────────────────

function Comparativo({ rotulo, r1, r2, sentidoBom, casas = 1, sufixo = '' }: { rotulo: string; r1: number | null; r2: number | null; sentidoBom: 'subir' | 'descer' | 'neutro'; casas?: 0 | 1; sufixo?: string }) {
  const f = (v: number | null) => (v === null ? '—' : `${formatarNumero(v, casas)}${sufixo}`);
  return (
    <div className="rounded-cartao border border-borda bg-cartao p-5">
      <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.14em] text-texto-suave">{rotulo}</p>
      <div className="mt-3 flex items-end gap-4">
        <div>
          <p className="text-[0.6875rem] font-semibold" style={{ color: COR_R1 }}>Travado</p>
          <p className="font-space-mono text-xl font-bold tabular-nums text-texto-corpo">{f(r1)}</p>
        </div>
        <Icone nome="setaDireita" tamanho={16} className="mb-2 text-texto-suave" />
        <div>
          <p className="text-[0.6875rem] font-semibold" style={{ color: COR_R2 }}>Lean</p>
          <p className="font-space-mono text-titulo-s font-bold tabular-nums text-texto">{f(r2)}</p>
        </div>
      </div>
      <Variacao
        antes={r1 ?? undefined}
        depois={r2 ?? undefined}
        def={{ sentidoBom }}
        casas={casas}
        sufixo={sufixo === '%' ? ' p.p.' : ''}
        className="mt-1 text-sm"
      />
    </div>
  );
}

export function SecaoCarga({ numero, vista }: { numero: number; vista: RelatorioVista }) {
  const r1 = vista.rodadas[1];
  const r2 = vista.rodadas[2];
  const pct = (v: number | null) => (v === null ? null : v * 100);
  const auto: { rotulo: string; valor: number | undefined; nota: string }[] = [
    { rotulo: 'Altas do Fluxista', valor: r2.totais.autoFluxista, nota: 'altas do DE feitas sozinhas' },
    { rotulo: 'Discharge Lounge', valor: r2.totais.autoDischargeLounge, nota: 'leitos liberados na hora' },
    { rotulo: 'Fast Track', valor: r2.totais.autoFastTrack, nota: 'pacientes verdes atendidos' },
    { rotulo: 'Cirurgias viabilizadas', valor: r2.totais.autoCirurgiasViabilizadas, nota: 'pela alta pronta no leito de destino' },
  ];
  return (
    <Secao
      id="carga"
      numero={numero}
      quebraAntes={false}
      rotulo="Menos sobrecarga"
      titulo="Carga do gestor"
      intro="Além do resultado clínico, o jogo mede o esforço de quem coordena: quantas decisões o grupo tomou, quantas foram para apagar incêndio (reativas) e quantas para puxar o fluxo (produtivas), e quantos alertas e crises apareceram."
    >
      <div className="flex flex-col gap-6">
        <div className="sem-quebra grid gap-4 sm:grid-cols-3">
          <Comparativo rotulo="Decisões por hora" r1={r1.decisoesPorHora} r2={r2.decisoesPorHora} sentidoBom="neutro" />
          <Comparativo rotulo="Decisões reativas" r1={pct(r1.fracaoReativas)} r2={pct(r2.fracaoReativas)} sentidoBom="descer" casas={0} sufixo="%" />
          <Comparativo rotulo="Alertas por hora" r1={r1.alertasPorHora} r2={r2.alertasPorHora} sentidoBom="descer" />
        </div>
        <p className="-mt-2 text-xs text-texto-suave">Médias por grupo. Mais decisões não é, por si só, pior: o que pesa é a parte reativa. Alertas: deteriorações, óbitos, cancelamentos, DE lotado, idas ao corredor e saídas sem atendimento.</p>

        {vista.alertasPorHora.length > 0 && (
          <Card className="sem-quebra">
            <GraficoBarras
              titulo="Alertas e crises por hora"
              descricao="Quantas vezes, em média, cada grupo precisou reagir a um problema em cada hora do plantão."
              pontos={vista.alertasPorHora}
            />
          </Card>
        )}

        <div className="sem-quebra">
          <h3 className="mb-3 font-sora text-lg font-bold text-texto">O que as ferramentas automáticas fizeram no Lean</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {auto.map(a => (
              <div key={a.rotulo} className="rounded-cartao bg-setor-enf p-4">
                <p className="font-space-mono text-titulo-s font-bold tabular-nums text-texto">{a.valor === undefined ? '—' : formatarNumero(a.valor)}</p>
                <p className="mt-1 text-sm font-bold text-texto">{a.rotulo}</p>
                <p className="text-xs text-texto-corpo">{a.nota}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-texto-suave">Totais da turma na rodada 2. É trabalho que, no Travado, dependia de alguém lembrar e clicar.</p>
        </div>

        <div className="sem-quebra relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="mb-2 text-left font-sora text-lg font-bold text-texto">Por grupo</caption>
            <thead>
              <tr className="font-space-mono text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-texto-suave">
                <th scope="col" className="px-2 py-2 text-left font-bold">Grupo</th>
                <th scope="col" className="px-2 py-2 text-right font-bold">Decisões R1</th>
                <th scope="col" className="px-2 py-2 text-right font-bold">Decisões R2</th>
                <th scope="col" className="px-2 py-2 text-right font-bold">Reativas R1</th>
                <th scope="col" className="px-2 py-2 text-right font-bold">Reativas R2</th>
                <th scope="col" className="px-2 py-2 text-right font-bold">Alertas R1</th>
                <th scope="col" className="px-2 py-2 text-right font-bold">Alertas R2</th>
              </tr>
            </thead>
            <tbody>
              {vista.grupos.map(g => {
                const c = (r: Resultado | null, k: ChaveMetrica) => valorMetrica({}, r?.metricas[k]);
                return (
                  <tr key={g.id} className="border-t border-borda">
                    <th scope="row" className="px-2 py-2 text-left font-normal"><TeamAvatar nome={g.nome} cor={g.cor} tamanho="p" comNome /></th>
                    <td className="px-2 py-2 text-right font-space-mono tabular-nums">{c(g.r1, 'decisoes')}</td>
                    <td className="px-2 py-2 text-right font-space-mono tabular-nums">{c(g.r2, 'decisoes')}</td>
                    <td className="px-2 py-2 text-right font-space-mono tabular-nums">{c(g.r1, 'decisoesReativas')}</td>
                    <td className="px-2 py-2 text-right font-space-mono tabular-nums">{c(g.r2, 'decisoesReativas')}</td>
                    <td className="px-2 py-2 text-right font-space-mono tabular-nums">{c(g.r1, 'alertas')}</td>
                    <td className="px-2 py-2 text-right font-space-mono tabular-nums">{c(g.r2, 'alertas')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Secao>
  );
}

// ── Mensagens-chave ─────────────────────────────────────────

export function SecaoMensagens({ numero, vista }: { numero: number; vista: RelatorioVista }) {
  return (
    <Secao id="mensagens" numero={numero} rotulo="Debrief" titulo="Mensagens-chave para o debrief" intro="O que mudou do Plantão Travado para o Plantão Lean nesta turma.">
      <ol className="flex flex-col gap-3">
        {vista.mensagens.map((m, i) => (
          <li key={m.slice(0, 40)} className="sem-quebra flex gap-4 rounded-cartao border border-borda border-l-4 border-l-amarelo bg-cartao p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-marinho font-space-mono text-sm font-bold text-amarelo">{i + 1}</span>
            <p className="pt-1 text-[0.9375rem] leading-relaxed text-texto">{m}</p>
          </li>
        ))}
      </ol>
      <div className="sem-quebra mt-6 rounded-cartao-g bg-degrade-cbmede p-6 text-white">
        <p className="font-sora text-xl font-bold">No Lean, o sistema faz o trabalho repetitivo, o gestor decide menos e melhor, e a operação funciona.</p>
      </div>
    </Secao>
  );
}

export { Logos };
