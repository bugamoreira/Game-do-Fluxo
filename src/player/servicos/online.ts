// Porta online: services e hooks compartilhados (src/shared). Carregado sob
// demanda pelo main.tsx, para o modo solo e a demonstração não abrirem o cliente Supabase.

import { useEstadoTurma, useRanking, useSincronizarJogo } from '../../shared/hooks';
import { copiaLocal, grupoService, sessaoLocal, syncService, turmaService } from '../../shared/services';
import type { PortaJogo } from './porta';

export const portaOnline: PortaJogo = {
  modo: 'online',
  entrar: (codigo, nome, token, acesso) => grupoService.entrar(codigo, nome, token, acesso),
  consultarTurma: async codigo => ({ id: (await turmaService.estado(codigo)).id }),
  obterEstado: (token, rodada) => syncService.obterEstado(token, rodada),
  useEstadoTurma,
  useSincronizarJogo,
  useRanking,
  sessao: {
    ler: codigo => sessaoLocal.ler(codigo),
    salvar: s => {
      sessaoLocal.salvar(s);
    },
    limpar: () => sessaoLocal.limpar(),
  },
  lerCopia: token => copiaLocal.ler(token)?.estado ?? null,
};
