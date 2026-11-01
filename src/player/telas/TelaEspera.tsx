// J2: sala de espera. Mostra os grupos que já entraram enquanto o facilitador não inicia.

import { Card, DarkCallout, Icone, TeamAvatar, type Conexao } from '../../shared/components/ui';
import type { EstadoTurma } from '../../shared/schemas';
import { Moldura } from './Moldura';

interface TelaEsperaProps {
  turma: EstadoTurma;
  grupoId: string;
  conexao: Conexao;
}

const COMO_JOGAR = [
  'Clique no paciente para ver os destinos possíveis; clique no destino para mover.',
  'Paciente pronto que fica no DE esperando leito está em boarding: com o tempo, deteriora.',
  'Libere altas cedo, tire o pós-operatório da RPA e use o NIR para transferir quem o hospital não atende.',
  'Cada rodada vai das 7h às 19h em 12 minutos reais.',
];

export function TelaEspera({ turma, grupoId, conexao }: TelaEsperaProps) {
  const grupos = turma.grupos;
  return (
    <Moldura rotulo={`Sala ${turma.codigo}`} conexao={conexao}>
      <DarkCallout rotulo="Sala de espera" titulo="Aguardando o facilitador iniciar o Plantão Travado" icone={<Icone nome="relogio" tamanho={22} />} aoVivo>
        Vocês já estão na sala. O jogo começa sozinho, neste computador, quando o facilitador der a largada. Clique em qualquer lugar da tela para ligar o som.
      </DarkCallout>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card rotulo={`${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'} na sala`} titulo="Quem já entrou">
          <ul className="flex flex-col gap-3">
            {grupos.map(g => (
              <li key={g.id} className="flex items-center justify-between gap-3">
                <TeamAvatar nome={g.nome} cor={g.cor} conectado={g.conectado} comNome />
                {g.id === grupoId && (
                  <span className="rounded-pilula bg-amarelo px-3 py-1 text-xs font-bold text-marinho-profundo">Você</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card rotulo="Enquanto espera" titulo="Como jogar">
          <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-[15px] leading-relaxed">
            {COMO_JOGAR.map(t => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </Card>
      </div>
    </Moldura>
  );
}
