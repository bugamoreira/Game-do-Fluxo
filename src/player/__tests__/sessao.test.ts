import { describe, expect, it } from 'vitest';
import type { SessaoLocal } from '../../shared/schemas/sync.schema';
import { ehStatusFinal, podeReentrarSozinho, tokenParaNome } from '../jogo/sessao';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
const sessao = (extra: Partial<SessaoLocal> = {}): SessaoLocal => ({
  formato: 1,
  codigo: 'CBMEDE',
  turmaId: 't1',
  grupoId: 'g1',
  nome: 'Os Fluxistas',
  cor: '#1E88E5',
  token: TOKEN,
  ...extra,
});

describe('tokenParaNome (J1 com a sessão deste computador)', () => {
  it('nome igual ao da sessão, sem diferenciar maiúsculas e espaços, envia o token', () => {
    expect(tokenParaNome(sessao(), 't1', '  os   FLUXISTAS ')).toBe(TOKEN);
  });

  it('outro nome, outra turma ou sem sessão: entra sem token', () => {
    expect(tokenParaNome(sessao(), 't1', 'Leito Livre')).toBeNull();
    expect(tokenParaNome(sessao(), 't2', 'Os Fluxistas')).toBeNull();
    expect(tokenParaNome(null, 't1', 'Os Fluxistas')).toBeNull();
  });
});

describe('podeReentrarSozinho (sessão antiga do mesmo código)', () => {
  it('só reentra sozinho na mesma turma', () => {
    expect(podeReentrarSozinho(sessao(), 't1')).toBe(true);
    expect(podeReentrarSozinho(sessao(), 't2')).toBe(false);
  });

  it('sessão sem turma registrada (formato antigo) vai para a J1', () => {
    expect(podeReentrarSozinho(sessao({ turmaId: undefined }), 't1')).toBe(false);
  });

  it('sem rede para conferir a turma, reentra com a sessão para seguir com a cópia local', () => {
    expect(podeReentrarSozinho(sessao(), null)).toBe(true);
    expect(podeReentrarSozinho(null, null)).toBe(false);
  });
});

describe('ehStatusFinal', () => {
  it('encerrada e arquivada são finais', () => {
    expect(ehStatusFinal('encerrada')).toBe(true);
    expect(ehStatusFinal('arquivada')).toBe(true);
    expect(ehStatusFinal('rodada2')).toBe(false);
  });
});
