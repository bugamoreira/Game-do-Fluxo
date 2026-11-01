// ============================================================
// Modo demonstração do relatório (relatorio.html?demo=1).
//
// Os dados não são inventados à mão: seis grupos-robô jogam as duas rodadas
// no motor real (mesma semente da turma nas duas rodadas, como no evento).
// O resultado sai no mesmo formato de `relatorios.dados` gravado por
// `gerar_relatorio` (snake_case), e passa pelo mesmo caminho de leitura.
// ============================================================

import {
  aplicarAcao,
  criarEstadoInicial,
  ehErro,
  leitoInadequado,
  metricas,
  MINUTO_FIM,
  passo,
  pontuacao,
  puxaFluxo,
  seguraNoPs,
  type Estrategia,
  type EstadoSimulacao,
  type Ocorrencia,
  type Rodada,
} from '../../shared/lib/simulation';

/** Tipos de ocorrência que o jogo grava em `eventos_jogo` (o resto é movimento rotineiro). */
const TIPOS_GRAVADOS = new Set<Ocorrencia['tipo']>([
  'surto', 'pcr', 'tomografo', 'laboratorio', 'fora_do_perfil', 'social', 'bloqueio_social',
  'emergencia_cirurgica', 'emergencia_obito', 'deterioracao', 'deterioracao_espera',
  'deterioracao_leito_inadequado', 'obito', 'obito_espera', 'de_lotado', 'corredor', 'lwbs',
  'cirurgia_cancelada', 'leito_inadequado', 'nir', 'full_capacity', 'fluxista',
]);

/** Intervalo da série de métricas (minutos simulados), como no jogo. */
const INTERVALO_SERIE = 30;

interface PerfilGrupo {
  nome: string;
  cor: string;
  /** Robô de decisão em cada rodada. */
  r1: Estrategia;
  r2: Estrategia;
  /** Decisões por minuto (grupo mais ou menos ágil). */
  ritmo: number;
  /** Em quantos de cada 10 minutos o grupo age (atenção dividida). */
  atencao: number;
}

const GRUPOS: PerfilGrupo[] = [
  { nome: 'Sala Vermelha', cor: '#2563EB', r1: puxaFluxo, r2: puxaFluxo, ritmo: 2, atencao: 9 },
  { nome: 'Leito Zero', cor: '#7C3AED', r1: seguraNoPs, r2: puxaFluxo, ritmo: 2, atencao: 8 },
  { nome: 'Fluxo Livre', cor: '#DB2777', r1: puxaFluxo, r2: puxaFluxo, ritmo: 1, atencao: 7 },
  { nome: 'Kanban', cor: '#0E7490', r1: leitoInadequado, r2: puxaFluxo, ritmo: 2, atencao: 9 },
  { nome: 'Plantão 24h', cor: '#0F766E', r1: seguraNoPs, r2: leitoInadequado, ritmo: 1, atencao: 6 },
  { nome: 'Os Reguladores', cor: '#8B5E3C', r1: seguraNoPs, r2: puxaFluxo, ritmo: 1, atencao: 5 },
];

const SEMENTE_TURMA = 2026;

function idGrupo(i: number): string {
  return `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
}

interface Partida {
  pontuacao: number;
  metricas: Record<string, number>;
  series: { minuto: number; metricas: Record<string, number> }[];
  eventos: { minuto: number; tipo: string; mensagem: string }[];
}

function jogar(perfil: PerfilGrupo, rodada: Rodada, semente: number): Partida {
  const estrategia = rodada === 1 ? perfil.r1 : perfil.r2;
  let estado: EstadoSimulacao = criarEstadoInicial(rodada, semente);
  const series: Partida['series'] = [{ minuto: estado.minuto, metricas: { ...metricas(estado) } }];
  const eventos: Partida['eventos'] = [];
  const guardar = (ocs: Ocorrencia[]) => {
    for (const o of ocs) if (TIPOS_GRAVADOS.has(o.tipo)) eventos.push({ minuto: o.minuto, tipo: o.tipo, mensagem: o.msg });
  };

  while (estado.minuto < MINUTO_FIM) {
    if (estado.minuto % 10 < perfil.atencao) {
      for (let i = 0; i < perfil.ritmo; i++) {
        const acao = estrategia(estado);
        if (!acao) break;
        const r = aplicarAcao(estado, acao);
        if (ehErro(r)) break;
        estado = r.estado;
        guardar(r.ocorrencias);
      }
    }
    const r = passo(estado);
    estado = r.estado;
    guardar(r.ocorrencias);
    if (estado.minuto % INTERVALO_SERIE === 0) series.push({ minuto: estado.minuto, metricas: { ...metricas(estado) } });
  }
  return { pontuacao: pontuacao(estado), metricas: { ...metricas(estado) }, series, eventos };
}

function rankingDe(
  rodada: Rodada,
  partidas: { i: number; p: Partida }[],
): Record<string, unknown>[] {
  return [...partidas]
    .sort((a, b) => b.p.pontuacao - a.p.pontuacao)
    .map(({ i, p }, pos) => ({
      posicao: pos + 1,
      grupo_id: idGrupo(i),
      nome: GRUPOS[i]!.nome,
      cor: GRUPOS[i]!.cor,
      rodada,
      pontuacao: p.pontuacao,
      minuto: MINUTO_FIM,
      metricas: p.metricas,
    }));
}

/** `relatorios.dados` de uma turma de demonstração com seis grupos. */
export function gerarDadosDemo(): Record<string, unknown> {
  const r1 = GRUPOS.map((g, i) => ({ i, p: jogar(g, 1, SEMENTE_TURMA + i) }));
  const r2 = GRUPOS.map((g, i) => ({ i, p: jogar(g, 2, SEMENTE_TURMA + i) }));
  const todas = [...r1.map(x => ({ ...x, rodada: 1 as const })), ...r2.map(x => ({ ...x, rodada: 2 as const }))];

  return {
    turma: {
      id: '00000000-0000-4000-8000-0000000000aa',
      codigo: 'DEMO',
      nome: 'Curso de Gestão de Fluxo · Turma de demonstração',
      evento: 'CBMEDE 2026 · Rio de Janeiro',
      data: '2026-11-25',
    },
    facilitador: 'Dr. Gustavo Moreira',
    gerado_em: '2026-11-25T18:42:00.000Z',
    versao_regras: 'portao-2',
    grupos: GRUPOS.map((g, i) => ({ id: idGrupo(i), nome: g.nome, cor: g.cor, rodada_entrada: 1 })),
    ranking: { rodada1: rankingDe(1, r1), rodada2: rankingDe(2, r2) },
    placar: todas.map(({ i, p, rodada }) => ({
      grupo_id: idGrupo(i), rodada, minuto: MINUTO_FIM, pontuacao: p.pontuacao, metricas: p.metricas,
    })),
    series: todas.flatMap(({ i, p, rodada }) =>
      p.series.map(s => ({ grupo_id: idGrupo(i), rodada, minuto: s.minuto, metricas: s.metricas })),
    ),
    eventos: todas.flatMap(({ i, p, rodada }) =>
      p.eventos.map(e => ({ grupo_id: idGrupo(i), rodada, minuto: e.minuto, tipo: e.tipo, mensagem: e.mensagem })),
    ),
  };
}
