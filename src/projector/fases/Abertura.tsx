// P1 — sala aberta: endereço e código de acesso grandes, instrução curta e grupos que já entraram.
// O código só aparece com a sessão do facilitador (telão aberto pela janela dele).

import { TeamAvatar } from '../../shared/components/ui';
import type { EstadoTurma } from '../../shared/schemas';
import { ENDERECO_JOGO, SALA_PADRAO, plural } from '../derivar';

const PASSOS = [
  'Abra o endereço no computador do grupo.',
  'Clique em “Entrar no jogo”.',
  'Digite o nome do grupo e o código de acesso.',
];

export function Abertura({ turma, sala, codigoAcesso }: { turma: EstadoTurma; sala: string; codigoAcesso: string | null }) {
  const grupos = turma.grupos;
  return (
    <div className="flex h-full flex-col">
      <section className="text-center">
        <p className="font-space-mono text-3xl font-bold tracking-[0.18em] text-white/80 uppercase">Entre no jogo pelo endereço</p>
        <p className="mt-4 font-space-mono text-[104px] leading-none font-bold tracking-tight text-amarelo">{ENDERECO_JOGO}</p>
        <p className="mt-8 font-space-mono text-3xl font-bold tracking-[0.18em] text-white/80 uppercase">Código de acesso</p>
        {codigoAcesso ? (
          <p className="mt-3 font-space-mono text-[120px] leading-none font-bold tracking-[0.3em] text-amarelo">{codigoAcesso}</p>
        ) : (
          <p className="mt-3 text-5xl font-semibold">Peça o código ao facilitador.</p>
        )}
        {sala !== SALA_PADRAO && (
          <p className="mt-6 text-4xl">
            Código da sala: <strong className="font-space-mono text-amarelo">{sala}</strong>
          </p>
        )}
      </section>

      <ol className="mt-12 grid grid-cols-3 gap-8">
        {PASSOS.map((p, i) => (
          <li key={p} className="flex items-center gap-6 rounded-cartao-g bg-white/10 px-8 py-7 ring-1 ring-white/15">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-amarelo font-space-mono text-3xl font-bold text-marinho-profundo">
              {i + 1}
            </span>
            <span className="text-3xl leading-snug font-semibold">{p}</span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="telao-grupos" className="mt-12 flex min-h-0 flex-1 flex-col">
        <h2 id="telao-grupos" className="flex items-center gap-4 text-4xl font-bold">
          <span aria-hidden="true" className="telao-pulsar size-5 rounded-full bg-verde" />
          {grupos.length === 0 ? 'Aguardando os primeiros grupos…' : `${plural(grupos.length, 'grupo', 'grupos')} na sala`}
        </h2>
        {grupos.length > 0 && (
          <ul className="mt-7 flex flex-wrap gap-5">
            {grupos.map((g) => (
              <li key={g.id} className="telao-surgir rounded-pilula bg-white/10 py-3 pr-8 pl-3 ring-1 ring-white/15">
                <TeamAvatar nome={g.nome} cor={g.cor} tamanho="g" comNome tema="escuro" className="text-3xl" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
