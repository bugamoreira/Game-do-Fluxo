// Tela simples de espera ou bloqueio (conectando, jogo sem estado salvo, grupo removido).

import type { ReactNode } from 'react';
import { DarkCallout, Icone, type Conexao } from '../../shared/components/ui';
import { Moldura } from './Moldura';

interface TelaAvisoProps {
  sala: string;
  titulo: string;
  conexao?: Conexao | null;
  acoes?: ReactNode;
  children?: ReactNode;
}

export function TelaAviso({ sala, titulo, conexao, acoes, children }: TelaAvisoProps) {
  return (
    <Moldura rotulo={`Sala ${sala}`} conexao={conexao} largura="p" centralizar>
      <DarkCallout titulo={titulo} icone={<Icone nome="info" tamanho={22} />} acoes={acoes} aoVivo>
        {children}
      </DarkCallout>
    </Moldura>
  );
}
