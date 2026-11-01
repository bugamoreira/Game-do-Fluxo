import type { ReactNode } from 'react';
import { ClockBar, TeamAvatar, type Conexao } from '../../shared/components/ui';
import type { Rodada } from '../../shared/lib/simulation';

export const NOME_RODADA: Record<Rodada, string> = { 1: 'Plantão Travado', 2: 'Plantão Lean' };

interface CabecalhoProps {
  nomeGrupo: string;
  corGrupo: string;
  rodada: Rodada;
  minuto: number;
  pontuacao: number;
  pausado: boolean;
  conexao: Conexao | null;
  /** Controles extras à direita (modo solo: pausar, sair). */
  extra?: ReactNode;
}

export function Cabecalho({ nomeGrupo, corGrupo, rodada, minuto, pontuacao, pausado, conexao, extra }: CabecalhoProps) {
  return (
    <header className="flex items-center gap-6 rounded-cartao border border-borda bg-cartao px-5 py-3 shadow-cartao">
      <div className="flex min-w-0 items-center gap-3">
        <TeamAvatar nome={nomeGrupo} cor={corGrupo} tamanho="g" conectado={conexao === null ? undefined : conexao === 'online'} />
        <div className="min-w-0">
          <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">Seu grupo</p>
          <h1 className="max-w-[14rem] truncate text-xl font-bold text-texto">{nomeGrupo}</h1>
        </div>
      </div>
      <ClockBar minuto={minuto} rotulo={`${NOME_RODADA[rodada]} · Rodada ${rodada}`} pausado={pausado} className="flex-1" />
      <div className="flex items-center gap-2 rounded-pilula bg-marinho px-5 py-2.5 text-white" aria-live="off">
        <span className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">Pontos</span>
        <span className="font-space-mono text-2xl font-bold tabular-nums">{pontuacao}</span>
      </div>
      {extra}
    </header>
  );
}
