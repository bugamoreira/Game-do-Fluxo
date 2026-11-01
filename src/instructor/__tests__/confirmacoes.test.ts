import { describe, expect, it } from 'vitest';
import { confirmacaoPara, textoConfere } from '../logica/confirmacoes';
import type { GrupoPainel } from '../logica/fases';

const grupo = (id: string, conectado = true, removido = false): GrupoPainel => ({
  id,
  nome: `Grupo ${id}`,
  cor: '#2563EB',
  conectado,
  vistoHaS: conectado ? 0 : 40,
  reconexaoLiberada: false,
  removido,
});

describe('confirmacaoPara', () => {
  it('iniciar com todos conectados segue direto', () => {
    expect(confirmacaoPara({ tipo: 'iniciar', rodada: 1, grupos: [grupo('A'), grupo('B')] })).toBeNull();
  });

  it('iniciar o Lean sempre confirma, mesmo com todos conectados', () => {
    const c = confirmacaoPara({ tipo: 'iniciar', rodada: 2, grupos: [grupo('A'), grupo('B')] });
    expect(c).not.toBeNull();
    expect(c!.titulo).toBe('Iniciar o Plantão Lean?');
    expect(c!.rotuloConfirmar).toBe('Iniciar Plantão Lean');
  });

  it('iniciar ignora grupos removidos', () => {
    expect(confirmacaoPara({ tipo: 'iniciar', rodada: 1, grupos: [grupo('A'), grupo('X', false, true)] })).toBeNull();
  });

  it('iniciar com grupo desconectado pede confirmação e cita os nomes', () => {
    const c = confirmacaoPara({
      tipo: 'iniciar',
      rodada: 2,
      grupos: [grupo('A'), grupo('B', false), grupo('C', false)],
    });
    expect(c).not.toBeNull();
    expect(c!.titulo).toBe('Iniciar o Plantão Lean com 2 grupos sem conexão?');
    expect(c!.descricao).toContain('Grupo B e Grupo C');
    expect(c!.destrutiva).toBe(false);
  });

  it('encerrar sempre confirma e avisa quando é antes das 19:00', () => {
    const antes = confirmacaoPara({ tipo: 'encerrar', rodada: 1, minuto: 900 })!;
    expect(antes.destrutiva).toBe(true);
    expect(antes.descricao).toContain('15:00');
    expect(antes.descricao).toContain('o debrief');
    const fim = confirmacaoPara({ tipo: 'encerrar', rodada: 2, minuto: 1140 })!;
    expect(fim.descricao).not.toContain('ainda está');
    expect(fim.descricao).toContain('o resultado final');
  });

  it('remover grupo confirma e deixa claro que os dados ficam guardados', () => {
    const c = confirmacaoPara({ tipo: 'removerGrupo', nome: 'Leito Zero' })!;
    expect(c.destrutiva).toBe(true);
    expect(c.descricao).toContain('ficam guardados');
  });

  it('liberar reconexão explica para que serve', () => {
    const c = confirmacaoPara({ tipo: 'liberarReconexao', nome: 'Leito Zero' })!;
    expect(c.descricao).toContain('trocou de computador');
    expect(c.descricao).toContain('única entrada');
  });

  it('substituir turma repete a frase do servidor', () => {
    const c = confirmacaoPara({
      tipo: 'substituirTurma',
      codigo: 'CBMEDE',
      detalhe: 'Já existe uma turma CBMEDE em andamento.',
    })!;
    expect(c.descricao.startsWith('Já existe uma turma CBMEDE em andamento.')).toBe(true);
    expect(c.destrutiva).toBe(true);
  });

  it('nova turma exige digitar o código (confirmação forte)', () => {
    const c = confirmacaoPara({ tipo: 'novaTurma', codigo: 'CBMEDE' })!;
    expect(c.digitar).toBe('CBMEDE');
    expect(c.destrutiva).toBe(true);
  });
});

describe('textoConfere', () => {
  it('não diferencia maiúsculas nem espaços nas pontas', () => {
    expect(textoConfere(' cbmede ', 'CBMEDE')).toBe(true);
    expect(textoConfere('CBMED', 'CBMEDE')).toBe(false);
    expect(textoConfere('', 'CBMEDE')).toBe(false);
  });
});
