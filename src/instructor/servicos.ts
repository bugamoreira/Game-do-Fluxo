// Porta de serviços do painel do facilitador. As telas só conhecem esta
// interface: em produção ela é atendida pelos services de `src/shared/services/`
// (servicosReais.ts); em `?demo=1`, por um serviço falso em memória (demo/).

import type {
  AbrirTurmaEntrada,
  EstadoTurma,
  EventoTurma,
  FiltroEventos,
  ItemRanking,
  PontoSerieTurma,
  SessaoFacilitador,
  StatusTurma,
} from '../shared/schemas';

export interface ServicosFacilitador {
  readonly modo: 'real' | 'demo';
  login(email: string, senha: string): Promise<SessaoFacilitador>;
  /** Sessão salva neste navegador (recarregar a página não pede login de novo). */
  sessaoAtual(): Promise<SessaoFacilitador | null>;
  sair(): Promise<void>;
  /** Avisa quando a sessão muda (login, saída, renovação); devolve o cancelamento. */
  aoMudarSessao(ouvinte: () => void): () => void;
  /** Código de acesso da turma para o telão aberto pela janela do facilitador. */
  codigoAcessoTelao(turmaId: string): Promise<string>;
  /** Leitura pública pelo código (para achar a turma). */
  estado(codigo: string): Promise<EstadoTurma>;
  ranking(codigo: string): Promise<ItemRanking[]>;
  /** Leituras do facilitador: turma com presença e removidos, séries e eventos. */
  painelTurma(turmaId: string): Promise<EstadoTurma>;
  seriesTurma(turmaId: string): Promise<PontoSerieTurma[]>;
  eventosTurma(turmaId: string, filtro?: FiltroEventos): Promise<EventoTurma[]>;
  /** Ações do facilitador: devolvem a turma na visão do facilitador. */
  abrirTurma(entrada: AbrirTurmaEntrada): Promise<EstadoTurma>;
  mudarStatus(turmaId: string, status: StatusTurma): Promise<EstadoTurma>;
  pausar(turmaId: string): Promise<EstadoTurma>;
  retomar(turmaId: string): Promise<EstadoTurma>;
  liberarEntrada(turmaId: string, liberada: boolean): Promise<EstadoTurma>;
  liberarReconexao(grupoId: string, liberada: boolean): Promise<EstadoTurma>;
  liberarFullCapacity(turmaId: string, liberado: boolean): Promise<EstadoTurma>;
  alternarMusica(turmaId: string, mudo: boolean): Promise<EstadoTurma>;
  removerGrupo(grupoId: string): Promise<EstadoTurma>;
  gerarRelatorio(turmaId: string): Promise<{ slug: string; turma?: EstadoTurma }>;
}
