// Adaptador de produção: repassa a porta aos services compartilhados
// (únicos módulos que falam com o Supabase). Carregado sob demanda pelo main.tsx,
// para que o modo demonstração não precise das variáveis de ambiente.

import { facilitadorService, relatorioService, turmaService } from '../shared/services';
import type { ServicosFacilitador } from './servicos';

export const servicosReais: ServicosFacilitador = {
  modo: 'real',
  login: (email, senha) => facilitadorService.login(email, senha),
  sair: () => facilitadorService.sair(),
  estado: (codigo) => turmaService.estado(codigo),
  ranking: (codigo) => turmaService.ranking(codigo),
  abrirTurma: (entrada) => facilitadorService.abrirTurma(entrada),
  mudarStatus: (id, status) => facilitadorService.mudarStatus(id, status),
  pausar: (id) => facilitadorService.pausar(id),
  retomar: (id) => facilitadorService.retomar(id),
  liberarEntrada: (id, liberada) => facilitadorService.liberarEntrada(id, liberada),
  liberarReconexao: (grupoId, liberada) => facilitadorService.liberarReconexao(grupoId, liberada),
  liberarFullCapacity: (id, liberado) => facilitadorService.liberarFullCapacity(id, liberado),
  alternarMusica: (id, mudo) => facilitadorService.alternarMusica(id, mudo),
  removerGrupo: (grupoId) => facilitadorService.removerGrupo(grupoId),
  gerarRelatorio: (id) => relatorioService.gerar(id),
};
