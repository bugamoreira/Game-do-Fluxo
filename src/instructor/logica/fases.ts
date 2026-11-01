// ============================================================
// Lógica pura do painel: de que fase da aula estamos (derivada só do status
// da turma), qual é a próxima ação e como se mostram os grupos.
// Sem React e sem rede: testada em __tests__/fases.test.ts.
// ============================================================

import type { EstadoTurma, GrupoDaTurma, StatusTurma } from '../../shared/schemas';
import { MINUTO_FIM, MINUTO_INICIO } from '../../shared/hooks/relogio';
import { duracaoCurta, horaDoPlantao } from '../../shared/components/ui/cx';
import { plural, tempoDecorrido } from './formato';

/** Telas F1–F5 agrupadas como na barra lateral (Ao vivo serve à R1 e à R2). */
export type Fase = 'sala' | 'aovivo' | 'debrief' | 'resultado';

export const ORDEM_FASES: readonly Fase[] = ['sala', 'aovivo', 'debrief', 'resultado'];

export function faseDoStatus(status: StatusTurma): Fase {
  switch (status) {
    case 'aberta':
      return 'sala';
    case 'rodada1':
    case 'rodada2':
      return 'aovivo';
    case 'debrief':
      return 'debrief';
    case 'encerrada':
    case 'arquivada':
      return 'resultado';
  }
}

/** Fases que o facilitador já pode consultar (as anteriores e a atual). */
export function fasesAlcancadas(status: StatusTurma): Fase[] {
  const atual = ORDEM_FASES.indexOf(faseDoStatus(status));
  return ORDEM_FASES.filter((_, i) => i <= atual);
}

export function emRodada(status: StatusTurma): status is 'rodada1' | 'rodada2' {
  return status === 'rodada1' || status === 'rodada2';
}

export const NOME_RODADA = { 1: 'Plantão Travado', 2: 'Plantão Lean' } as const;

export function rotuloStatus(status: StatusTurma): string {
  switch (status) {
    case 'aberta':
      return 'Sala aberta';
    case 'rodada1':
      return 'Plantão Travado ao vivo';
    case 'debrief':
      return 'Debrief da rodada 1';
    case 'rodada2':
      return 'Plantão Lean ao vivo';
    case 'encerrada':
      return 'Turma encerrada';
    case 'arquivada':
      return 'Turma arquivada';
  }
}

// ── Grupos ────────────────────────────────────────────────────

/** Grupo como o painel mostra: estado público + o que só o facilitador vê. */
export interface GrupoPainel {
  id: string;
  nome: string;
  cor: string;
  conectado: boolean;
  /** Segundos desde a última vez que o servidor viu o grupo; `null` se nunca. */
  vistoHaS: number | null;
  reconexaoLiberada: boolean;
  removido: boolean;
}

export function gruposAtivos(grupos: GrupoPainel[]): GrupoPainel[] {
  return grupos.filter((g) => !g.removido);
}

export function contarProntos(grupos: GrupoPainel[]): {
  conectados: number;
  total: number;
  desconectados: GrupoPainel[];
} {
  const ativos = gruposAtivos(grupos);
  const desconectados = ativos.filter((g) => !g.conectado);
  return { conectados: ativos.length - desconectados.length, total: ativos.length, desconectados };
}

/** "6 grupos prontos", "1 grupo pronto", "Nenhum grupo na sala". */
export function rotuloProntos(conectados: number, total: number): string {
  if (total === 0) return 'Nenhum grupo na sala';
  if (conectados === total) return plural(total, 'grupo pronto', 'grupos prontos');
  return `${conectados} de ${plural(total, 'grupo pronto', 'grupos prontos')}`;
}

/** Texto de presença: "Conectado", "Visto há 48 s", "Ainda não visto". */
export function textoPresenca(g: GrupoPainel): string {
  if (g.removido) return 'Removido';
  if (g.conectado) return 'Conectado';
  if (g.vistoHaS === null) return 'Sem sinal';
  return `Visto há ${tempoDecorrido(g.vistoHaS)}`;
}

/**
 * Junta o estado público (consulta periódica) com a visão do facilitador
 * (resposta da última ação) e com a última vez que este painel viu cada grupo
 * conectado. `agoraMs` e os instantes estão no relógio local.
 */
export function montarGrupos(
  publicos: GrupoDaTurma[],
  visaoFacilitador: GrupoDaTurma[] | null,
  ultimoVistoLocalMs: ReadonlyMap<string, number>,
  vistoEmServidorParaLocal: (instante: string) => number | null,
  agoraMs: number,
): GrupoPainel[] {
  const visao = new Map((visaoFacilitador ?? []).map((g) => [g.id, g]));
  // Remoção é definitiva: vale a visão do facilitador mesmo antes da próxima leitura pública.
  const removidoNaVisao = (id: string) => visao.get(id)?.removido === true;

  const vistoHa = (g: GrupoDaTurma): number | null => {
    const candidatos: number[] = [];
    const local = ultimoVistoLocalMs.get(g.id);
    if (local !== undefined) candidatos.push(local);
    const v = visao.get(g.id)?.vistoEm;
    if (v) {
      const ms = vistoEmServidorParaLocal(v);
      if (ms !== null) candidatos.push(ms);
    }
    if (candidatos.length === 0) return null;
    return Math.max(0, (agoraMs - Math.max(...candidatos)) / 1000);
  };

  const ativos: GrupoPainel[] = publicos
    .filter((g) => !removidoNaVisao(g.id))
    .map((g) => ({
      id: g.id,
      nome: g.nome,
      cor: g.cor,
      conectado: g.conectado,
      vistoHaS: g.conectado ? 0 : vistoHa(g),
      reconexaoLiberada: visao.get(g.id)?.reconexaoLiberada ?? false,
      removido: false,
    }));

  // Removidos só aparecem na visão do facilitador (a leitura pública os omite).
  const removidos: GrupoPainel[] = (visaoFacilitador ?? [])
    .filter((g) => g.removido)
    .map((g) => ({
      id: g.id,
      nome: g.nome,
      cor: g.cor,
      conectado: false,
      vistoHaS: vistoHa(g),
      reconexaoLiberada: false,
      removido: true,
    }));

  return [...ativos, ...removidos];
}

// ── Próxima ação da aula (DarkCallout) ───────────────────────

export type AcaoAula =
  | 'iniciarR1'
  | 'retomar'
  | 'encerrar'
  | 'iniciarR2'
  | 'liberarFullCapacity'
  | 'gerarRelatorio'
  | 'novaTurma';

export interface ProximaAcao {
  titulo: string;
  texto: string;
  acao: AcaoAula | null;
  rotuloAcao?: string;
}

/** A partir das 11h os grupos sentem o pico: momento sugerido para liberar o PCP. */
export const MINUTO_SUGERIDO_PCP = 660;

export function proximaAcao(
  turma: Pick<EstadoTurma, 'status' | 'pausada' | 'fullCapacityLiberado' | 'codigo'>,
  minuto: number | null,
  grupos: GrupoPainel[],
  relatorioGerado = false,
): ProximaAcao {
  const { conectados, total } = contarProntos(grupos);
  const m = minuto ?? MINUTO_INICIO;
  const restante = Math.max(0, MINUTO_FIM - m);
  const fimDoPlantao = m >= MINUTO_FIM;

  switch (turma.status) {
    case 'aberta':
      if (total === 0)
        return {
          titulo: 'Aguardar os grupos',
          texto: `Peça a cada grupo que abra o jogo e entre com o código ${turma.codigo}. Os nomes aparecem aqui assim que entrarem.`,
          acao: null,
        };
      return {
        titulo: 'Iniciar o Plantão Travado',
        texto:
          conectados === total
            ? `${rotuloProntos(conectados, total)}. Quando todos estiverem prontos, inicie: o relógio corre igual em todos os computadores.`
            : `${rotuloProntos(conectados, total)}. Confira se algum grupo perdeu a conexão antes de iniciar.`,
        acao: 'iniciarR1',
        rotuloAcao: 'Iniciar Plantão Travado',
      };

    case 'rodada1':
    case 'rodada2': {
      const nome = turma.status === 'rodada1' ? 'Plantão Travado' : 'Plantão Lean';
      if (turma.pausada)
        return {
          titulo: `${nome} pausado`,
          texto: `O relógio está parado em ${horaDoPlantao(m)} em todos os computadores. Retome quando terminar a explicação.`,
          acao: 'retomar',
          rotuloAcao: 'Retomar plantão',
        };
      if (fimDoPlantao)
        return {
          titulo: `Encerrar o ${nome}`,
          texto:
            turma.status === 'rodada1'
              ? 'O plantão chegou às 19:00. Encerre a rodada para abrir o debrief com os dados de cada grupo.'
              : 'O plantão chegou às 19:00. Encerre a rodada para ver o comparativo entre as duas rodadas.',
          acao: 'encerrar',
          rotuloAcao: turma.status === 'rodada1' ? 'Encerrar e ir para o debrief' : 'Encerrar e ver o resultado',
        };
      if (turma.status === 'rodada2' && !turma.fullCapacityLiberado && m >= MINUTO_SUGERIDO_PCP)
        return {
          titulo: 'Liberar o PCP (Full Capacity)',
          texto:
            'O pico do meio-dia chegou. Libere o Full Capacity para que os grupos possam internar pacientes estáveis em leitos extras no corredor da enfermaria.',
          acao: 'liberarFullCapacity',
          rotuloAcao: 'Liberar PCP (Full Capacity)',
        };
      return {
        titulo: `Acompanhar o ${nome}`,
        texto:
          turma.status === 'rodada1'
            ? `Faltam ${duracaoCurta(restante)} de plantão simulado (cerca de ${Math.ceil(restante / 60)} min). Observe quem acumula boarding e quem para de decidir.`
            : `Faltam ${duracaoCurta(restante)} de plantão simulado (cerca de ${Math.ceil(restante / 60)} min). Compare as decisões com as da rodada 1.`,
        acao: null,
      };
    }

    case 'debrief':
      return {
        titulo: 'Iniciar o Plantão Lean',
        texto:
          'Discuta os números da rodada 1 com a turma. Quando terminar, inicie o Plantão Lean: mesma demanda, mesmo hospital, com as ferramentas automáticas.',
        acao: 'iniciarR2',
        rotuloAcao: 'Iniciar Plantão Lean',
      };

    case 'encerrada':
      return {
        titulo: 'Gerar o relatório da turma',
        texto:
          'O relatório congela o ranking, as métricas das duas rodadas e as mensagens do debrief num link para compartilhar.',
        acao: 'gerarRelatorio',
        rotuloAcao: 'Gerar relatório',
      };

    case 'arquivada':
      return relatorioGerado
        ? {
            titulo: 'Compartilhar o relatório',
            texto: 'Copie o link abaixo e envie à turma. Para a próxima aula, abra uma nova turma.',
            acao: 'novaTurma',
            rotuloAcao: 'Nova turma',
          }
        : {
            titulo: 'Turma arquivada',
            texto: 'O relatório desta turma já foi gerado. Mostre o link para copiar ou abra uma nova turma.',
            acao: 'gerarRelatorio',
            rotuloAcao: 'Mostrar link do relatório',
          };
  }
}

// ── Endereços ─────────────────────────────────────────────────

export function linkTelao(origem: string, codigo: string, demo = false): string {
  const p = new URLSearchParams({ sala: codigo });
  if (demo) p.set('demo', '1');
  return `${origem}/projetor.html?${p.toString()}`;
}

export function linkRelatorio(origem: string, slug: string): string {
  return `${origem}/relatorio.html?r=${encodeURIComponent(slug)}`;
}

export function linkJogo(origem: string): string {
  return `${origem}/jogar.html`;
}
