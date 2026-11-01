import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EstadoTurma } from '../../shared/schemas';
import { rotuloConexao, textoConexao, type GrupoPainel, type ProximaAcao } from '../logica/fases';
import { AoVivo } from '../telas/AoVivo';

const grupo = (parcial: Partial<GrupoPainel> & { id: string }): GrupoPainel => ({
  nome: `Grupo ${parcial.id}`,
  cor: '#2563EB',
  conectado: true,
  vistoHaS: 0,
  reconexaoLiberada: false,
  removido: false,
  ...parcial,
});

describe('presença na tela Ao vivo', () => {
  it('texto de conexão: conectado ou sem sinal há N s', () => {
    expect(textoConexao(grupo({ id: 'a' }))).toBe('Conectado');
    expect(textoConexao(grupo({ id: 'a', conectado: false, vistoHaS: 12 }))).toBe('Sem sinal há 12 s');
    expect(textoConexao(grupo({ id: 'a', conectado: false, vistoHaS: 125 }))).toBe('Sem sinal há 2 min');
    expect(textoConexao(grupo({ id: 'a', conectado: false, vistoHaS: null }))).toBe('Sem sinal');
  });

  it('rótulo resume os grupos ativos', () => {
    expect(rotuloConexao([grupo({ id: 'a' }), grupo({ id: 'b' })])).toBe('Todos conectados');
    expect(rotuloConexao([grupo({ id: 'a' }), grupo({ id: 'b', conectado: false, vistoHaS: 9 })])).toBe('1 de 2 conectados');
    expect(rotuloConexao([grupo({ id: 'a' }), grupo({ id: 'r', removido: true, conectado: false })])).toBe('Todos conectados');
  });

  it('AoVivo mostra o indicador de conexão de cada grupo (como na Sala)', () => {
    const turma: EstadoTurma = {
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
    };
    const proxima = { acao: 'encerrar', titulo: 'Encerrar', descricao: '' } as unknown as ProximaAcao;
    const html = renderToStaticMarkup(
      <AoVivo
        turma={turma}
        minuto={480}
        grupos={[
          grupo({ id: 'a', nome: 'Azul' }),
          grupo({ id: 'b', nome: 'Verde', conectado: false, vistoHaS: 15 }),
          grupo({ id: 'c', nome: 'Saiu', removido: true, conectado: false }),
        ]}
        ranking={[]}
        proxima={proxima}
        ocupado={null}
        acionar={() => {}}
        linkRelatorio={null}
        origem="http://localhost"
        series={null}
        eventos={null}
      />,
    );
    expect(html).toContain('Conexão dos grupos');
    expect(html).toContain('Azul');
    expect(html).toContain('Conectado');
    expect(html).toContain('Sem sinal há 15 s');
    expect(html).toContain('1 de 2 conectados');
    expect(html).not.toContain('Saiu');
  });
});
