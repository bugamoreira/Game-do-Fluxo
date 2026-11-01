// ============================================================
// Modo demonstração (jogar.html?demo=1): sala falsa, só para revisão visual e
// screenshots sem servidor. Nada daqui é usado fora do modo demo.
// ?tela=nome|espera|travado|debrief|lean|final  &grupo=<nome> pula a J1.
// ============================================================

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ControladorEstadoTurma, ControladorRanking } from '../../shared/hooks/controladores';
import type { ResultadoSincronizarJogo } from '../../shared/hooks/useSincronizarJogo';
import type { EstadoTurma, ItemRanking } from '../../shared/schemas';
import type { Entrada, SessaoLocal } from '../../shared/schemas/sync.schema';
import { puxaFluxo, seguraNoPs, simularPartida, type EstadoSimulacao } from '../../shared/lib/simulation';
import type { TelaDemo } from '../lib/url';
import type { PortaJogo } from '../servicos/porta';
import { sementeDaTurma } from '../jogo/sincronia';
import { CodigoAcessoInvalido } from '../../shared/services/erros';

const TURMA_ID = 'demo-cbmede-2026';
const TOKEN_DEMO = 'demo_token_somente_para_revisao_visual_00000'.slice(0, 43);
const COR_DO_GRUPO = '#2563EB';
/** Código de acesso fictício da demonstração (o real aparece no telão). */
export const CODIGO_ACESSO_DEMO = '2026';

const GRUPOS = [
  { id: 'g1', nome: 'Os Fluxistas', cor: '#2563EB' },
  { id: 'g2', nome: 'Plantão Azul', cor: '#7C3AED' },
  { id: 'g3', nome: 'Kanban da Vila', cor: '#DB2777' },
  { id: 'g4', nome: 'Leito Livre', cor: '#0E7490' },
  { id: 'g5', nome: 'Giro Rápido', cor: '#0F766E' },
  { id: 'g6', nome: 'Alta Segura', cor: '#8B5E3C' },
];

const MINUTO_DEMO: Record<TelaDemo, number | null> = { nome: 645, espera: null, travado: 645, debrief: null, lean: 690, final: null };

function statusDa(tela: TelaDemo): EstadoTurma['status'] {
  switch (tela) {
    case 'espera': return 'aberta';
    case 'debrief': return 'debrief';
    case 'lean': return 'rodada2';
    case 'final': return 'encerrada';
    default: return 'rodada1';
  }
}

function criarTurma(tela: TelaDemo, inicioMs: number, quemEntrou: string | null): EstadoTurma {
  const status = statusDa(tela);
  const emRodada = status === 'rodada1' || status === 'rodada2';
  const grupos = GRUPOS.map(g => ({ ...g, conectado: true }));
  if (quemEntrou && !grupos.some(g => g.nome.toLowerCase() === quemEntrou.toLowerCase())) {
    grupos[0] = { ...grupos[0]!, nome: quemEntrou };
  }
  return {
    id: TURMA_ID,
    codigo: 'CBMEDE',
    nome: 'Curso de Gestão do ED Leaders · CBMEDE 2026',
    status,
    rodada: status === 'rodada1' ? 1 : status === 'rodada2' ? 2 : null,
    rodadaInicio: emRodada ? new Date(inicioMs).toISOString() : null,
    pausada: false,
    pausaAcumuladaMs: 0,
    horaServidor: new Date().toISOString(),
    fullCapacityLiberado: status === 'rodada2',
    musicaMudo: true,
    grupos: tela === 'espera' ? grupos.slice(0, 4) : grupos,
    tokenValido: true,
  };
}

/** Placar dos 6 grupos nas duas rodadas, jogado pelo motor com robôs (determinístico). */
function rankingDemo(nomeDoGrupo: string): ItemRanking[] {
  const semente = sementeDaTurma(TURMA_ID);
  const r1a = simularPartida(seguraNoPs, 1, semente, 1);
  const r1b = simularPartida(puxaFluxo, 1, semente, 2);
  const r2 = simularPartida(puxaFluxo, 2, semente, 2);
  const ajustes = [0, -38, 22, -61, 9, -17];
  return GRUPOS.flatMap((g, i) => {
    const nome = i === 0 ? nomeDoGrupo : g.nome;
    const base1 = i % 2 === 0 ? r1a : r1b;
    const itens: ItemRanking[] = [
      { grupoId: g.id, nome, cor: g.cor, rodada: 1, pontuacao: Math.max(0, base1.pontuacao + ajustes[i]!), metricas: { ...base1.metricas }, minuto: 1140 },
      { grupoId: g.id, nome, cor: g.cor, rodada: 2, pontuacao: Math.max(0, r2.pontuacao + ajustes[(i + 2) % 6]!), metricas: { ...r2.metricas }, minuto: 1140 },
    ];
    return itens;
  });
}

function estadoFinal(rodada: 1 | 2): EstadoSimulacao {
  return rodada === 1
    ? simularPartida(seguraNoPs, 1, sementeDaTurma(TURMA_ID), 1).estado
    : simularPartida(puxaFluxo, 2, sementeDaTurma(TURMA_ID), 2).estado;
}

const SYNC_DEMO: ResultadoSincronizarJogo = {
  conexao: 'online',
  ultimaSincronizacao: null,
  erro: null,
  pendentes: 0,
  registrarSerie: () => {},
  registrarEventos: () => {},
};

export function criarPortaDemo(tela: TelaDemo): PortaJogo {
  const minuto = MINUTO_DEMO[tela];
  const inicioMs = Date.now() - ((minuto ?? 420) - 420) * 1000;
  let nomeAtual: string | null = null;
  let sessao: SessaoLocal | null = null;
  let ranking: ItemRanking[] | null = null;
  const finais: Partial<Record<1 | 2, EstadoSimulacao>> = {};

  return {
    modo: 'demo',
    async consultarTurma() {
      return { id: TURMA_ID };
    },

    async obterEstado() {
      return null;
    },

    async entrar(_codigo, nome, _token, codigoAcesso): Promise<Entrada> {
      if (codigoAcesso && codigoAcesso.trim() !== CODIGO_ACESSO_DEMO) throw new CodigoAcessoInvalido();
      nomeAtual = nome.trim().replace(/\s+/g, ' ');
      const status = statusDa(tela);
      return {
        turmaId: TURMA_ID,
        status,
        rodada: status === 'rodada2' ? 2 : status === 'rodada1' ? 1 : null,
        grupo: { id: 'g1', nome: nomeAtual, cor: COR_DO_GRUPO },
        token: TOKEN_DEMO,
        reconectado: false,
        estadoSalvo: null,
      };
    },

    useEstadoTurma(codigo, intervaloMs) {
      const c = useMemo(
        () => new ControladorEstadoTurma(codigo, intervaloMs, { buscar: async () => criarTurma(tela, inicioMs, nomeAtual) }),
        [codigo, intervaloMs],
      );
      useEffect(() => {
        c.iniciar();
        return () => c.parar();
      }, [c]);
      return useSyncExternalStore(c.assinar, c.instantaneo, c.instantaneo);
    },

    useSincronizarJogo() {
      return SYNC_DEMO;
    },

    useRanking(codigo, intervaloMs = 1000) {
      const c = useMemo(
        () => new ControladorRanking(codigo, intervaloMs, async () => (ranking ??= rankingDemo(nomeAtual ?? GRUPOS[0]!.nome))),
        [codigo, intervaloMs],
      );
      useEffect(() => {
        c.iniciar();
        return () => c.parar();
      }, [c]);
      return useSyncExternalStore(c.assinar, c.instantaneo, c.instantaneo);
    },

    sessao: {
      ler: () => sessao,
      salvar: s => {
        sessao = { formato: 1, ...s };
      },
      limpar: () => {
        sessao = null;
      },
    },

    lerCopia() {
      if (tela === 'debrief') return (finais[1] ??= estadoFinal(1));
      if (tela === 'final') return (finais[2] ??= estadoFinal(2));
      return null;
    },
  };
}

