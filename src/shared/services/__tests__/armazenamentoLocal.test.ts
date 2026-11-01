import { describe, expect, it } from 'vitest';
import {
  CHAVE_COPIA,
  CHAVE_SESSAO,
  copiaLocal,
  escolherEstadoParaRestaurar,
  sessaoLocal,
  type ArmazenamentoChaveValor,
} from '../armazenamentoLocal';

function armazenamentoFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  const arm: ArmazenamentoChaveValor = {
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
  };
  return { arm, dados };
}

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
const estado = { versao: 12, rodada: 1 as const, minuto: 500, pacientes: [{ id: 1 }] };

describe('copiaLocal', () => {
  it('salva e lê de volta o estado completo', () => {
    const { arm } = armazenamentoFalso();
    expect(copiaLocal.salvar(TOKEN, estado, 1000, arm)).toBe(true);
    expect(copiaLocal.ler(TOKEN, arm)).toEqual({ formato: 1, token: TOKEN, salvoEm: 1000, estado });
  });

  it('JSON corrompido é descartado e apagado, sem lançar', () => {
    const { arm, dados } = armazenamentoFalso({ [CHAVE_COPIA]: '{"formato":1,"tok' });
    expect(copiaLocal.ler(TOKEN, arm)).toBeNull();
    expect(dados.has(CHAVE_COPIA)).toBe(false);
  });

  it('formato inválido (versão antiga do app, campo faltando) é descartado', () => {
    const antigo = JSON.stringify({ formato: 0, token: TOKEN, salvoEm: 1, estado });
    const semEstado = JSON.stringify({ formato: 1, token: TOKEN, salvoEm: 1 });
    const minutoRuim = JSON.stringify({ formato: 1, token: TOKEN, salvoEm: 1, estado: { ...estado, minuto: 9999 } });
    for (const bruto of [antigo, semEstado, minutoRuim, 'null', '42']) {
      const { arm, dados } = armazenamentoFalso({ [CHAVE_COPIA]: bruto });
      expect(copiaLocal.ler(undefined, arm)).toBeNull();
      expect(dados.has(CHAVE_COPIA)).toBe(false);
    }
  });

  it('cópia de outro grupo não é devolvida', () => {
    const { arm } = armazenamentoFalso();
    copiaLocal.salvar(TOKEN, estado, 1, arm);
    expect(copiaLocal.ler('ZZZdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ', arm)).toBeNull();
  });

  it('armazenamento que lança (cota cheia, modo privado) não derruba o jogo', () => {
    const quebrado: ArmazenamentoChaveValor = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(copiaLocal.salvar(TOKEN, estado, 1, quebrado)).toBe(false);
    expect(copiaLocal.ler(TOKEN, quebrado)).toBeNull();
    expect(() => copiaLocal.limpar(quebrado)).not.toThrow();
  });

  it('sem armazenamento disponível (null) devolve null', () => {
    expect(copiaLocal.ler(TOKEN, null)).toBeNull();
    expect(copiaLocal.salvar(TOKEN, estado, 1, null)).toBe(false);
  });
});

describe('sessaoLocal', () => {
  const sessao = { codigo: 'CBMEDE', grupoId: 'g1', nome: 'Azul', cor: '#1d4ed8', token: TOKEN };

  it('lê a sessão só para a mesma turma', () => {
    const { arm } = armazenamentoFalso();
    sessaoLocal.salvar(sessao, arm);
    expect(sessaoLocal.ler('cbmede', arm)?.token).toBe(TOKEN);
    expect(sessaoLocal.ler('OUTRA', arm)).toBeNull();
  });

  it('sessão corrompida é descartada', () => {
    const { arm, dados } = armazenamentoFalso({ [CHAVE_SESSAO]: '{"formato":1,"codigo":"CBMEDE"}' });
    expect(sessaoLocal.ler(undefined, arm)).toBeNull();
    expect(dados.has(CHAVE_SESSAO)).toBe(false);
  });
});

describe('escolherEstadoParaRestaurar', () => {
  const local = { versao: 10, rodada: 1 as const, minuto: 500 };
  const servidor = { versao: 8, rodada: 1 as const, minuto: 490 };

  it('fica com a maior versão da rodada pedida', () => {
    expect(escolherEstadoParaRestaurar(1, local, servidor)).toBe(local);
    expect(escolherEstadoParaRestaurar(1, null, servidor)).toBe(servidor);
    expect(escolherEstadoParaRestaurar(1, { ...local, versao: 2 }, servidor)).toBe(servidor);
  });

  it('ignora estado de outra rodada; sem nenhum, devolve null', () => {
    expect(escolherEstadoParaRestaurar(2, local, servidor)).toBeNull();
    expect(escolherEstadoParaRestaurar(1, undefined, null)).toBeNull();
  });
});
