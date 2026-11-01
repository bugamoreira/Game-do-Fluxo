// F1 — Sala: grupos conectados, entrada e início do Plantão Travado.

import { Button, Card, Icone, TeamAvatar, cx } from '../../shared/components/ui';
import { ChamadaAula } from '../componentes/ChamadaAula';
import { CodigoAcesso } from '../componentes/CodigoAcesso';
import { contarProntos, linkJogo, rotuloProntos, textoPresenca, type GrupoPainel } from '../logica/fases';
import { plural } from '../logica/formato';
import { chaveAcao, type AcaoPainel, type PropsTela } from '../tipos';

export function Sala({ turma, grupos, proxima, ocupado, acionar, origem }: PropsTela) {
  const { conectados, total } = contarProntos(grupos);
  const ativos = grupos.filter((g) => !g.removido);
  const removidos = grupos.filter((g) => g.removido);
  const aberta = turma.status === 'aberta';
  const encerrada = turma.status === 'encerrada' || turma.status === 'arquivada';

  return (
    <div className="grid min-h-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card
        grande
        rotulo={`${plural(total, 'grupo', 'grupos')} na sala`}
        titulo="Grupos conectados"
        extra={
          <span className="rounded-pilula bg-fundo-app px-3 py-1.5 font-space-mono text-sm font-bold text-texto">
            {rotuloProntos(conectados, total)}
          </span>
        }
      >
        {ativos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-fundo-app px-6 py-12 text-center">
            <span
              aria-hidden="true"
              className="grid size-14 place-items-center rounded-full bg-cartao text-marinho shadow-cartao"
            >
              <Icone nome="ampulheta" tamanho={26} />
            </span>
            <p className="text-lg font-bold text-texto">Aguardando os grupos</p>
            <p className="max-w-md text-[15px]">
              Os grupos aparecem aqui assim que entrarem com o nome do grupo e o código de acesso
              {turma.codigoAcesso ? (
                <>
                  {' '}
                  <strong className="font-space-mono">{turma.codigoAcesso}</strong>
                </>
              ) : null}
              .
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {ativos.map((g) => (
              <LinhaGrupo key={g.id} grupo={g} ocupado={ocupado} acionar={acionar} />
            ))}
          </ul>
        )}

        {removidos.length > 0 && (
          <>
            <h4 className="mt-6 mb-2 font-space-mono text-rotulo font-bold uppercase tracking-[0.16em] text-texto-suave">
              Removidos
            </h4>
            <ul className="flex flex-col gap-2">
              {removidos.map((g) => (
                <LinhaGrupo key={g.id} grupo={g} ocupado={ocupado} acionar={acionar} />
              ))}
            </ul>
          </>
        )}

        <p className="mt-5 flex items-start gap-2 text-sm text-texto-suave">
          <Icone nome="info" tamanho={16} className="mt-0.5 shrink-0" />
          <span>
            <strong className="text-texto">Liberar reconexão</strong> serve para o grupo que trocou de computador ou
            perdeu a sessão: o próximo computador que entrar com o mesmo nome e o código de acesso reassume o grupo.{' '}
            <strong className="text-texto">Remover</strong> tira o grupo do ranking sem apagar os dados.
          </span>
        </p>
      </Card>

      <div className="flex flex-col gap-6">
        <ChamadaAula
          proxima={proxima}
          onAcao={(tipo) => acionar({ tipo })}
          ocupado={ocupado === proxima.acao}
          desabilitado={proxima.acao === 'iniciarR1' && total === 0}
          detalheBotao={proxima.acao === 'iniciarR1' ? rotuloProntos(conectados, total) : undefined}
        />

        {!encerrada && <CodigoAcesso codigo={turma.codigoAcesso} />}

        <Card rotulo="Como os grupos entram" titulo="Código da sala">
          <p className="font-space-mono text-titulo-m font-bold tracking-[0.12em] text-texto">{turma.codigo}</p>
          <p className="mt-2 text-[15px]">
            Endereço do jogo:{' '}
            <strong className="break-all text-texto">{linkJogo(origem).replace(/^https?:\/\//, '')}</strong>
          </p>
          <div className="mt-5 border-t border-borda pt-5">
            {encerrada ? (
              <p className="text-sm">A turma foi encerrada: ninguém mais entra nem reconecta.</p>
            ) : aberta ? (
              <p className="flex items-start gap-2 text-sm">
                <Icone nome="check" tamanho={16} className="mt-0.5 shrink-0 text-verde-texto" strokeWidth={3} />
                Entrada aberta até o início do Plantão Travado. Depois disso, só reconexão de grupos que já estão na
                sala.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm">
                  {turma.entradaLiberada
                    ? 'Entrada liberada: um grupo novo pode entrar agora e joga a partir do horário da sala.'
                    : 'O jogo já começou e a entrada de grupos novos está fechada. Libere só para um grupo atrasado.'}
                </p>
                <Button
                  variante={turma.entradaLiberada ? 'contorno' : 'marinho'}
                  tamanho="p"
                  icone={<Icone nome={turma.entradaLiberada ? 'cadeado' : 'pessoa'} tamanho={16} />}
                  carregando={ocupado === 'entrada'}
                  onClick={() => acionar({ tipo: 'entrada' })}
                >
                  {turma.entradaLiberada ? 'Fechar entrada' : 'Liberar entrada'}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function LinhaGrupo({
  grupo,
  ocupado,
  acionar,
}: {
  grupo: GrupoPainel;
  ocupado: string | null;
  acionar: (a: AcaoPainel) => void;
}) {
  const reconexao: AcaoPainel = { tipo: 'reconexao', grupo };
  const remover: AcaoPainel = { tipo: 'remover', grupo };
  return (
    <li
      className={cx(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3',
        grupo.removido ? 'bg-fundo-app/60 opacity-70' : 'bg-fundo-app',
      )}
    >
      <TeamAvatar nome={grupo.nome} cor={grupo.cor} conectado={grupo.removido ? undefined : grupo.conectado} />
      <div className="min-w-0 flex-1">
        <p className={cx('truncate font-semibold text-texto', grupo.removido && 'line-through')}>{grupo.nome}</p>
        <p className="flex items-center gap-1.5 text-sm text-texto-suave">
          {!grupo.removido && (
            <span
              aria-hidden="true"
              className={cx(
                'inline-block size-2 rounded-full',
                grupo.conectado ? 'bg-verde' : 'border-2 border-texto-suave',
              )}
            />
          )}
          {textoPresenca(grupo)}
          {grupo.reconexaoLiberada && (
            <span className="ml-1 rounded-pilula bg-amarelo-suave px-2 py-0.5 text-xs font-bold text-marinho-profundo">
              Reconexão liberada
            </span>
          )}
        </p>
      </div>
      {!grupo.removido && (
        <div className="flex gap-1">
          <Button
            variante="fantasma"
            tamanho="p"
            icone={<Icone nome="recarregar" tamanho={16} />}
            carregando={ocupado === chaveAcao(reconexao)}
            onClick={() => acionar(reconexao)}
          >
            {grupo.reconexaoLiberada ? 'Revogar reconexão' : 'Liberar reconexão'}
          </Button>
          <Button
            variante="fantasma"
            tamanho="p"
            icone={<Icone nome="fechar" tamanho={16} />}
            carregando={ocupado === chaveAcao(remover)}
            onClick={() => acionar(remover)}
            aria-label={`Remover o grupo ${grupo.nome}`}
          >
            Remover
          </Button>
        </div>
      )}
    </li>
  );
}
