import type { ReactNode } from 'react';
import { Button, DarkCallout, Icone } from '../../shared/components/ui';
import type { AcaoAula, ProximaAcao } from '../logica/fases';

interface ChamadaAulaProps {
  proxima: ProximaAcao;
  onAcao: (acao: AcaoAula) => void;
  ocupado?: boolean;
  desabilitado?: boolean;
  /** Linha extra dentro do botão (ex.: "6 grupos prontos"). */
  detalheBotao?: string;
  /** Conteúdo abaixo do texto (ex.: link do relatório). */
  children?: ReactNode;
  className?: string;
}

/** Cartão escuro com a próxima ação da aula (um por tela); o botão é o único verde. */
export function ChamadaAula({
  proxima,
  onAcao,
  ocupado,
  desabilitado,
  detalheBotao,
  children,
  className,
}: ChamadaAulaProps) {
  const { acao } = proxima;
  return (
    <DarkCallout
      rotulo="Próxima ação da aula"
      titulo={proxima.titulo}
      icone={<Icone nome={acao === 'retomar' ? 'play' : acao === 'encerrar' ? 'relogio' : 'setaDireita'} />}
      aoVivo
      className={className}
      acoes={
        acao ? (
          <Button
            variante="verde"
            tamanho="g"
            larguraTotal
            carregando={ocupado}
            disabled={desabilitado}
            onClick={() => onAcao(acao)}
          >
            {detalheBotao ? (
              <span className="flex flex-col items-center leading-tight">
                <span>{proxima.rotuloAcao}</span>
                <span className="font-space-mono text-xs font-bold tracking-wide">{detalheBotao}</span>
              </span>
            ) : (
              proxima.rotuloAcao
            )}
          </Button>
        ) : undefined
      }
    >
      <p>{proxima.texto}</p>
      {children}
    </DarkCallout>
  );
}
