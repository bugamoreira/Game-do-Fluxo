import { describe, expect, it } from 'vitest';
import type { GrupoDaTurma, StatusTurma } from '../../shared/schemas';
import {
  contarProntos,
  esperaParaLeanS,
  faseDoStatus,
  fasesAlcancadas,
  linkRelatorio,
  linkTelao,
  montarGrupos,
  proximaAcao,
  rotuloProntos,
  textoPresenca,
  type GrupoPainel,
} from '../logica/fases';

const grupo = (parcial: Partial<GrupoPainel> & { id: string }): GrupoPainel => ({
  nome: `Grupo ${parcial.id}`,
  cor: '#2563EB',
  conectado: true,
  vistoHaS: 0,
  reconexaoLiberada: false,
  removido: false,
  ...parcial,
});

const turma = (
  status: StatusTurma,
  extra: { pausada?: boolean; fullCapacityLiberado?: boolean; rodadaFim?: string; horaServidor?: string } = {},
) => ({
  status,
  codigo: 'CBMEDE',
  pausada: extra.pausada ?? false,
  fullCapacityLiberado: extra.fullCapacityLiberado ?? false,
  ...(extra.rodadaFim ? { rodadaFim: extra.rodadaFim } : {}),
  ...(extra.horaServidor ? { horaServidor: extra.horaServidor } : {}),
});

describe('faseDoStatus', () => {
  it('deriva a tela só do status da turma', () => {
    expect(faseDoStatus('aberta')).toBe('sala');
    expect(faseDoStatus('rodada1')).toBe('aovivo');
    expect(faseDoStatus('debrief')).toBe('debrief');
    expect(faseDoStatus('rodada2')).toBe('aovivo');
    expect(faseDoStatus('encerrada')).toBe('resultado');
    expect(faseDoStatus('arquivada')).toBe('resultado');
  });

  it('libera na barra lateral só as fases já alcançadas', () => {
    expect(fasesAlcancadas('aberta')).toEqual(['sala']);
    expect(fasesAlcancadas('rodada1')).toEqual(['sala', 'aovivo']);
    expect(fasesAlcancadas('debrief')).toEqual(['sala', 'aovivo', 'debrief']);
    expect(fasesAlcancadas('rodada2')).toEqual(['sala', 'aovivo']);
    expect(fasesAlcancadas('encerrada')).toEqual(['sala', 'aovivo', 'debrief', 'resultado']);
  });
});

describe('grupos prontos', () => {
  it('conta só os ativos e lista os desconectados', () => {
    const gs = [
      grupo({ id: 'a' }),
      grupo({ id: 'b', conectado: false }),
      grupo({ id: 'c', removido: true, conectado: false }),
    ];
    const r = contarProntos(gs);
    expect(r.conectados).toBe(1);
    expect(r.total).toBe(2);
    expect(r.desconectados.map((g) => g.id)).toEqual(['b']);
  });

  it('escreve o rótulo com plural correto', () => {
    expect(rotuloProntos(0, 0)).toBe('Nenhum grupo na sala');
    expect(rotuloProntos(1, 1)).toBe('1 grupo pronto');
    expect(rotuloProntos(6, 6)).toBe('6 grupos prontos');
    expect(rotuloProntos(5, 6)).toBe('5 de 6 grupos prontos');
  });

  it('descreve a presença', () => {
    expect(textoPresenca(grupo({ id: 'a' }))).toBe('Conectado');
    expect(textoPresenca(grupo({ id: 'a', conectado: false, vistoHaS: 48 }))).toBe('Visto há 48 s');
    expect(textoPresenca(grupo({ id: 'a', conectado: false, vistoHaS: 130 }))).toBe('Visto há 2 min');
    expect(textoPresenca(grupo({ id: 'a', conectado: false, vistoHaS: null }))).toBe('Sem sinal');
    expect(textoPresenca(grupo({ id: 'a', removido: true }))).toBe('Removido');
  });
});

describe('montarGrupos', () => {
  const publico: GrupoDaTurma[] = [
    { id: 'a', nome: 'A', cor: '#2563EB', conectado: true },
    { id: 'b', nome: 'B', cor: '#7C3AED', conectado: false },
  ];

  it('junta a visão do facilitador e mostra removidos que a leitura pública omite', () => {
    const visao: GrupoDaTurma[] = [
      { ...publico[0]!, reconexaoLiberada: true, removido: false, vistoEm: '2026-11-25T10:00:00Z' },
      { ...publico[1]!, reconexaoLiberada: false, removido: false, vistoEm: '2026-11-25T10:00:00Z' },
      { id: 'c', nome: 'C', cor: '#DB2777', conectado: false, removido: true, vistoEm: null },
    ];
    const agora = Date.parse('2026-11-25T10:00:30Z');
    const gs = montarGrupos(publico, visao, new Map(), (i) => Date.parse(i), agora);
    expect(gs.map((g) => [g.id, g.removido])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ]);
    expect(gs[0]!.reconexaoLiberada).toBe(true);
    expect(gs[1]!.vistoHaS).toBe(30);
  });

  it('usa a última vez que o próprio painel viu o grupo, se for mais recente', () => {
    const agora = 100_000;
    const gs = montarGrupos(publico, null, new Map([['b', 90_000]]), () => null, agora);
    expect(gs[1]!.vistoHaS).toBe(10);
    expect(gs[0]!.vistoHaS).toBe(0);
  });
});

describe('proximaAcao', () => {
  const seis = Array.from({ length: 6 }, (_, i) => grupo({ id: String(i) }));

  it('na sala vazia, só aguarda', () => {
    expect(proximaAcao(turma('aberta'), null, []).acao).toBeNull();
  });

  it('com grupos, oferece iniciar o Travado', () => {
    const p = proximaAcao(turma('aberta'), null, seis);
    expect(p.acao).toBe('iniciarR1');
    expect(p.texto).toContain('6 grupos prontos');
  });

  it('na rodada pausada, oferece retomar', () => {
    expect(proximaAcao(turma('rodada1', { pausada: true }), 700, seis).acao).toBe('retomar');
  });

  it('às 19:00, oferece encerrar a rodada', () => {
    expect(proximaAcao(turma('rodada1'), 1140, seis).acao).toBe('encerrar');
    expect(proximaAcao(turma('rodada2', { fullCapacityLiberado: true }), 1140, seis).acao).toBe('encerrar');
  });

  it('durante a rodada, acompanha', () => {
    const p = proximaAcao(turma('rodada1'), 645, seis);
    expect(p.acao).toBeNull();
    expect(p.texto).toContain('Faltam 8h15');
  });

  it('no Lean, sugere liberar o PCP a partir das 11h, só uma vez', () => {
    expect(proximaAcao(turma('rodada2'), 600, seis).acao).toBeNull();
    expect(proximaAcao(turma('rodada2'), 660, seis).acao).toBe('liberarFullCapacity');
    expect(proximaAcao(turma('rodada2', { fullCapacityLiberado: true }), 700, seis).acao).toBeNull();
  });

  it('segue o roteiro até a nova turma', () => {
    expect(proximaAcao(turma('debrief'), null, seis).acao).toBe('iniciarR2');
    expect(proximaAcao(turma('encerrada'), null, seis).acao).toBe('gerarRelatorio');
    expect(proximaAcao(turma('arquivada'), null, seis, false).acao).toBe('gerarRelatorio');
    expect(proximaAcao(turma('arquivada'), null, seis, true).acao).toBe('novaTurma');
  });
});

describe('espera para iniciar o Lean', () => {
  const seis = Array.from({ length: 6 }, (_, i) => grupo({ id: String(i) }));
  it('nos 30 s depois de encerrar o Travado, mostra a contagem e não oferece o botão', () => {
    const t = turma('debrief', { rodadaFim: '2026-11-25T14:00:00.000Z', horaServidor: '2026-11-25T14:00:12.200Z' });
    expect(esperaParaLeanS(t)).toBe(18);
    const p = proximaAcao(t, null, seis);
    expect(p.acao).toBeNull();
    expect(p.texto).toContain('Aguarde 18 s');
  });

  it('passados os 30 s, oferece Iniciar Plantão Lean', () => {
    const t = turma('debrief', { rodadaFim: '2026-11-25T14:00:00.000Z', horaServidor: '2026-11-25T14:00:31.000Z' });
    expect(esperaParaLeanS(t)).toBe(0);
    expect(proximaAcao(t, null, seis).acao).toBe('iniciarR2');
  });
});

describe('endereços', () => {
  it('monta o telão por código e o relatório por slug', () => {
    expect(linkTelao('https://plantaocbmede.netlify.app', 'CBMEDE')).toBe(
      'https://plantaocbmede.netlify.app/projetor.html?sala=CBMEDE',
    );
    expect(linkTelao('http://localhost:5182', 'CBMEDE', true)).toBe(
      'http://localhost:5182/projetor.html?sala=CBMEDE&demo=1',
    );
    expect(linkRelatorio('https://x.app', 'abc_DEF-123456789012345')).toBe(
      'https://x.app/relatorio.html?r=abc_DEF-123456789012345',
    );
  });
});
