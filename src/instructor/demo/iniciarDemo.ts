// Monta o modo demonstração a partir da URL:
//   instrutor.html?demo=1                 → login (qualquer e-mail válido e senha com 6+ caracteres)
//   instrutor.html?demo=1&fase=nova       → já logado, formulário de nova turma
//   instrutor.html?demo=1&fase=sala|r1|debrief|r2|resultado → já logado, turma nessa fase

import type { SessaoFacilitador } from '../../shared/schemas';
import type { ServicosFacilitador } from '../servicos';
import { criarServicoDemo, type FaseDemo } from './servicoDemo';

const FASES: readonly FaseDemo[] = ['login', 'nova', 'sala', 'r1', 'debrief', 'r2', 'resultado'];

export function iniciarDemo(parametros: URLSearchParams): {
  servicos: ServicosFacilitador;
  sessaoInicial: SessaoFacilitador | null;
  codigoInicial: string | null;
} {
  const pedida = parametros.get('fase');
  const fase = FASES.find((f) => f === pedida) ?? 'login';
  const servicos = criarServicoDemo({ fase });
  const logado = fase !== 'login';
  return {
    servicos,
    sessaoInicial: logado ? { userId: 'facilitador-demo', email: 'facilitador@demo.cbmede' } : null,
    codigoInicial: fase === 'login' || fase === 'nova' ? null : 'CBMEDE',
  };
}
