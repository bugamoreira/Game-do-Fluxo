// Porta de serviços do painel do facilitador. As telas só conhecem esta
// interface: em produção ela é atendida pelos services de `src/shared/services/`
// (servicosReais.ts); em `?demo=1`, por um serviço falso em memória (demo/).

import type { AbrirTurmaEntrada, EstadoTurma, ItemRanking, SessaoFacilitador, StatusTurma } from '../shared/schemas';

export interface ServicosFacilitador {
  readonly modo: 'real' | 'demo';
  login(email: string, senha: string): Promise<SessaoFacilitador>;
  sair(): Promise<void>;
  /** Leitura pública (consulta periódica). */
  estado(codigo: string): Promise<EstadoTurma>;
  ranking(codigo: string): Promise<ItemRanking[]>;
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
  gerarRelatorio(turmaId: string): Promise<{ slug: string }>;
}
