import { describe, expect, it, vi } from 'vitest';
import type { EstadoTurma } from '../../shared/schemas';
import { NaoAutorizado, SemConexao } from '../../shared/services/erros';
import { criarServicoDemo } from '../demo/servicoDemo';
import type { ServicosFacilitador } from '../servicos';
import { AlvoPainel, PresencaGrupos, criarBuscaPainel } from '../useTurmaFacilitador';

function turma(parcial: Partial<EstadoTurma> = {}): EstadoTurma {
  return {
    id: 't1',
    codigo: 'CBMEDE',
    nome: 'Turma',
    status: 'rodada1',
    rodada: 1,
    rodadaInicio: '2026-11-25T10:00:00Z',
    pausada: false,
    pausaAcumuladaMs: 0,
    horaServidor: '2026-11-25T10:01:00Z',
    entradaLiberada: false,
    fullCapacityLiberado: false,
    musicaMudo: false,
    grupos: [],
    ...parcial,
  };
}

function servicosFalsos(parcial: Partial<ServicosFacilitador>): ServicosFacilitador {
  return parcial as ServicosFacilitador;
}

describe('consulta periódica do painel (painel_turma)', () => {
  it('acha a turma pelo código e, depois, consulta painel_turma pelo id', async () => {
    const estado = vi.fn(async () => turma());
    const painelTurma = vi.fn(async () => turma());
    const buscar = criarBuscaPainel(servicosFalsos({ estado, painelTurma }), new AlvoPainel());
    await buscar('CBMEDE');
    await buscar('CBMEDE');
    await buscar('CBMEDE');
    expect(estado).toHaveBeenCalledTimes(1);
    expect(painelTurma).toHaveBeenCalledTimes(2);
    expect(painelTurma).toHaveBeenCalledWith('t1');
  });

  it('sessão recusada: volta para a leitura pública e não insiste no painel', async () => {
    const estado = vi.fn(async () => turma());
    const painelTurma = vi.fn(async (): Promise<EstadoTurma> => {
      throw new NaoAutorizado();
    });
    const alvo = new AlvoPainel();
    alvo.fixar('t1');
    const buscar = criarBuscaPainel(servicosFalsos({ estado, painelTurma }), alvo);
    await buscar('CBMEDE');
    await buscar('CBMEDE');
    expect(painelTurma).toHaveBeenCalledTimes(1);
    expect(estado).toHaveBeenCalledTimes(2);
  });

  it('turma arquivada: a próxima consulta procura pelo código (pode haver turma nova)', async () => {
    const estado = vi.fn(async () => turma({ id: 't2', status: 'aberta' }));
    const painelTurma = vi.fn(async () => turma({ status: 'arquivada' }));
    const alvo = new AlvoPainel();
    alvo.fixar('t1');
    const buscar = criarBuscaPainel(servicosFalsos({ estado, painelTurma }), alvo);
    expect((await buscar('CBMEDE')).status).toBe('arquivada');
    expect((await buscar('CBMEDE')).id).toBe('t2');
    expect(alvo.id).toBe('t2');
  });

  it('falha de rede continua sendo falha de rede (o ciclo cuida do reenvio)', async () => {
    const alvo = new AlvoPainel();
    alvo.fixar('t1');
    const buscar = criarBuscaPainel(
      servicosFalsos({
        estado: vi.fn(),
        painelTurma: vi.fn(async (): Promise<EstadoTurma> => {
          throw new SemConexao();
        }),
      }),
      alvo,
    );
    await expect(buscar('CBMEDE')).rejects.toBeInstanceOf(SemConexao);
    expect(alvo.id).toBe('t1');
  });

  it('com a visão do facilitador na consulta, removidos e "visto há" aparecem sem ação recente', () => {
    const agora = Date.parse('2026-11-25T10:01:00Z');
    const presenca = new PresencaGrupos(() => agora);
    presenca.receberTurma(
      turma({
        grupos: [
          {
            id: 'a',
            nome: 'A',
            cor: '#111111',
            conectado: false,
            vistoEm: '2026-11-25T10:00:30Z',
            reconexaoLiberada: true,
            removido: false,
          },
          {
            id: 'b',
            nome: 'B',
            cor: '#222222',
            conectado: false,
            vistoEm: null,
            reconexaoLiberada: false,
            removido: true,
          },
        ],
      }),
    );
    const { grupos } = presenca.instantaneo();
    const a = grupos.find((g) => g.id === 'a');
    expect(a?.vistoHaS).toBe(30);
    expect(a?.reconexaoLiberada).toBe(true);
    expect(grupos.find((g) => g.id === 'b')?.removido).toBe(true);
  });
});

describe('demonstração: leituras do facilitador', () => {
  it('séries e eventos acompanham as rodadas jogadas', async () => {
    const s = criarServicoDemo({ fase: 'resultado' });
    const t = await s.estado('CBMEDE');
    const painel = await s.painelTurma(t.id);
    expect(painel.grupos.every((g) => g.removido !== undefined)).toBe(true);
    const series = await s.seriesTurma(t.id);
    expect(series.some((p) => p.rodada === 1)).toBe(true);
    expect(series.some((p) => p.rodada === 2)).toBe(true);
    expect(series.every((p) => typeof p.metricas.deOcc === 'number' && typeof p.metricas.boarding === 'number')).toBe(
      true,
    );
    const eventos = await s.eventosTurma(t.id, { rodada: 1, limite: 5 });
    expect(eventos).toHaveLength(5);
    expect(eventos.every((e) => e.rodada === 1)).toBe(true);
    const { turma: arquivada } = await s.gerarRelatorio(t.id);
    expect(arquivada?.status).toBe('arquivada');
  });

  it('sem sessão salva na demonstração (o login é pela URL)', async () => {
    expect(await criarServicoDemo({ fase: 'login' }).sessaoAtual()).toBeNull();
  });
});
