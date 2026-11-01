import { describe, it, expect } from 'vitest';
import { mkSx, mkSxR2 } from '../../game-engine';
import {
  aplicarAcao, avancarAte, criarEstadoInicial, destinosPossiveis, ehErro, liberarFullCapacity,
  metricas, passo, pontuacao, MINUTO_FIM, MINUTO_INICIO,
} from '../motor';
import { puxaFluxo, simularPartida } from '../estrategias';
import { criarGerador } from '../rng';
import type { Acao, ErroAcao, EstadoSimulacao, ResultadoPasso } from '../types';
import { comPacientes, congelarProfundo, paciente } from './helpers';

function ok(r: ResultadoPasso | ErroAcao): ResultadoPasso {
  if (ehErro(r)) throw new Error(`ação recusada: ${r.erro}`);
  return r;
}

function falha(r: ResultadoPasso | ErroAcao): ErroAcao {
  if (!ehErro(r)) throw new Error('ação deveria ter sido recusada');
  return r;
}

describe('gerador mulberry32', () => {
  it('repete a sequência para o mesmo estado e fica em [0, 1)', () => {
    const a = criarGerador(42);
    const b = criarGerador(42);
    const xs = Array.from({ length: 1000 }, () => a.proximo());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.proximo()));
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
    expect(a.estado()).toBe(b.estado());
  });

  it('inteiro respeita os limites inclusivos', () => {
    const g = criarGerador(7);
    const vs = Array.from({ length: 2000 }, () => g.inteiro(2, 4));
    expect(new Set(vs)).toEqual(new Set([2, 3, 4]));
  });
});

describe('criarEstadoInicial', () => {
  it('monta o hospital de 7h: DE 8, ENF 71, UTI 13, ocupação 84%', () => {
    const e = criarEstadoInicial(1, 1);
    const m = metricas(e);
    expect([m.deOcc, m.enfOcc, m.utiOcc, m.rpaOcc]).toEqual([8, 71, 13, 0]);
    expect(m.boarding).toBe(3);
    expect(e.minuto).toBe(MINUTO_INICIO);
    expect(e.versao).toBe(0);
    expect(e.proximaChegada).toBeGreaterThanOrEqual(425);
    expect(e.proximaChegada).toBeLessThanOrEqual(432);
    expect(e.ferramentas).toEqual({ nirUsos: 0, nirEspera: 0, fcUsos: 0, fcLiberado: false });
    expect(new Set(e.pacientes.map(p => p.id)).size).toBe(92);
    expect(e.proximoId).toBe(93);
  });

  it('R1 atrasa as cirurgias da sala 1 entre 30 e 60 min e avisa no log', () => {
    for (let s = 1; s <= 20; s++) {
      const e = criarEstadoInicial(1, s);
      const base = mkSx();
      e.cirurgias.forEach((c, i) => {
        const atraso = Math.round((c.stH - base[i]!.stH) * 60);
        if (c.sala === 1) {
          expect(atraso).toBeGreaterThanOrEqual(30);
          expect(atraso).toBeLessThanOrEqual(60);
        } else expect(atraso).toBe(0);
      });
      expect(e.log.some(l => l.msg.startsWith('ATRASO: Primeira cirurgia atrasou'))).toBe(true);
    }
  });

  it('R2 usa a agenda redistribuída, sem atraso, com Bed Huddle no log', () => {
    const e = criarEstadoInicial(2, 3);
    expect(e.cirurgias).toEqual(mkSxR2());
    expect(e.log[0]!.msg).toContain('PLANTAO LEAN iniciado!');
    expect(e.log.some(l => l.msg.startsWith('BED HUDDLE 7h'))).toBe(true);
  });

  it('ccBlocked é falso por padrão; quando ligado, a sala 4 vai para a 3 e fica em flags', () => {
    expect(criarEstadoInicial(1, 1).flags.ccBlocked).toBeUndefined();
    const e = criarEstadoInicial(1, 1, { ccBlocked: true });
    expect(e.flags.ccBlocked).toBe(true);
    expect(e.cirurgias.some(c => c.sala === 4)).toBe(false);
    expect(e.log[0]!.msg).toContain('Sala 4 reservada para emergências.');
  });
});

describe('determinismo', () => {
  it('mesma semente + mesmas ações ⇒ mesmo resultado', () => {
    for (const rodada of [1, 2] as const) {
      const a = simularPartida(puxaFluxo, rodada, 123);
      const b = simularPartida(puxaFluxo, rodada, 123);
      expect(a.estado).toEqual(b.estado);
      expect(a.pontuacao).toBe(b.pontuacao);
    }
  });

  it('sementes diferentes geram partidas diferentes', () => {
    const a = simularPartida(puxaFluxo, 1, 1);
    const b = simularPartida(puxaFluxo, 1, 2);
    expect(a.estado.rng).not.toBe(b.estado.rng);
    expect(a.estado.pacientes).not.toEqual(b.estado.pacientes);
  });

  it('o estado sobrevive a JSON (reconexão a partir do banco)', () => {
    const e = avancarAte(criarEstadoInicial(2, 9), 800).estado;
    const copia = JSON.parse(JSON.stringify(e)) as EstadoSimulacao;
    expect(avancarAte(copia, 1000).estado).toEqual(avancarAte(e, 1000).estado);
  });
});

describe('imutabilidade', () => {
  it('passo e aplicarAcao não alteram o estado recebido', () => {
    let e = congelarProfundo(criarEstadoInicial(1, 5));
    while (e.minuto < MINUTO_FIM) {
      const acao = puxaFluxo(e);
      if (acao) {
        const r = aplicarAcao(e, acao);
        if (!ehErro(r)) e = congelarProfundo(r.estado);
      }
      e = congelarProfundo(passo(e).estado);
    }
    expect(e.minuto).toBe(MINUTO_FIM);
  });
});

describe('passo e avancarAte', () => {
  it('avancarAte(m) é igual a aplicar passo até m', () => {
    const e0 = criarEstadoInicial(2, 77);
    let e = e0;
    const ocs = [];
    for (let i = 0; i < 300; i++) {
      const r = passo(e);
      e = r.estado;
      ocs.push(...r.ocorrencias);
    }
    const r = avancarAte(e0, MINUTO_INICIO + 300);
    expect(r.estado).toEqual(e);
    expect(r.ocorrencias).toEqual(ocs);
  });

  it('para em 19h, encerra com mensagem e não anda mais', () => {
    const r = avancarAte(criarEstadoInicial(1, 1), 5000);
    expect(r.estado.minuto).toBe(MINUTO_FIM);
    expect(r.estado.versao).toBe(720);
    expect(r.ocorrencias[r.ocorrencias.length - 1]).toMatchObject({ tipo: 'fim', msg: 'Plantao encerrado!', minuto: MINUTO_FIM });
    const depois = passo(r.estado);
    expect(depois.estado).toBe(r.estado);
    expect(depois.ocorrencias).toEqual([]);
  });

  it('cada ocorrência vira entrada de log (mais recente primeiro, máximo 60)', () => {
    const r = avancarAte(criarEstadoInicial(1, 4), 900);
    expect(r.estado.log.length).toBeLessThanOrEqual(60);
    const ultima = r.ocorrencias[r.ocorrencias.length - 1]!;
    expect(r.estado.log[0]).toEqual({ msg: ultima.msg, type: ultima.nivel, t: ultima.minuto });
  });
});

describe('boarding', () => {
  const base = (): EstadoSimulacao => ({ ...criarEstadoInicial(1, 1), minuto: 470 });

  it('180 min de boarding ⇒ deterioração', () => {
    const e = comPacientes(base(), [paciente(1, { sector: 'de', dest: 'enf', ready: true, bStart: 471 - 180 })]);
    const r = passo(e);
    expect(r.estado.pacientes[0]!.det).toBe(true);
    expect(r.estado.stats.dets).toBe(1);
    expect(r.ocorrencias).toContainEqual(expect.objectContaining({ tipo: 'deterioracao', som: 'det', pacienteId: 1 }));
  });

  it('179 min ainda não deteriora', () => {
    const e = comPacientes(base(), [paciente(1, { sector: 'de', dest: 'enf', ready: true, bStart: 471 - 179 })]);
    expect(passo(e).estado.stats.dets).toBe(0);
  });

  it('360 min de boarding ⇒ óbito evitável', () => {
    const e = comPacientes(base(), [paciente(1, { sector: 'de', dest: 'uti', sev: 'orange', ready: true, det: true, bStart: 471 - 360 })]);
    const r = passo(e);
    expect(r.estado.pacientes[0]!.dead).toBe(true);
    expect(r.estado.stats.deaths).toBe(1);
    expect(r.ocorrencias).toContainEqual(expect.objectContaining({ tipo: 'obito', som: 'death', flashObito: true }));
  });

  it('cada minuto de boarding soma 1/60 h', () => {
    const e = comPacientes(base(), [paciente(1, { sector: 'de', dest: 'enf', ready: true, bStart: 460 })]);
    expect(passo(e).estado.stats.boardHrs).toBeCloseTo(1 / 60);
  });
});

describe('eventos programados', () => {
  it('surto garantido às 12h na R1', () => {
    for (let s = 1; s <= 10; s++) {
      const antes = avancarAte(criarEstadoInicial(1, s), 719);
      expect(antes.ocorrencias.some(o => o.tipo === 'surto')).toBe(false);
      const r = passo(antes.estado);
      const surto = r.ocorrencias.find(o => o.tipo === 'surto');
      expect(surto).toMatchObject({ minuto: 720, som: 'cascade', msg: 'SURTO! 3 pacientes simultâneos chegando!' });
      expect(r.estado.eventos.surto).toBe(true);
      expect(r.estado.pacientes.filter(p => p.arrMin === 720).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('Fluxista dá alta automática a cada 20 min na R2', () => {
    const pronto = paciente(1, { sector: 'de', dest: 'alta_de', sev: 'green', ready: true });
    const r2 = comPacientes({ ...criarEstadoInicial(2, 1), minuto: 439 }, [pronto]);
    const r = passo(r2);
    expect(r.estado.pacientes[0]!.sector).toBe('alta');
    expect(r.estado.stats.disc).toBe(1);
    expect(r.ocorrencias).toContainEqual(expect.objectContaining({ tipo: 'fluxista', som: 'fluxista' }));

    const foraDaHora = comPacientes({ ...criarEstadoInicial(2, 1), minuto: 440 }, [pronto]);
    expect(passo(foraDaHora).estado.pacientes[0]!.sector).toBe('de');

    const r1 = comPacientes({ ...criarEstadoInicial(1, 1), minuto: 439 }, [pronto]);
    expect(passo(r1).estado.pacientes[0]!.sector).toBe('de');
  });

  it('Fluxista só age em minutos múltiplos de 20 numa partida inteira', () => {
    const ocs = avancarAte(criarEstadoInicial(2, 11), MINUTO_FIM).ocorrencias.filter(o => o.tipo === 'fluxista');
    expect(ocs.length).toBeGreaterThan(0);
    expect(ocs.every(o => o.minuto % 20 === 0)).toBe(true);
  });

  it('round médico às 11h na R1 (6 a 8 altas, preparo 2-3h)', () => {
    const antes = avancarAte(criarEstadoInicial(1, 2), 659).estado;
    expect(antes.flags.e1).toBeFalsy();
    const r = passo(antes);
    expect(r.ocorrencias.find(o => o.tipo === 'round_enf')?.msg).toMatch(/^ROUND MÉDICO 11h: [678] altas prescritas/);
    const prescritas = r.estado.pacientes.filter(p => p.sector === 'enf' && p.dischReady);
    expect(prescritas.length).toBeGreaterThanOrEqual(6);
    expect(prescritas.length).toBeLessThanOrEqual(8);
    expect(prescritas.every(p => p.prep >= 119 && p.prep <= 179)).toBe(true);
  });

  it('Bed Huddle às 8h na R2 (leito libera na hora)', () => {
    const antes = avancarAte(criarEstadoInicial(2, 2), 479).estado;
    expect(antes.flags.e1).toBeFalsy();
    const r = passo(antes);
    expect(r.ocorrencias.find(o => o.tipo === 'round_enf')?.msg).toMatch(/^BED HUDDLE 8h: [678] altas prescritas/);
    const prescritas = r.estado.pacientes.filter(p => p.sector === 'enf' && p.dischReady);
    expect(prescritas.length).toBeGreaterThanOrEqual(6);
    expect(prescritas.every(p => p.prep === 0)).toBe(true);
  });

  it('cirurgia que termina com a RPA cheia é cancelada e bloqueia uma alta (cascata)', () => {
    const rpa = [2, 3, 4].map(id => paciente(id, { sector: 'rpa', dest: 'enf', ready: true, postOp: true }));
    const alta = paciente(5, { sector: 'enf', dest: 'alta_enf', dischReady: true, prep: 0 });
    const e = comPacientes({ ...criarEstadoInicial(1, 1), minuto: 470 }, [...rpa, alta], {
      cirurgias: [{ id: 1, label: 'Cx Eletiva 1', sala: 1, stH: 7, dur: 0, dest: 'enf', st: 'scheduled' }],
    });
    const r = passo(e);
    expect(r.estado.cirurgias[0]!.st).toBe('cancelled');
    expect(r.estado.stats.cxCan).toBe(1);
    const bloqueado = r.estado.pacientes.find(p => p.id === 5)!;
    expect(bloqueado.blocked).toBe(true);
    expect(bloqueado.dischReady).toBe(false);
    expect(r.ocorrencias).toContainEqual(expect.objectContaining({ tipo: 'cirurgia_cancelada', som: 'cascade', cascata: expect.objectContaining({ duracaoMs: 8000 }) }));
  });

  it('cirurgia com vaga na RPA gera pós-operatório', () => {
    const e = comPacientes({ ...criarEstadoInicial(1, 1), minuto: 470 }, [], {
      cirurgias: [{ id: 3, label: 'Cx Complexa 1', sala: 3, stH: 7, dur: 0, dest: 'uti', st: 'scheduled' }],
    });
    const r = passo(e);
    expect(r.estado.cirurgias[0]!.st).toBe('done');
    expect(r.estado.pacientes).toContainEqual(expect.objectContaining({ name: 'PO-Complexa 1', sector: 'rpa', dest: 'uti', sev: 'red', postOp: true, ready: true }));
  });
});

describe('ações do grupo', () => {
  const de = (id: number, campos = {}) => paciente(id, { sector: 'de', ready: true, bStart: 460, ...campos });
  const base = (rodada: 1 | 2 = 1) => ({ ...criarEstadoInicial(rodada, 1), minuto: 470 });

  it('destinosPossiveis segue as regras do App', () => {
    const e = comPacientes(base(), [
      de(1, { dest: 'uti' }), de(2, { dest: 'alta_de' }), paciente(3, { sector: 'corredor' }),
      paciente(4, { sector: 'enf', dischReady: true, prep: 0 }), paciente(5, { sector: 'enf', dischReady: true, prep: 5 }),
      paciente(6, { sector: 'rpa', dest: 'uti', ready: true }), paciente(7, { sector: 'uti', dest: 'enf', dischReady: true, prep: 0 }),
    ]);
    expect(destinosPossiveis(e, 1)).toEqual(['uti', 'enf']);
    expect(destinosPossiveis(e, 2)).toEqual(['alta']);
    expect(destinosPossiveis(e, 3)).toEqual(['de']);
    expect(destinosPossiveis(e, 4)).toEqual(['alta']);
    expect(destinosPossiveis(e, 5)).toEqual([]);
    expect(destinosPossiveis(e, 6)).toEqual(['uti', 'enf']);
    expect(destinosPossiveis(e, 7)).toEqual(['enf']);
    expect(destinosPossiveis(e, 999)).toEqual([]);
  });

  it('internar move o paciente, zera o boarding e incrementa a versão', () => {
    const e = comPacientes(base(), [de(1, { dest: 'enf', bMin: 10 })]);
    const r = ok(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'enf' }));
    expect(r.estado.pacientes[0]).toMatchObject({ sector: 'enf', ready: false, bStart: null, bMin: 0 });
    expect(r.estado.versao).toBe(e.versao + 1);
    expect(r.estado.minuto).toBe(e.minuto);
    expect(r.ocorrencias[0]).toMatchObject({ tipo: 'movimento', msg: 'Teste 1 → ENF', decisao: 'produtiva' });
  });

  it('alta do DE conta liberação; alta da ENF conta alta hospitalar', () => {
    let e = comPacientes(base(), [de(1, { dest: 'alta_de' }), paciente(2, { sector: 'enf', dischReady: true, prep: 0 })]);
    e = ok(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'alta' })).estado;
    e = ok(aplicarAcao(e, { tipo: 'mover', pacienteId: 2, destino: 'alta' })).estado;
    expect(e.stats).toMatchObject({ disc: 2, libDE: 1, altaHosp: 1 });
    expect(pontuacao(e)).toBe(1500 + 3 + 150);
  });

  it('step-down UTI→ENF deixa o paciente verde', () => {
    const e = comPacientes(base(), [paciente(1, { sector: 'uti', dest: 'enf', sev: 'red', dischReady: true, prep: 0 })]);
    const r = ok(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'enf' }));
    expect(r.estado.pacientes[0]).toMatchObject({ sector: 'enf', sev: 'green', dischReady: false });
  });

  it('recusa destino inválido, paciente inexistente, setor lotado e jogo encerrado', () => {
    const cheia = Array.from({ length: 85 }, (_, i) => paciente(100 + i, { sector: 'enf' }));
    const e = comPacientes(base(), [de(1, { dest: 'enf' }), ...cheia]);
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'uti' })).codigo).toBe('destino_invalido');
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 999, destino: 'enf' })).codigo).toBe('paciente_inexistente');
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'enf' }))).toEqual({ codigo: 'lotado', erro: 'ENF LOTADO!' });
    expect(falha(aplicarAcao({ ...e, minuto: MINUTO_FIM }, { tipo: 'mover', pacienteId: 1, destino: 'enf' })).codigo).toBe('fim_de_jogo');
  });

  it('DE perde uma maca durante a parada cardíaca', () => {
    const deCheio = Array.from({ length: 14 }, (_, i) => paciente(100 + i, { sector: 'de' }));
    const e = comPacientes(base(), [paciente(1, { sector: 'corredor' }), ...deCheio]);
    expect(ehErro(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'de' }))).toBe(false);
    const comPcr = { ...e, eventos: { ...e.eventos, pcr: true, pcrEnd: 999 } };
    expect(falha(aplicarAcao(comPcr, { tipo: 'mover', pacienteId: 1, destino: 'de' })).codigo).toBe('lotado');
  });

  it('UTI→ENF fora do perfil exige confirmação e penaliza', () => {
    const e = comPacientes(base(), [de(1, { dest: 'uti', sev: 'red' })]);
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'enf' })).codigo).toBe('confirmar_fora_do_perfil');
    const r = ok(aplicarAcao(e, { tipo: 'confirmarForaDoPerfil', pacienteId: 1 }));
    expect(r.estado.pacientes[0]).toMatchObject({ sector: 'enf', offSvc: true });
    expect(r.estado.stats.offS).toBe(1);
    expect(r.ocorrencias[0]).toMatchObject({ tipo: 'fora_do_perfil', decisao: 'reativa' });
    expect(pontuacao(r.estado)).toBe(1500 - 25 + 150);
    const enfermaria = comPacientes(base(), [de(2, { dest: 'enf' })]);
    expect(falha(aplicarAcao(enfermaria, { tipo: 'confirmarForaDoPerfil', pacienteId: 2 })).codigo).toBe('destino_invalido');
  });

  it('NIR: só na R2, 3 usos, 60 min de espera entre eles', () => {
    const pts = [1, 2, 3, 4].map(id => de(id, { dest: 'enf', bStart: 465 }));
    const nirDe = (id: number): Acao => ({ tipo: 'nir', pacienteId: id });
    expect(falha(aplicarAcao(comPacientes(base(1), pts), nirDe(1))).codigo).toBe('ferramenta_indisponivel');

    let e = comPacientes(base(2), [...pts, de(9, { dest: 'alta_de' })]);
    expect(falha(aplicarAcao(e, nirDe(9))).codigo).toBe('destino_invalido');
    const r = ok(aplicarAcao(e, nirDe(1)));
    expect(r.estado.pacientes.some(p => p.id === 1)).toBe(false);
    expect(r.estado.ferramentas).toMatchObject({ nirUsos: 1, nirEspera: 60 });
    expect(r.ocorrencias[0]).toMatchObject({ tipo: 'nir', som: 'disc', msg: 'NIR: Teste 1 transferido para outra unidade. (1/3 usos)' });
    e = r.estado;
    expect(falha(aplicarAcao(e, nirDe(2))).erro).toMatch(/espera/);
    e = avancarAte(e, e.minuto + 59).estado;
    expect(e.ferramentas.nirEspera).toBe(1);
    expect(ehErro(aplicarAcao(e, nirDe(2)))).toBe(true);
    e = passo(e).estado;
    e = ok(aplicarAcao(e, nirDe(2))).estado;
    e = avancarAte(e, e.minuto + 60).estado;
    e = ok(aplicarAcao(e, nirDe(3))).estado;
    e = avancarAte(e, e.minuto + 60).estado;
    expect(e.ferramentas.nirUsos).toBe(3);
    expect(falha(aplicarAcao(e, nirDe(4))).erro).toMatch(/esgotado/);
  });

  it('Full Capacity: só na R2, depende de fcLiberado, 2 usos, só verdes com internação', () => {
    const verdes = [1, 2, 3].map(id => de(id, { dest: 'enf', sev: 'green' }));
    const fc = (id: number): Acao => ({ tipo: 'fullCapacity', pacienteId: id });
    let e = comPacientes(base(2), [...verdes, de(4, { dest: 'enf', sev: 'yellow' })]);
    expect(falha(aplicarAcao(e, fc(1))).erro).toBe('FULL CAPACITY negado — aguardando autorização da Diretoria.');

    const lib = liberarFullCapacity(e);
    expect(lib.ocorrencias[0]).toMatchObject({ tipo: 'full_capacity_liberado' });
    e = lib.estado;
    expect(e.ferramentas.fcLiberado).toBe(true);
    expect(liberarFullCapacity(e).ocorrencias).toEqual([]);
    expect(falha(aplicarAcao(e, fc(4))).codigo).toBe('destino_invalido');

    e = ok(aplicarAcao(e, fc(1))).estado;
    e = ok(aplicarAcao(e, fc(2))).estado;
    expect(e.pacientes.filter(p => p.sector === 'corredor').map(p => p.id)).toEqual([1, 2]);
    expect(falha(aplicarAcao(e, fc(3))).erro).toBe('FULL CAPACITY esgotado — limite de 2 pacientes atingido.');

    const r1 = comPacientes(base(1), verdes);
    expect(liberarFullCapacity(r1).estado.ferramentas.fcLiberado).toBe(false);
    expect(falha(aplicarAcao(r1, fc(1))).codigo).toBe('ferramenta_indisponivel');
  });
});
