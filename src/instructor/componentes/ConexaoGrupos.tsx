// Presença dos grupos durante a rodada (tela Ao vivo): o mesmo indicador da
// Sala, compacto, para o facilitador ver quem está sem sinal sem trocar de tela.

import { Card, TeamAvatar, cx } from '../../shared/components/ui';
import { contarProntos, gruposAtivos, rotuloConexao, textoConexao, type GrupoPainel } from '../logica/fases';

export function ConexaoGrupos({ grupos }: { grupos: GrupoPainel[] }) {
  const ativos = gruposAtivos(grupos);
  const { desconectados } = contarProntos(grupos);
  return (
    <Card titulo="Conexão dos grupos" rotulo={rotuloConexao(grupos)} espaco="m">
      {ativos.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum grupo na sala.</p>
      ) : (
        <ul aria-label="Conexão dos grupos" className="flex flex-col gap-2">
          {ativos.map((g) => (
            <li key={g.id} className="flex items-center gap-3">
              <TeamAvatar nome={g.nome} cor={g.cor} conectado={g.conectado} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-texto">{g.nome}</span>
              <span
                className={cx(
                  'flex shrink-0 items-center gap-1.5 text-xs',
                  g.conectado ? 'text-texto-suave' : 'font-bold text-negativo-texto',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx('inline-block size-2 rounded-full', g.conectado ? 'bg-verde' : 'border-2 border-current')}
                />
                {textoConexao(g)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {desconectados.length > 0 && (
        <p className="mt-3 text-xs text-texto-suave">Grupo sem sinal continua de onde parou quando a conexão voltar.</p>
      )}
    </Card>
  );
}
