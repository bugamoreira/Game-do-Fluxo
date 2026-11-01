// ============================================================
// Leitura periódica do facilitador (séries, eventos, código de acesso) sobre o
// CicloPeriodico: nunca sobrepõe requisições nem aplica resposta fora de ordem
// (a próxima só sai quando a anterior volta; `parar` descarta a que estiver em voo).
//
// `NaoAutorizado` (sessão expirada ou de outro usuário) não trava para sempre:
// a leitura fica suspensa por `esperaRecusaMs` e tenta de novo; `reautorizar()`
// (a sessão mudou) tenta na hora.
// Sem React (testada em __tests__/leituraPeriodica.test.ts).
// ============================================================

import { NaoAutorizado } from '../services/erros';
import { CicloPeriodico } from './cicloPeriodico';

export const ESPERA_RECUSA_MS = 30_000;

export interface OpcoesLeitura<T> {
  intervaloMs: number;
  ler: () => Promise<T>;
  aoLer: (valor: T) => void;
  /** O servidor recusou (sem sessão de facilitador): a tela volta aos dados públicos. */
  aoRecusar?: () => void;
  esperaRecusaMs?: number;
  agora?: () => number;
}

export class LeituraPeriodica<T> {
  private readonly ciclo: CicloPeriodico;
  private recusadoEm: number | null = null;
  /** Muda a cada iniciar/parar: resposta de uma geração antiga não é aplicada. */
  private geracao = 0;
  private readonly agora: () => number;

  constructor(private readonly opcoes: OpcoesLeitura<T>) {
    this.agora = opcoes.agora ?? Date.now;
    this.ciclo = new CicloPeriodico({
      intervaloMs: opcoes.intervaloMs,
      agora: this.agora,
      executar: () => this.executar(),
    });
  }

  get recusado(): boolean {
    return this.recusadoEm !== null;
  }

  iniciar(): void {
    this.geracao += 1;
    this.ciclo.iniciar();
  }

  parar(): void {
    this.geracao += 1;
    this.ciclo.parar();
  }

  tentarAgora(): void {
    this.ciclo.tentarAgora();
  }

  /** A sessão mudou (login, renovação do token): esquece a recusa e lê já. */
  reautorizar(): void {
    this.recusadoEm = null;
    this.ciclo.tentarAgora();
  }

  private async executar(): Promise<boolean> {
    const espera = this.opcoes.esperaRecusaMs ?? ESPERA_RECUSA_MS;
    if (this.recusadoEm !== null && this.agora() - this.recusadoEm < espera) return false;
    const g = this.geracao;
    try {
      const valor = await this.opcoes.ler();
      if (g !== this.geracao) return false;
      this.recusadoEm = null;
      this.opcoes.aoLer(valor);
      return true;
    } catch (e) {
      if (g !== this.geracao) return false;
      if (e instanceof NaoAutorizado) {
        this.recusadoEm = this.agora();
        this.opcoes.aoRecusar?.();
      }
      throw e;
    }
  }
}
