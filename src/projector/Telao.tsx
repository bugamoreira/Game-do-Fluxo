// Telão (projetor.html): escolhe a fase pelo estado da turma e conduz a música.
// Recebe só dados públicos; quem busca é AoVivo.tsx (ou a demonstração).

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { musica } from '../shared/lib/music';
import type { Conexao } from '../shared/hooks';
import type { EstadoTurma, ItemRanking } from '../shared/schemas';
import { BotaoSom, Logos, Moldura, Palco } from './componentes';
import {
  ENDERECO_JOGO,
  MemoriaEventos,
  SALA_PADRAO,
  faseDoTelao,
  itensDaRodada,
  rodadaEmFoco,
  tensaoDaTurma,
} from './derivar';
import { Abertura } from './fases/Abertura';
import { Debrief } from './fases/Debrief';
import { Final } from './fases/Final';
import { Rodada } from './fases/Rodada';

export interface DadosTelao {
  sala: string;
  turma: EstadoTurma | null;
  itens: ItemRanking[];
  minuto: number | null;
  conexao: Conexao;
  /** Ainda sem a primeira resposta do servidor. */
  carregando: boolean;
  /** O servidor respondeu que não há turma com esse código. */
  turmaInexistente: boolean;
}

export function Telao(d: DadosTelao) {
  const { turma, itens, minuto, conexao } = d;
  const fase = faseDoTelao(turma);
  const rodada = rodadaEmFoco(turma);
  const itensRodada = useMemo(() => itensDaRodada(itens, rodada), [itens, rodada]);
  const itensR1 = useMemo(() => itensDaRodada(itens, 1), [itens]);

  // --- Eventos marcantes (variação do placar entre consultas) ---
  const memoria = useMemo(() => new MemoriaEventos(4), []);
  const eventos = useSyncExternalStore(memoria.assinar, memoria.eventos, memoria.eventos);
  useEffect(() => {
    if (fase !== 'rodada') return;
    const som = memoria.registrar(itensRodada, rodada);
    if (som) musica.efeito(som);
  }, [memoria, fase, itensRodada, rodada]);

  // --- Música: segue a rodada; o mudo é do facilitador ---
  const [somAtivo, setSomAtivo] = useState(false);
  const rodando = fase === 'rodada' && !turma?.pausada;
  const tensao = Math.round(tensaoDaTurma(itensRodada, rodada) * 100) / 100;
  const mudo = turma?.musicaMudo ?? false;
  useEffect(() => {
    musica.atualizar({ rodada, tensao, rodando });
  }, [rodada, tensao, rodando]);
  useEffect(() => {
    musica.definirMudo(mudo);
  }, [mudo]);
  const ativarSom = useCallback(() => {
    musica.iniciar().then(
      () => setSomAtivo(true),
      () => setSomAtivo(false),
    );
  }, []);
  const som = <BotaoSom ativo={somAtivo} mudoPeloFacilitador={mudo} onAtivar={ativarSom} />;

  if (!turma) {
    return (
      <Palco>
        <Espera sala={d.sala} carregando={d.carregando} inexistente={d.turmaInexistente} som={som} conexao={conexao} />
      </Palco>
    );
  }

  return (
    <Palco>
      {fase === 'aberta' && (
        <Moldura rotulo="— Sala aberta · CBMEDE 2026" fundo="/img/rio/rio-aereo.jpg" veu={0.86} conexao={conexao} som={som}>
          <Abertura turma={turma} sala={d.sala} />
        </Moldura>
      )}
      {fase === 'rodada' && (
        <Moldura
          rotulo={`— Rodada ${rodada} · ${rodada === 2 ? 'Plantão Lean' : 'Plantão Travado'}${turma.pausada ? ' · Pausada' : ''}`}
          veu={0.93}
          conexao={conexao}
          som={som}
        >
          <Rodada turma={turma} rodada={rodada} minuto={minuto} itens={itensRodada} eventos={eventos} />
        </Moldura>
      )}
      {fase === 'debrief' && (
        <Moldura rotulo="— Debrief · Rodada 1 · Plantão Travado" veu={0.94} conexao={conexao} som={som}>
          <Debrief itensR1={itensR1} />
        </Moldura>
      )}
      {fase === 'final' && (
        <Moldura rotulo="— Resultado final · CBMEDE 2026" fundo="/img/rio/rio-cristo-nevoa.jpg" veu={0.88} conexao={conexao} som={som}>
          <Final itens={itens} />
        </Moldura>
      )}
    </Palco>
  );
}

function Espera({
  sala,
  carregando,
  inexistente,
  som,
  conexao,
}: {
  sala: string;
  carregando: boolean;
  inexistente: boolean;
  som: ReactNode;
  conexao: Conexao;
}) {
  const mensagem = carregando
    ? 'Conectando ao servidor…'
    : inexistente
      ? 'Aguardando o facilitador abrir a turma.'
      : conexao === 'online'
        ? 'Aguardando o facilitador abrir a turma.'
        : 'Sem conexão com o servidor. Tentando de novo…';
  return (
    <div className="relative isolate flex h-full w-full flex-col items-center justify-center gap-10 overflow-hidden bg-marinho-profundo px-16 text-center font-sora text-white">
      <img src="/img/rio/rio-cristo-montanhas.jpg" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-degrade-cbmede opacity-[0.88]" />
      <Logos grande />
      <p className="text-8xl font-bold">
        Simulador do <span className="text-amarelo">Plantão</span>
      </p>
      <p role="status" className="telao-pulsar text-4xl text-white/90">{mensagem}</p>
      <p className="font-space-mono text-6xl font-bold text-amarelo">{ENDERECO_JOGO}</p>
      {sala !== SALA_PADRAO && <p className="text-3xl text-white/85">Sala {sala}</p>}
      <div className="absolute right-16 bottom-8">{som}</div>
    </div>
  );
}
