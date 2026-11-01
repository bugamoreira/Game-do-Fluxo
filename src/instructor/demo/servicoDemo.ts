// ============================================================
// Serviço falso do modo demonstração (`instrutor.html?demo=1`).
// Tudo em memória, sem servidor: turma com 6 grupos, relógio real
// (1 s = 1 min de plantão) e métricas inventadas, mas coerentes com a
// mensagem da aula (o Lean melhora o fluxo e reduz a carga do gestor).
// Segue as mesmas regras do servidor: transições, código em uso, visões
// pública e do facilitador. Só para navegação e capturas de tela.
// ============================================================

import type {
  AbrirTurmaEntrada,
  EstadoTurma,
  EventoTurma,
  GrupoDaTurma,
  ItemRanking,
  PontoSerieTurma,
  StatusTurma,
} from '../../shared/schemas';
import {
  CodigoEmUso,
  DadosInvalidos,
  NaoAutorizado,
  TransicaoInvalida,
  TurmaNaoEncontrada,
} from '../../shared/services/erros';
import type { ServicosFacilitador } from '../servicos';
import { eventosDemo, metricasDemo, pontuacaoDemo } from './dadosDemo';

const MIN_INICIO = 420;
const MIN_FIM = 1140;

/** Fase inicial pedida na URL (`&fase=...`), para capturas de tela. */
export type FaseDemo = 'login' | 'nova' | 'sala' | 'r1' | 'debrief' | 'r2' | 'resultado';

export const GRUPOS_DEMO: ReadonlyArray<{ nome: string; cor: string }> = [
  { nome: 'Pronto-Socorro Azul', cor: '#2563EB' },
  { nome: 'Leito Zero', cor: '#7C3AED' },
  { nome: 'Fluxo Contínuo', cor: '#DB2777' },
  { nome: 'Equipe Kanban', cor: '#0E7490' },
  { nome: 'Os Boarders', cor: '#0F766E' },
  { nome: 'Alta Segura', cor: '#8B5E3C' },
];

/** Grupo que aparece sem conexão na demonstração (para mostrar o aviso). */
const INDICE_DESCONECTADO = 4;

interface GrupoInterno {
  id: string;
  nome: string;
  cor: string;
  vistoEm: number;
  reconexaoLiberada: boolean;
  removido: boolean;
}

interface TurmaInterna {
  id: string;
  codigo: string;
  nome: string;
  evento: string | null;
  data: string;
  status: StatusTurma;
  rodada: 1 | 2 | null;
  rodadaInicio: number | null;
  rodadaFim: number | null;
  pausadaEm: number | null;
  pausaAcumuladaMs: number;
  entradaLiberada: boolean;
  fullCapacityLiberado: boolean;
  musicaMudo: boolean;
  grupos: GrupoInterno[];
  /** Fim (minuto) de cada rodada já jogada. */
  minutoFinal: { 1?: number; 2?: number };
  slug: string | null;
}

const TRANSICOES: ReadonlyArray<[StatusTurma, StatusTurma]> = [
  ['aberta', 'rodada1'],
  ['rodada1', 'debrief'],
  ['debrief', 'rodada2'],
  ['rodada2', 'encerrada'],
];

const iso = (ms: number) => new Date(ms).toISOString();
const espera = () => new Promise<void>((r) => setTimeout(r, 120));

export interface OpcoesDemo {
  fase?: FaseDemo;
  agora?: () => number;
  /** Minutos de plantão já decorridos ao iniciar uma rodada na demonstração (para não esperar). */
  minutoInicialRodada?: number;
}

export function criarServicoDemo(opcoes: OpcoesDemo = {}): ServicosFacilitador & { readonly faseInicial: FaseDemo } {
  const agora = opcoes.agora ?? Date.now;
  const minutoInicial = opcoes.minutoInicialRodada ?? 645;
  const turmas: TurmaInterna[] = [];
  let contador = 0;
  const novoId = (p: string) => `${p}-${(++contador).toString(36)}-demo`;

  function minutoDe(t: TurmaInterna): number | null {
    if (t.rodadaInicio === null) return null;
    const ref = t.rodadaFim ?? t.pausadaEm ?? agora();
    const m = MIN_INICIO + Math.floor((ref - t.rodadaInicio - t.pausaAcumuladaMs) / 1000);
    return Math.min(MIN_FIM, Math.max(MIN_INICIO, m));
  }

  function grupoJson(g: GrupoInterno, facilitador: boolean): GrupoDaTurma {
    const base = { id: g.id, nome: g.nome, cor: g.cor, conectado: agora() - g.vistoEm < 15000 };
    return facilitador
      ? { ...base, vistoEm: iso(g.vistoEm), reconexaoLiberada: g.reconexaoLiberada, removido: g.removido }
      : base;
  }

  function json(t: TurmaInterna, facilitador: boolean): EstadoTurma {
    return {
      id: t.id,
      codigo: t.codigo,
      nome: t.nome,
      evento: t.evento,
      data: t.data,
      status: t.status,
      rodada: t.rodada,
      rodadaInicio: t.rodadaInicio === null ? null : iso(t.rodadaInicio),
      rodadaFim: t.rodadaFim === null ? null : iso(t.rodadaFim),
      pausada: t.pausadaEm !== null,
      pausadaEm: t.pausadaEm === null ? null : iso(t.pausadaEm),
      pausaAcumuladaMs: t.pausaAcumuladaMs,
      minuto: minutoDe(t),
      horaServidor: iso(agora()),
      entradaLiberada: t.entradaLiberada,
      fullCapacityLiberado: t.fullCapacityLiberado,
      musicaMudo: t.musicaMudo,
      grupos: t.grupos.filter((g) => facilitador || !g.removido).map((g) => grupoJson(g, facilitador)),
    };
  }

  /** Mantém os grupos "vivos" (como se consultassem a cada segundo), menos o desconectado. */
  function batimentos(t: TurmaInterna): void {
    t.grupos.forEach((g, i) => {
      if (!g.removido && i !== INDICE_DESCONECTADO) g.vistoEm = agora();
    });
  }

  function ativa(codigo: string): TurmaInterna | undefined {
    const c = codigo.trim().toUpperCase();
    return turmas.find((t) => t.codigo === c && t.status !== 'arquivada');
  }

  function porCodigo(codigo: string): TurmaInterna {
    const c = codigo.trim().toUpperCase();
    const t = ativa(c) ?? [...turmas].reverse().find((x) => x.codigo === c);
    if (!t) throw new TurmaNaoEncontrada();
    return t;
  }

  function porId(id: string): TurmaInterna {
    const t = turmas.find((x) => x.id === id);
    if (!t) throw new TurmaNaoEncontrada();
    return t;
  }

  function grupoPorId(id: string): [TurmaInterna, GrupoInterno] {
    for (const t of turmas) {
      const g = t.grupos.find((x) => x.id === id && !x.removido);
      if (g) return [t, g];
    }
    throw new DadosInvalidos('Grupo não encontrado.');
  }

  function criarTurma(codigo: string, nome: string, evento: string | null, data: string): TurmaInterna {
    const t: TurmaInterna = {
      id: novoId('turma'),
      codigo,
      nome,
      evento,
      data,
      status: 'aberta',
      rodada: null,
      rodadaInicio: null,
      rodadaFim: null,
      pausadaEm: null,
      pausaAcumuladaMs: 0,
      entradaLiberada: false,
      fullCapacityLiberado: false,
      musicaMudo: false,
      grupos: GRUPOS_DEMO.map((g, i) => ({
        id: novoId('grupo'),
        nome: g.nome,
        cor: g.cor,
        vistoEm: i === INDICE_DESCONECTADO ? agora() - 48_000 : agora(),
        reconexaoLiberada: false,
        removido: false,
      })),
      minutoFinal: {},
      slug: null,
    };
    turmas.push(t);
    return t;
  }

  function iniciarRodada(t: TurmaInterna, rodada: 1 | 2): void {
    t.status = rodada === 1 ? 'rodada1' : 'rodada2';
    t.rodada = rodada;
    t.rodadaInicio = agora() - (minutoInicial - MIN_INICIO) * 1000;
    t.rodadaFim = null;
    t.pausadaEm = null;
    t.pausaAcumuladaMs = 0;
  }

  function encerrarRodada(t: TurmaInterna, status: StatusTurma): void {
    if (t.pausadaEm !== null) {
      t.pausaAcumuladaMs += agora() - t.pausadaEm;
      t.pausadaEm = null;
    }
    t.rodadaFim = agora();
    if (t.rodada) t.minutoFinal[t.rodada] = minutoDe(t) ?? MIN_FIM;
    t.status = status;
  }

  function mudar(t: TurmaInterna, status: StatusTurma): void {
    if (!TRANSICOES.some(([de, para]) => de === t.status && para === status))
      throw new TransicaoInvalida(`Não é possível ir de "${t.status}" para "${status}".`);
    if (status === 'rodada1') iniciarRodada(t, 1);
    else if (status === 'rodada2') iniciarRodada(t, 2);
    else encerrarRodada(t, status);
  }

  function itensRodada(t: TurmaInterna, rodada: 1 | 2): ItemRanking[] {
    const jogou = rodada === 1 ? t.status !== 'aberta' : ['rodada2', 'encerrada', 'arquivada'].includes(t.status);
    if (!jogou) return [];
    const minuto =
      t.rodada === rodada && t.minutoFinal[rodada] === undefined
        ? (minutoDe(t) ?? MIN_INICIO)
        : (t.minutoFinal[rodada] ?? MIN_FIM);
    const itens = t.grupos
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => !g.removido)
      .map(({ g, i }) => {
        const metricas = metricasDemo(i, rodada, minuto);
        return {
          grupoId: g.id,
          nome: g.nome,
          cor: g.cor,
          rodada,
          minuto,
          metricas,
          pontuacao: pontuacaoDemo(metricas, rodada),
        };
      })
      .sort((a, b) => b.pontuacao - a.pontuacao);
    return itens.map((item, k) => ({ ...item, posicao: k + 1 }));
  }

  /** Até que minuto cada rodada já foi jogada (null: ainda não começou). */
  function minutoJogado(t: TurmaInterna, rodada: 1 | 2): number | null {
    if (itensRodada(t, rodada).length === 0) return null;
    return t.rodada === rodada && t.minutoFinal[rodada] === undefined
      ? (minutoDe(t) ?? MIN_INICIO)
      : (t.minutoFinal[rodada] ?? MIN_FIM);
  }

  function seriesDe(t: TurmaInterna): PontoSerieTurma[] {
    const pontos: PontoSerieTurma[] = [];
    t.grupos.forEach((g, i) => {
      if (g.removido) return;
      for (const rodada of [1, 2] as const) {
        const ate = minutoJogado(t, rodada);
        if (ate === null) continue;
        for (let m = MIN_INICIO; m <= ate; m += 30) {
          pontos.push({ grupoId: g.id, nome: g.nome, cor: g.cor, rodada, minuto: m, metricas: metricasDemo(i, rodada, m) });
        }
      }
    });
    return pontos;
  }

  function eventosDe(t: TurmaInterna): EventoTurma[] {
    const eventos: EventoTurma[] = [];
    let seq = 0;
    for (const rodada of [1, 2] as const) {
      const ate = minutoJogado(t, rodada);
      if (ate === null) continue;
      t.grupos.forEach((g, i) => {
        if (g.removido) return;
        // Janelas de 30 min, para os eventos se espalharem pelo plantão.
        for (let de = MIN_INICIO; de < ate; de += 30) {
          for (const e of eventosDemo(i, rodada, de, Math.min(ate, de + 30))) {
            eventos.push({ id: ++seq, grupoId: g.id, nome: g.nome, cor: g.cor, rodada, criadoEm: null, ...e });
          }
        }
      });
    }
    return eventos.sort((a, b) => b.rodada - a.rodada || b.minuto - a.minuto);
  }

  // Estado inicial conforme a fase pedida.
  const faseInicial: FaseDemo = opcoes.fase ?? 'login';
  if (faseInicial !== 'login' && faseInicial !== 'nova') {
    const t = criarTurma('CBMEDE', 'Curso pré-congresso · Turma 1', 'CBMEDE 2026', '2026-11-25');
    const seq: StatusTurma[] = [];
    if (faseInicial !== 'sala') seq.push('rodada1');
    if (['debrief', 'r2', 'resultado'].includes(faseInicial)) seq.push('debrief');
    if (['r2', 'resultado'].includes(faseInicial)) seq.push('rodada2');
    if (faseInicial === 'resultado') seq.push('encerrada');
    for (const s of seq) {
      // Rodadas já jogadas terminam às 19:00.
      if (s === 'debrief' || s === 'encerrada') t.rodadaInicio = agora() - (MIN_FIM - MIN_INICIO) * 1000;
      mudar(t, s);
    }
  }

  const exigirTurma = (id: string) => porId(id);

  return {
    modo: 'demo',
    faseInicial,

    async login(email, senha) {
      await espera();
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new DadosInvalidos('E-mail inválido');
      if (senha.length < 6) throw new NaoAutorizado('E-mail ou senha incorretos.');
      return { userId: 'facilitador-demo', email: email.trim() };
    },

    async sessaoAtual() {
      return null;
    },

    async sair() {},

    async painelTurma(id) {
      const t = exigirTurma(id);
      batimentos(t);
      return json(t, true);
    },

    async seriesTurma(id) {
      return seriesDe(exigirTurma(id));
    },

    async eventosTurma(id, filtro = {}) {
      return eventosDe(exigirTurma(id))
        .filter((e) => filtro.rodada === undefined || e.rodada === filtro.rodada)
        .filter((e) => filtro.desdeMinuto === undefined || e.minuto >= filtro.desdeMinuto)
        .slice(0, filtro.limite ?? 100);
    },

    async estado(codigo) {
      const t = porCodigo(codigo);
      batimentos(t);
      return json(t, false);
    },

    async ranking(codigo) {
      const t = porCodigo(codigo);
      return [...itensRodada(t, 1), ...itensRodada(t, 2)];
    },

    async abrirTurma(entrada: AbrirTurmaEntrada) {
      await espera();
      const codigo = entrada.codigo.trim().toUpperCase();
      if (!/^[A-Z0-9]{3,16}$/.test(codigo))
        throw new DadosInvalidos('Código: de 3 a 16 letras ou números, sem espaço.');
      const nome = entrada.nome.trim();
      if (nome.length < 2 || nome.length > 80) throw new DadosInvalidos('Nome da turma: de 2 a 80 caracteres.');
      const anterior = ativa(codigo);
      if (anterior) {
        const grupos = anterior.grupos.filter((g) => !g.removido).length;
        const livre = anterior.status === 'encerrada' || (anterior.status === 'aberta' && grupos === 0);
        if (!livre && !entrada.substituir)
          throw new CodigoEmUso(
            `Já existe uma turma ${codigo} em andamento (${anterior.status}, ${grupos} grupos). Confirme para substituir.`,
          );
        anterior.status = 'arquivada';
        anterior.pausadaEm = null;
      }
      const t = criarTurma(
        codigo,
        nome,
        entrada.evento?.trim() || null,
        entrada.data ?? new Date(agora()).toISOString().slice(0, 10),
      );
      return json(t, true);
    },

    async mudarStatus(id, status) {
      await espera();
      const t = exigirTurma(id);
      mudar(t, status);
      return json(t, true);
    },

    async pausar(id) {
      const t = exigirTurma(id);
      if (t.status !== 'rodada1' && t.status !== 'rodada2')
        throw new TransicaoInvalida('Só é possível pausar durante uma rodada.');
      if (t.pausadaEm === null) t.pausadaEm = agora();
      return json(t, true);
    },

    async retomar(id) {
      const t = exigirTurma(id);
      if (t.pausadaEm !== null) {
        t.pausaAcumuladaMs += agora() - t.pausadaEm;
        t.pausadaEm = null;
      }
      return json(t, true);
    },

    async liberarEntrada(id, liberada) {
      const t = exigirTurma(id);
      t.entradaLiberada = liberada;
      return json(t, true);
    },

    async liberarReconexao(grupoId, liberada) {
      const [t, g] = grupoPorId(grupoId);
      g.reconexaoLiberada = liberada;
      return json(t, true);
    },

    async liberarFullCapacity(id, liberado) {
      const t = exigirTurma(id);
      t.fullCapacityLiberado = liberado;
      return json(t, true);
    },

    async alternarMusica(id, mudo) {
      const t = exigirTurma(id);
      t.musicaMudo = mudo;
      return json(t, true);
    },

    async removerGrupo(grupoId) {
      const [t, g] = grupoPorId(grupoId);
      g.removido = true;
      g.reconexaoLiberada = false;
      return json(t, true);
    },

    async gerarRelatorio(id) {
      await espera();
      const t = exigirTurma(id);
      if (t.slug) return { slug: t.slug, turma: json(t, true) };
      if (t.status !== 'encerrada' && t.status !== 'arquivada')
        throw new TransicaoInvalida('O relatório só pode ser gerado depois de encerrar a turma.');
      t.slug = 'demoRelatorioCbmede2026x';
      t.status = 'arquivada';
      return { slug: t.slug, turma: json(t, true) };
    },
  };
}
