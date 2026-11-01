import { describe, expect, it } from 'vitest';
import { avancarAte, criarEstadoInicial, metricas, type Ocorrencia } from '../../shared/lib/simulation';
import { EventoJogoSchema } from '../../shared/schemas/sync.schema';
import {
  MENSAGEM_SEM_ESTADO,
  comoEstadoSimulacao,
  decidirRetomada,
  eventosRelevantes,
  marcoDaSerie,
  minutoAlvo,
  minutoLocal,
  sementeDaTurma,
  tensaoDoPlantao,
} from '../jogo/sincronia';

describe('minutoAlvo (relógio do servidor manda)', () => {
  it('avança até o minuto do servidor quando o local está atrás', () => {
    expect(minutoAlvo(500, 501, false)).toBe(501);
    expect(minutoAlvo(500, 620, false)).toBe(620);
  });

  it('nunca passa à frente do servidor', () => {
    expect(minutoAlvo(500, 500, false)).toBeNull();
    expect(minutoAlvo(510, 500, false)).toBeNull();
  });

  it('pausa do facilitador ou servidor desconhecido congelam o jogo', () => {
    expect(minutoAlvo(500, 600, true)).toBeNull();
    expect(minutoAlvo(500, null, false)).toBeNull();
  });

  it('limita às 19h', () => {
    expect(minutoAlvo(1139, 1500, false)).toBe(1140);
  });

  it('nunca passa do teto confirmado pelo servidor (extrapolação local limitada)', () => {
    // O relógio extrapolado diz 505, mas a última leitura só garante até 502.
    expect(minutoAlvo(500, 505, false, 502)).toBe(502);
    expect(minutoAlvo(502, 505, false, 502)).toBeNull();
    // Sem teto conhecido, segue o minuto do servidor.
    expect(minutoAlvo(500, 505, false, null)).toBe(505);
  });
});

describe('minutoLocal (modo solo)', () => {
  it('1 s real = 1 min de plantão, descontando pausas', () => {
    expect(minutoLocal(0, 0, 0, null)).toBe(420);
    expect(minutoLocal(0, 61_500, 0, null)).toBe(481);
    expect(minutoLocal(0, 61_500, 20_000, null)).toBe(461);
  });

  it('congela durante a pausa e respeita os limites', () => {
    expect(minutoLocal(0, 90_000, 0, 30_000)).toBe(450);
    expect(minutoLocal(0, 10_000_000, 0, null)).toBe(1140);
  });
});

describe('sementeDaTurma', () => {
  it('é determinística e muda com a turma', () => {
    expect(sementeDaTurma('abc')).toBe(sementeDaTurma('abc'));
    expect(sementeDaTurma('abc')).not.toBe(sementeDaTurma('abd'));
    expect(Number.isInteger(sementeDaTurma('x'))).toBe(true);
  });
});

describe('marcoDaSerie', () => {
  it('arredonda para o múltiplo de 30 min desde as 7h', () => {
    expect(marcoDaSerie(420)).toBe(420);
    expect(marcoDaSerie(449)).toBe(420);
    expect(marcoDaSerie(450)).toBe(450);
    expect(marcoDaSerie(1140)).toBe(1140);
  });
});

describe('eventosRelevantes', () => {
  const oc = (tipo: Ocorrencia['tipo'], extra: Partial<Ocorrencia> = {}): Ocorrencia => ({ minuto: 600, tipo, msg: `msg ${tipo}`, nivel: 'danger', ...extra });

  it('envia só óbito, deterioração, cancelamento, surto, DE lotado, corredor, NIR e PCP, com chave válida e única', () => {
    const eventos = eventosRelevantes(1, [
      oc('obito', { pacienteId: 3 }),
      oc('movimento'),
      oc('alta'),
      oc('surto'),
      oc('cirurgia_cancelada'),
      oc('cirurgia_cancelada'),
      oc('nir', { pacienteId: 7 }),
      oc('full_capacity', { pacienteId: 8 }),
      oc('deterioracao', { pacienteId: 3 }),
      oc('de_lotado'),
      oc('corredor', { pacienteId: 9 }),
      oc('round_enf'),
    ]);
    expect(eventos.map(e => e.tipo)).toEqual([
      'obito', 'surto', 'cirurgia_cancelada', 'cirurgia_cancelada', 'nir', 'full_capacity', 'deterioracao', 'de_lotado', 'corredor',
    ]);
    const chaves = eventos.map(e => e.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const e of eventos) expect(EventoJogoSchema.safeParse(e).success).toBe(true);
  });

  it('a mesma ocorrência gera a mesma chave (reenvio idempotente)', () => {
    const a = eventosRelevantes(2, [oc('obito', { pacienteId: 1 })]);
    const b = eventosRelevantes(2, [oc('obito', { pacienteId: 1 })]);
    expect(a[0]!.chave).toBe(b[0]!.chave);
  });
});

describe('decidirRetomada (reconexão só com o estado completo)', () => {
  const semente = 42;
  const r1 = criarEstadoInicial(1, semente);
  const r1Adiante = avancarAte(r1, 600).estado;

  it('restaura o estado mais recente da rodada entre a cópia local e a do servidor', () => {
    const r = decidirRetomada({ rodada: 1, semente, local: r1, servidor: { rodada: 1, estado: r1Adiante }, podeComecar: false });
    expect(r.tipo).toBe('restaurar');
    if (r.tipo === 'restaurar') expect(r.estado.minuto).toBe(600);
    const r2 = decidirRetomada({ rodada: 1, semente, local: r1Adiante, servidor: { rodada: 1, estado: r1 }, podeComecar: false });
    if (r2.tipo === 'restaurar') expect(r2.estado.minuto).toBe(600);
  });

  it('sem estado, começa do zero quando pode (grupo novo ou início visto ao vivo)', () => {
    const r = decidirRetomada({ rodada: 2, semente, local: r1, servidor: null, podeComecar: true });
    expect(r.tipo).toBe('novo');
    if (r.tipo === 'novo') {
      expect(r.estado.rodada).toBe(2);
      expect(r.estado.minuto).toBe(420);
    }
  });

  it('navegador fechado quando a rodada começou: o servidor não tem jogo desta rodada, então começa do zero', () => {
    // Cópia local da rodada 1, rodada 2 em andamento, servidor sem estado da rodada 2.
    const r = decidirRetomada({ rodada: 2, semente, local: r1Adiante, servidor: { rodada: 2, estado: null }, podeComecar: false });
    expect(r.tipo).toBe('novo');
    const r1Fechado = decidirRetomada({ rodada: 1, semente, local: null, servidor: { rodada: 1, estado: null }, podeComecar: false });
    expect(r1Fechado.tipo).toBe('novo');
  });

  it('sem resposta do servidor sobre esta rodada, pede a consulta em vez de começar ou travar', () => {
    expect(decidirRetomada({ rodada: 2, semente, local: r1Adiante, servidor: null, podeComecar: false })).toEqual({ tipo: 'consultar' });
    // Resposta de outra rodada (entrou no debrief) não vale para a rodada 2.
    expect(decidirRetomada({ rodada: 2, semente, local: null, servidor: { rodada: 1, estado: r1Adiante }, podeComecar: false })).toEqual({
      tipo: 'consultar',
    });
  });

  it('servidor tem um jogo salvo desta rodada que não dá para usar: não inventa estado', () => {
    const r = decidirRetomada({ rodada: 2, semente, local: null, servidor: { rodada: 2, estado: { versao: 99, rodada: 2, minuto: 700 } }, podeComecar: false });
    expect(r).toEqual({ tipo: 'sem_estado', mensagem: MENSAGEM_SEM_ESTADO });
  });

  it('a mesma turma gera a mesma demanda nas duas rodadas', () => {
    const a = criarEstadoInicial(1, sementeDaTurma('t1'));
    const b = criarEstadoInicial(2, sementeDaTurma('t1'));
    expect(a.agenda.chegadas).toEqual(b.agenda.chegadas);
  });

  it('comoEstadoSimulacao aceita estado do motor serializado e recusa formato estranho', () => {
    expect(comoEstadoSimulacao(JSON.parse(JSON.stringify(r1Adiante)))).not.toBeNull();
    expect(comoEstadoSimulacao({ versao: 1, rodada: 1, minuto: 500 })).toBeNull();
    expect(comoEstadoSimulacao(null)).toBeNull();
  });
});

describe('tensaoDoPlantao', () => {
  it('fica entre 0 e 1 e sobe com o plantão cheio', () => {
    const inicio = tensaoDoPlantao(criarEstadoInicial(1, 7));
    const meio = tensaoDoPlantao(avancarAte(criarEstadoInicial(1, 7), 800).estado);
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(meio).toBeLessThanOrEqual(1);
    expect(meio).toBeGreaterThanOrEqual(inicio);
  });
});

describe('série enviada', () => {
  it('as métricas do motor têm deOcc e boarding (curvas do relatório, do painel e do telão)', () => {
    const m = metricas(criarEstadoInicial(1, 42));
    expect(typeof m.deOcc).toBe('number');
    expect(typeof m.boarding).toBe('number');
  });
});
