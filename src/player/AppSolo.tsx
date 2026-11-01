// ============================================================
// Treinar sozinho (jogar.html?modo=solo): 100% local, sem servidor.
// Mesmo motor e mesma tela; o relógio é deste computador e o grupo pode pausar.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Icone } from '../shared/components/ui';
import { MINUTO_FIM, criarEstadoInicial, type Rodada } from '../shared/lib/simulation';
import { minutoLocal, tensaoDoPlantao } from './jogo/sincronia';
import { storeJogo, useJogo, useRelogioDoJogo } from './jogo/useJogo';
import { musica } from './lib/musicaAdapter';
import { useLigarSomNoPrimeiroGesto } from './lib/useLigarSom';
import { TelaPlantao } from './plantao/TelaPlantao';
import { Moldura } from './telas/Moldura';
import { TelaFimRodada } from './telas/TelaFimRodada';
import { TelaResultado } from './telas/TelaResultado';

const NOME_SOLO = 'Treino';
const COR_SOLO = '#2563EB';

interface Relogio {
  inicioMs: number;
  pausaAcumuladaMs: number;
  pausadoEmMs: number | null;
}

type Fase = { tipo: 'escolha' } | { tipo: 'jogando'; rodada: Rodada } | { tipo: 'fim'; rodada: Rodada };

function novaSemente(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function AppSolo() {
  useLigarSomNoPrimeiroGesto();
  const estado = useJogo(s => s.estado);
  const resumos = useJogo(s => s.resumos);
  const [faseEscolhida, setFase] = useState<Fase>({ tipo: 'escolha' });
  // Às 19h a rodada termina sozinha: a fase "fim" é derivada do relógio do motor.
  const fase: Fase =
    faseEscolhida.tipo === 'jogando' && estado && estado.minuto >= MINUTO_FIM ? { tipo: 'fim', rodada: faseEscolhida.rodada } : faseEscolhida;
  const [semente] = useState(novaSemente);
  const [relogio, setRelogio] = useState<Relogio | null>(null);

  const comecar = useCallback(
    (rodada: Rodada) => {
      storeJogo.getState().carregar(criarEstadoInicial(rodada, semente));
      setRelogio({ inicioMs: Date.now(), pausaAcumuladaMs: 0, pausadoEmMs: null });
      setFase({ tipo: 'jogando', rodada });
    },
    [semente],
  );

  const pausado = relogio?.pausadoEmMs != null;
  const alternarPausa = () =>
    setRelogio(r => {
      if (!r) return r;
      if (r.pausadoEmMs === null) return { ...r, pausadoEmMs: Date.now() };
      return { ...r, pausaAcumuladaMs: r.pausaAcumuladaMs + (Date.now() - r.pausadoEmMs), pausadoEmMs: null };
    });

  const obterAlvo = useCallback(
    (local: number) => {
      if (!relogio) return null;
      const alvo = minutoLocal(relogio.inicioMs, Date.now(), relogio.pausaAcumuladaMs, relogio.pausadoEmMs);
      return alvo > local ? alvo : null;
    },
    [relogio],
  );
  const emJogo = fase.tipo === 'jogando';
  useRelogioDoJogo(emJogo, obterAlvo);

  useEffect(() => {
    if (!estado) return;
    musica.atualizar({ rodada: estado.rodada, tensao: tensaoDoPlantao(estado), rodando: emJogo && !pausado });
  }, [estado, emJogo, pausado]);

  if (fase.tipo === 'jogando' && estado) {
    return (
      <TelaPlantao
        nomeGrupo={NOME_SOLO}
        corGrupo={COR_SOLO}
        conexao={null}
        pausado={pausado}
        textoPausa="Plantão pausado. Clique em Retomar para continuar."
        podeAutorizarPcp
        extraCabecalho={
          <div className="flex items-center gap-2">
            <Button variante="contorno" tamanho="p" onClick={alternarPausa} icone={<Icone nome={pausado ? 'play' : 'pausa'} tamanho={16} />}>
              {pausado ? 'Retomar' : 'Pausar'}
            </Button>
            <Button variante="fantasma" tamanho="p" onClick={() => setFase({ tipo: 'escolha' })}>
              Sair
            </Button>
          </div>
        }
      />
    );
  }

  if (fase.tipo === 'fim' && fase.rodada === 1) {
    return (
      <TelaFimRodada
        sala={null}
        nomeGrupo={NOME_SOLO}
        corGrupo={COR_SOLO}
        resumo={resumos[1] ?? null}
        proximoPasso="Agora, o mesmo plantão com as ferramentas Lean."
        acao={
          <Button variante="verde" onClick={() => comecar(2)}>
            Jogar o Plantão Lean
          </Button>
        }
      />
    );
  }

  if (fase.tipo === 'fim' && fase.rodada === 2) {
    return (
      <TelaResultado
        sala={null}
        nomeGrupo={NOME_SOLO}
        corGrupo={COR_SOLO}
        r1={resumos[1] ?? null}
        r2={resumos[2] ?? null}
        rankingR2={[]}
        acao={
          <Button variante="amarelo" onClick={() => setFase({ tipo: 'escolha' })}>
            Treinar de novo
          </Button>
        }
      />
    );
  }

  return (
    <Moldura rotulo="Treinar sozinho" largura="m">
      <Card grande espaco="g" rotulo="Modo treino" titulo="Escolha a rodada">
        <p className="mb-6 text-[15px] leading-relaxed">
          Tudo roda neste computador, sem servidor e sem ranking. Cada rodada vai das 7h às 19h em 12 minutos reais, e você pode pausar.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <OpcaoRodada titulo="Plantão Travado" texto="O hospital como ele é: altas tardias, cirurgias concentradas e transferência lenta." onEscolher={() => comecar(1)} />
          <OpcaoRodada titulo="Plantão Lean" texto="A mesma demanda, com Fluxista, Discharge Lounge, Fast Track, NIR rápido e PCP." onEscolher={() => comecar(2)} />
        </div>
      </Card>
      <p className="text-center text-sm">
        <a href="jogar.html" className="font-bold text-marinho underline underline-offset-4">
          Voltar para a sala do curso
        </a>
      </p>
    </Moldura>
  );
}

function OpcaoRodada({ titulo, texto, onEscolher }: { titulo: string; texto: string; onEscolher: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-cartao border border-borda bg-fundo-app p-5">
      <h3 className="text-lg font-bold text-texto">{titulo}</h3>
      <p className="flex-1 text-sm leading-relaxed">{texto}</p>
      <Button variante="marinho" onClick={onEscolher} className="self-start">
        Jogar o {titulo}
      </Button>
    </div>
  );
}
