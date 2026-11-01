// ============================================================
// Erros tipados dos services (docs/contratos.md §2; playbook cap. 04, regra 15).
//
// As telas decidem o que mostrar pelo tipo (`instanceof`) ou pelo `codigo`,
// nunca pelo texto. A mensagem já vem pronta para o usuário, em português:
// é a frase que o servidor manda em `error.details` (docs/schema.md, "Erros"),
// ou um texto padrão quando ela não vem.
// ============================================================

export type CodigoErro =
  | 'TURMA_NAO_ENCONTRADA'
  | 'ENTRADA_FECHADA'
  | 'GRUPO_JA_ATIVO'
  | 'TOKEN_INVALIDO'
  | 'VERSAO_ANTIGA'
  | 'NAO_AUTORIZADO'
  | 'TRANSICAO_INVALIDA'
  | 'DADOS_INVALIDOS'
  | 'RODADA_INVALIDA'
  | 'TURMA_CHEIA'
  | 'CODIGO_EM_USO'
  | 'RELATORIO_NAO_ENCONTRADO'
  | 'CODIGO_ACESSO_INVALIDO'
  | 'SEM_CONEXAO'
  | 'RESPOSTA_INVALIDA'
  | 'ERRO_SERVICO';

export abstract class ErroSimulador extends Error {
  abstract readonly codigo: CodigoErro;
  constructor(
    mensagem: string,
    readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = new.target.name;
  }
}

export class TurmaNaoEncontrada extends ErroSimulador {
  readonly codigo = 'TURMA_NAO_ENCONTRADA' as const;
  constructor(mensagem = 'Sala não encontrada. Confira o código.', causa?: unknown) {
    super(mensagem, causa);
  }
}

export class EntradaFechada extends ErroSimulador {
  readonly codigo = 'ENTRADA_FECHADA' as const;
  constructor(mensagem = 'A rodada já começou. Fale com o facilitador.', causa?: unknown) {
    super(mensagem, causa);
  }
}

export class GrupoJaAtivo extends ErroSimulador {
  readonly codigo = 'GRUPO_JA_ATIVO' as const;
  constructor(
    mensagem = 'Esse grupo já está no jogo. Se é o seu, peça ao facilitador para liberar a reconexão.',
    causa?: unknown,
  ) {
    super(mensagem, causa);
  }
}

export class TokenInvalido extends ErroSimulador {
  readonly codigo = 'TOKEN_INVALIDO' as const;
  constructor(mensagem = 'Sessão do grupo não reconhecida. Entre de novo pela tela inicial.', causa?: unknown) {
    super(mensagem, causa);
  }
}

export class VersaoAntiga extends ErroSimulador {
  readonly codigo = 'VERSAO_ANTIGA' as const;
  constructor(mensagem = 'O servidor já tem uma versão mais nova deste jogo.', causa?: unknown) {
    super(mensagem, causa);
  }
}

export class NaoAutorizado extends ErroSimulador {
  readonly codigo = 'NAO_AUTORIZADO' as const;
  constructor(mensagem = 'Acesso não autorizado.', causa?: unknown) {
    super(mensagem, causa);
  }
}

/** Transição fora da máquina de estados (ou pausar fora de rodada, relatório antes de encerrar). */
export class TransicaoInvalida extends ErroSimulador {
  readonly codigo = 'TRANSICAO_INVALIDA' as const;
  constructor(mensagem = 'Essa ação não é possível agora.', causa?: unknown) {
    super(mensagem, causa);
  }
}

/** Dado recusado: pelo schema antes de sair do navegador, ou pelo servidor (`DADOS_INVALIDOS`). */
export class DadosInvalidos extends ErroSimulador {
  readonly codigo = 'DADOS_INVALIDOS' as const;
  constructor(mensagem = 'Dados inválidos.', causa?: unknown) {
    super(mensagem, causa);
  }
}

/** Envio para uma rodada que não é a atual (ou depois dos 30 s de tolerância do "Encerrar"). */
export class RodadaInvalida extends ErroSimulador {
  readonly codigo = 'RODADA_INVALIDA' as const;
  constructor(mensagem = 'Esta rodada não está em andamento.', causa?: unknown) {
    super(mensagem, causa);
  }
}

export class TurmaCheia extends ErroSimulador {
  readonly codigo = 'TURMA_CHEIA' as const;
  constructor(mensagem = 'A sala já está com o número máximo de grupos. Fale com o facilitador.', causa?: unknown) {
    super(mensagem, causa);
  }
}

/** `abrir_turma` com turma em andamento de mesmo código: confirmar e chamar de novo com `substituir`. */
export class CodigoEmUso extends ErroSimulador {
  readonly codigo = 'CODIGO_EM_USO' as const;
  constructor(mensagem = 'Já existe uma turma em andamento com esse código.', causa?: unknown) {
    super(mensagem, causa);
  }
}

export class RelatorioNaoEncontrado extends ErroSimulador {
  readonly codigo = 'RELATORIO_NAO_ENCONTRADO' as const;
  constructor(mensagem = 'Relatório não encontrado. Confira o link.', causa?: unknown) {
    super(mensagem, causa);
  }
}

/** Grupo novo ou reconexão liberada sem o código de acesso de 4 dígitos certo (aparece no telão). */
export class CodigoAcessoInvalido extends ErroSimulador {
  readonly codigo = 'CODIGO_ACESSO_INVALIDO' as const;
  constructor(mensagem = 'Código de acesso incorreto. Confira no telão.', causa?: unknown) {
    super(mensagem, causa);
  }
}

export class SemConexao extends ErroSimulador {
  readonly codigo = 'SEM_CONEXAO' as const;
  constructor(mensagem = 'Sem conexão com o servidor. Tentando de novo…', causa?: unknown) {
    super(mensagem, causa);
  }
}

/** O servidor respondeu, mas fora do formato esperado (schema Zod recusou). */
export class RespostaInvalida extends ErroSimulador {
  readonly codigo = 'RESPOSTA_INVALIDA' as const;
  constructor(
    readonly operacao: string,
    causa?: unknown,
  ) {
    super(`Resposta inesperada do servidor (${operacao}).`, causa);
  }
}

/**
 * Qualquer outra falha do servidor (ex.: `LIMITE_EXCEDIDO`, função inexistente,
 * erro interno). `codigoServidor` guarda o código recebido, se houver.
 */
export class ErroServico extends ErroSimulador {
  readonly codigo = 'ERRO_SERVICO' as const;
  constructor(
    mensagem = 'Erro no servidor. Tente de novo.',
    causa?: unknown,
    readonly codigoServidor?: string,
  ) {
    super(mensagem, causa);
  }
}

/** Erro de negócio: o servidor entendeu o pedido e recusou. Não adianta insistir mais rápido. */
export function ehErroDeNegocio(e: unknown): boolean {
  return (
    e instanceof TurmaNaoEncontrada ||
    e instanceof EntradaFechada ||
    e instanceof GrupoJaAtivo ||
    e instanceof TokenInvalido ||
    e instanceof VersaoAntiga ||
    e instanceof NaoAutorizado ||
    e instanceof TransicaoInvalida ||
    e instanceof DadosInvalidos ||
    e instanceof RodadaInvalida ||
    e instanceof TurmaCheia ||
    e instanceof CodigoEmUso ||
    e instanceof RelatorioNaoEncontrado ||
    e instanceof CodigoAcessoInvalido
  );
}

// ── Mapeamento das respostas de erro do PostgREST/RPC ─────────

/** Formato do erro devolvido pelo supabase-js (PostgrestError) e pelo Auth. */
export interface ErroBruto {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  name?: string | null;
}

type Fabrica = (mensagem: string | undefined, causa: unknown) => ErroSimulador;

// Contrato do banco (docs/schema.md, "Erros"): `message` = código estável,
// `details` = frase para a tela, `hint` = código, SQLSTATE próprio CB001–CB014.
const POR_CODIGO: Readonly<Record<string, Fabrica>> = {
  TURMA_NAO_ENCONTRADA: (m, c) => new TurmaNaoEncontrada(m, c),
  ENTRADA_FECHADA: (m, c) => new EntradaFechada(m, c),
  GRUPO_JA_ATIVO: (m, c) => new GrupoJaAtivo(m, c),
  TOKEN_INVALIDO: (m, c) => new TokenInvalido(m, c),
  VERSAO_ANTIGA: (m, c) => new VersaoAntiga(m, c),
  NAO_AUTORIZADO: (m, c) => new NaoAutorizado(m, c),
  TRANSICAO_INVALIDA: (m, c) => new TransicaoInvalida(m, c),
  DADOS_INVALIDOS: (m, c) => new DadosInvalidos(m, c),
  RODADA_INVALIDA: (m, c) => new RodadaInvalida(m, c),
  TURMA_CHEIA: (m, c) => new TurmaCheia(m, c),
  CODIGO_EM_USO: (m, c) => new CodigoEmUso(m, c),
  RELATORIO_NAO_ENCONTRADO: (m, c) => new RelatorioNaoEncontrado(m, c),
  CODIGO_ACESSO_INVALIDO: (m, c) => new CodigoAcessoInvalido(m, c),
};

const POR_SQLSTATE: Readonly<Record<string, string>> = {
  CB001: 'TURMA_NAO_ENCONTRADA',
  CB002: 'ENTRADA_FECHADA',
  CB003: 'GRUPO_JA_ATIVO',
  CB004: 'TOKEN_INVALIDO',
  CB005: 'VERSAO_ANTIGA',
  CB006: 'NAO_AUTORIZADO',
  CB007: 'TRANSICAO_INVALIDA',
  CB008: 'DADOS_INVALIDOS',
  CB009: 'RODADA_INVALIDA',
  CB010: 'TURMA_CHEIA',
  CB011: 'CODIGO_EM_USO',
  CB012: 'RELATORIO_NAO_ENCONTRADO',
  CB013: 'LIMITE_EXCEDIDO',
  CB014: 'CODIGO_ACESSO_INVALIDO',
};

const IDENTIFICADOR = /^[A-Z][A-Z0-9_]+$/;

/** Código estável do erro: `message`, `hint` ou o SQLSTATE próprio. */
function codigoDoServidor(erro: ErroBruto): string | undefined {
  for (const campo of [erro.message, erro.hint]) {
    const v = campo?.trim();
    if (v && IDENTIFICADOR.test(v)) return v;
  }
  return erro.code ? POR_SQLSTATE[erro.code] : undefined;
}

/** Sinais de falha de transporte (rede caiu, proxy fora, tempo esgotado). */
function ehFalhaDeTransporte(erro: ErroBruto, status: number | undefined): boolean {
  if (status === 0) return true;
  if (status === 408 || status === 502 || status === 503 || status === 504) return true;
  const texto = `${erro.name ?? ''} ${erro.message ?? ''}`.toLowerCase();
  return /failed to fetch|fetcherror|networkerror|network request failed|load failed|aborterror|timeouterror|authretryablefetcherror/.test(
    texto,
  );
}

/**
 * Converte o erro de uma RPC no erro tipado correspondente.
 * @param status status HTTP devolvido pelo supabase-js (0 = a requisição nem chegou ao servidor)
 */
export function mapearErroRpc(erro: ErroBruto, status?: number): ErroSimulador {
  const codigo = codigoDoServidor(erro);
  const frase = erro.details?.trim() || undefined;

  if (codigo) {
    const fabrica = POR_CODIGO[codigo];
    if (fabrica) return fabrica(frase, erro);
    return new ErroServico(frase, erro, codigo); // ex.: LIMITE_EXCEDIDO
  }

  if (ehFalhaDeTransporte(erro, status)) return new SemConexao(undefined, erro);

  // Sem EXECUTE (anon chamando RPC de facilitador): 401 "permission denied"; 42501 = insufficient_privilege.
  if (erro.code === '42501' || status === 401 || status === 403) return new NaoAutorizado(undefined, erro);

  return new ErroServico(undefined, erro);
}
