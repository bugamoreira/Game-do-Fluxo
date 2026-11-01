// ============================================================
// Trava por aba: um grupo, um motor. Duas abas do mesmo grupo no mesmo
// navegador rodariam dois motores e brigariam pelas versões no servidor.
//
// Protocolo (BroadcastChannel, só entre abas do mesmo navegador):
// - a aba que abre pergunta "quem" está com o grupo e espera ESPERA_MS;
// - a dona responde "aqui": a nova fica como "outra" (não roda o jogo);
// - sem resposta, a nova vira dona;
// - "assumir" passa a vez: a antiga dona vira "outra" e para.
// Duas abas abertas ao mesmo tempo: fica a de identificador menor.
// Sem BroadcastChannel (navegador antigo), cada aba é dona (comportamento anterior).
// Sem React (testada em __tests__/travaAba.test.ts).
// ============================================================

export type SituacaoAba = 'verificando' | 'dona' | 'outra';

export const ESPERA_MS = 300;
export const NOME_CANAL = 'simulador:trava-aba';

type Mensagem = { tipo: 'quem' | 'aqui' | 'assumir'; chave: string; aba: string };

/** O mínimo de um BroadcastChannel (permite injetar um falso nos testes). */
export interface CanalAbas {
  postMessage(m: Mensagem): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

function ehMensagem(v: unknown): v is Mensagem {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (m.tipo === 'quem' || m.tipo === 'aqui' || m.tipo === 'assumir') && typeof m.chave === 'string' && typeof m.aba === 'string';
}

function canalPadrao(): CanalAbas | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(NOME_CANAL) as unknown as CanalAbas);
  } catch {
    return null;
  }
}

export class TravaAba {
  private situacaoAtual: SituacaoAba = 'verificando';
  private canal: CanalAbas | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly ouvintes = new Set<(s: SituacaoAba) => void>();

  constructor(
    private readonly chave: string,
    private readonly aba: string = Math.random().toString(36).slice(2) + Date.now().toString(36),
    private readonly abrirCanal: () => CanalAbas | null = canalPadrao,
  ) {}

  get situacao(): SituacaoAba {
    return this.situacaoAtual;
  }

  assinar(ouvinte: (s: SituacaoAba) => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  }

  iniciar(): void {
    this.canal = this.abrirCanal();
    if (!this.canal) {
      this.mudar('dona');
      return;
    }
    this.canal.onmessage = (ev) => this.receber(ev.data);
    this.mudar('verificando');
    this.enviar('quem');
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.situacaoAtual === 'verificando') this.mudar('dona');
    }, ESPERA_MS);
  }

  /** Esta aba passa a rodar o jogo; a outra para. */
  assumir(): void {
    this.limparTimer();
    this.enviar('assumir');
    this.mudar('dona');
  }

  parar(): void {
    this.limparTimer();
    if (this.canal) {
      this.canal.onmessage = null;
      this.canal.close();
      this.canal = null;
    }
    this.ouvintes.clear();
  }

  private receber(dado: unknown): void {
    if (!ehMensagem(dado) || dado.chave !== this.chave || dado.aba === this.aba) return;
    if (dado.tipo === 'quem') {
      if (this.situacaoAtual === 'dona') this.enviar('aqui');
      else if (this.situacaoAtual === 'verificando') {
        // Abertas ao mesmo tempo: a de identificador menor fica com o grupo.
        if (dado.aba < this.aba) this.virarOutra();
        else this.enviar('aqui');
      }
    } else if (dado.tipo === 'aqui') {
      if (this.situacaoAtual === 'verificando') this.virarOutra();
    } else if (this.situacaoAtual === 'dona' || this.situacaoAtual === 'verificando') {
      this.virarOutra();
    }
  }

  private virarOutra(): void {
    this.limparTimer();
    this.mudar('outra');
  }

  private enviar(tipo: Mensagem['tipo']): void {
    try {
      this.canal?.postMessage({ tipo, chave: this.chave, aba: this.aba });
    } catch {
      // canal fechado: nada a fazer
    }
  }

  private limparTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private mudar(s: SituacaoAba): void {
    if (s === this.situacaoAtual && s !== 'verificando') return;
    this.situacaoAtual = s;
    for (const o of this.ouvintes) o(s);
  }
}
