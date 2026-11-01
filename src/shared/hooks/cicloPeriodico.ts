// ============================================================
// Ciclo de consulta periódica com backoff (playbook cap. 04, regra 10).
//
// - Nunca sobrepõe requisições: a próxima só é agendada quando a anterior volta.
// - Falha de rede: espera 1 → 2 → 4 → 8 → 15 s (fica em 15 s) e muda o estado
//   de conexão para 'reconectando' e, depois de 5 falhas seguidas, 'offline'.
//   O primeiro sucesso volta a 'online' e ao intervalo normal.
// - Erro de negócio (ex.: turma não encontrada): o servidor respondeu, então a
//   conexão é 'online' e o intervalo é o normal.
// - Outros erros (resposta inválida, erro do servidor): recua no mesmo ritmo
//   do backoff para não martelar o servidor, sem mudar a conexão.
// Sem React: os hooks só embrulham. Testável com fake timers.
// ============================================================

import { SemConexao, ehErroDeNegocio } from '../services/erros';

export type Conexao = 'online' | 'reconectando' | 'offline';

export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;
export const ATRASO_MAXIMO_MS = 15000;

/** Falhas de rede seguidas a partir das quais a conexão é dada como 'offline'. */
export const FALHAS_PARA_OFFLINE = BACKOFF_MS.length;

/** Espera antes da próxima tentativa, dada a quantidade de falhas seguidas (≥ 1). */
export function atrasoBackoff(falhas: number): number {
  const i = Math.min(Math.max(falhas, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[i] ?? ATRASO_MAXIMO_MS;
}

export function conexaoPorFalhas(falhas: number): Conexao {
  if (falhas <= 0) return 'online';
  return falhas < FALHAS_PARA_OFFLINE ? 'reconectando' : 'offline';
}

export type Classificacao = 'rede' | 'recuar' | 'normal';

export function classificarErro(e: unknown): Classificacao {
  if (e instanceof SemConexao) return 'rede';
  if (ehErroDeNegocio(e)) return 'normal';
  return 'recuar';
}

export interface OpcoesCiclo {
  intervaloMs: number;
  /** Uma rodada de trabalho. Devolver `false` = nada a fazer (não conta como sucesso nem falha). */
  executar: () => Promise<boolean | void>;
  aoErro?: (e: unknown) => void;
  aoMudarConexao?: (c: Conexao) => void;
  classificar?: (e: unknown) => Classificacao;
  agora?: () => number;
}

export class CicloPeriodico {
  private ativo = false;
  private emVoo = false;
  private geracao = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private falhasRede = 0;
  private falhasOutras = 0;
  private conexaoAtual: Conexao = 'online';

  constructor(private readonly opcoes: OpcoesCiclo) {}

  get conexao(): Conexao {
    return this.conexaoAtual;
  }

  get falhasDeRede(): number {
    return this.falhasRede;
  }

  /** Começa já (primeira execução imediata). Chamar de novo sem `parar` não faz nada. */
  iniciar(): void {
    if (this.ativo) return;
    this.ativo = true;
    this.geracao += 1;
    this.emVoo = false;
    void this.rodar(this.geracao);
  }

  /** Para de agendar. Uma requisição em voo termina, mas seu resultado é ignorado. */
  parar(): void {
    this.ativo = false;
    this.geracao += 1;
    this.limparTimer();
  }

  /** Antecipa a próxima execução (ex.: o navegador avisou que voltou a rede). Respeita a não sobreposição. */
  tentarAgora(): void {
    if (!this.ativo || this.emVoo) return;
    this.limparTimer();
    void this.rodar(this.geracao);
  }

  private limparTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private mudarConexao(c: Conexao): void {
    if (c === this.conexaoAtual) return;
    this.conexaoAtual = c;
    this.opcoes.aoMudarConexao?.(c);
  }

  private async rodar(g: number): Promise<void> {
    if (!this.ativo || g !== this.geracao || this.emVoo) return;
    this.emVoo = true;
    this.timer = null;
    const agora = this.opcoes.agora ?? Date.now;
    const { intervaloMs } = this.opcoes;
    const inicio = agora();
    let atraso: number;

    try {
      const fez = await this.opcoes.executar();
      if (g !== this.geracao) return;
      if (fez !== false) {
        this.falhasRede = 0;
        this.falhasOutras = 0;
        this.mudarConexao('online');
      }
      // Mantém a cadência: desconta o tempo gasto na requisição.
      atraso = Math.max(0, intervaloMs - (agora() - inicio));
    } catch (e) {
      if (g !== this.geracao) return;
      this.opcoes.aoErro?.(e);
      const tipo = (this.opcoes.classificar ?? classificarErro)(e);
      if (tipo === 'rede') {
        this.falhasRede += 1;
        this.mudarConexao(conexaoPorFalhas(this.falhasRede));
        atraso = atrasoBackoff(this.falhasRede);
      } else {
        this.falhasRede = 0;
        this.mudarConexao('online');
        if (tipo === 'recuar') {
          this.falhasOutras += 1;
          atraso = Math.max(intervaloMs, atrasoBackoff(this.falhasOutras));
        } else {
          this.falhasOutras = 0;
          atraso = intervaloMs;
        }
      }
    } finally {
      if (g === this.geracao) this.emVoo = false;
    }

    if (this.ativo && g === this.geracao) {
      this.timer = setTimeout(() => void this.rodar(g), atraso);
    }
  }
}

/** Base mínima de loja observável para `useSyncExternalStore`. */
export class LojaObservavel<T> {
  private ouvintes = new Set<() => void>();

  constructor(private atual: T) {}

  readonly assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  };

  readonly instantaneo = (): T => this.atual;

  protected atualizar(parcial: Partial<T>): void {
    const proximo = { ...this.atual, ...parcial };
    const mudou = (Object.keys(parcial) as (keyof T)[]).some((k) => !Object.is(this.atual[k], proximo[k]));
    if (!mudou) return;
    this.atual = proximo;
    for (const o of this.ouvintes) o();
  }
}
