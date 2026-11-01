import { describe, it, expect } from 'vitest';
import { calcScore, mkSx } from '../../game-engine';
import { CAP } from '../../constants';
import {
  aplicarAcao, avancarAte, calcularRisco, criarEstadoInicial, destinosPossiveis, ehErro, liberarFullCapacity,
  metricas, passo, pontuacao, slaPct, MINUTO_FIM, MINUTO_INICIO,
} from '../motor';
import {
  BLOQUEIO_CASCATA_MIN, ENF_EXTRA_VAGAS, FAST_TRACK_VAGAS, LOTES_ALTA, P_DET_LEITO_INADEQUADO, TAXA_CHEGADA_POR_HORA,
} from '../constantes';
import { passivo, puxaFluxo, simularPartida } from '../estrategias';
import { criarGerador } from '../rng';
import type { Acao, CirurgiaSim, ErroAcao, EstadoSimulacao, Ocorrencia, ResultadoPasso, Rodada } from '../types';
import { comPacientes, congelarProfundo, paciente } from './helpers';

function ok(r: ResultadoPasso | ErroAcao): ResultadoPasso {
  if (ehErro(r)) throw new Error(`ação recusada: ${r.erro}`);
  return r;
}

function falha(r: ResultadoPasso | ErroAcao): ErroAcao {
  if (!ehErro(r)) throw new Error('ação deveria ter sido recusada');
  return r;
}

/** Roda um passo com vários estados do gerador de eventos, para forçar eventos raros. */
function variosRng(e: EstadoSimulacao, n: number): ResultadoPasso[] {
  return Array.from({ length: n }, (_, i) => passo({ ...e, rng: i + 1 }));
}

function sobrepoem(a: CirurgiaSim, b: CirurgiaSim): boolean {
  return a.sala === b.sala && a.stH < b.stH + b.dur - 1e-9 && b.stH < a.stH + a.dur - 1e-9;
}

const base = (rodada: Rodada = 1, minuto = 470): EstadoSimulacao => ({ ...criarEstadoInicial(rodada, 1), minuto });

describe('gerador mulberry32', () => {
  it('repete a sequência para o mesmo estado e fica em [0, 1)', () => {
    const a = criarGerador(42);
    const b = criarGerador(42);
    const xs = Array.from({ length: 1000 }, () => a.proximo());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.proximo()));
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
  });
});

describe('estado inicial e demanda', () => {
  it('monta o hospital de 7h: DE 8, ENF 71, UTI 13', () => {
    const m = metricas(criarEstadoInicial(1, 1));
    expect([m.deOcc, m.enfOcc, m.utiOcc, m.rpaOcc]).toEqual([8, 71, 13, 0]);
  });

  it('demanda e censo idênticos na R1 e na R2 para a mesma semente', () => {
    for (let s = 1; s <= 10; s++) {
      const r1 = criarEstadoInicial(1, s);
      const r2 = criarEstadoInicial(2, s);
      expect(r2.agenda).toEqual(r1.agenda);
      expect(r2.pacientes).toEqual(r1.pacientes);
    }
    expect(criarEstadoInicial(1, 1).agenda).not.toEqual(criarEstadoInicial(1, 2).agenda);
  });

  it('as mesmas chegadas entram nas duas rodadas, mesmo com decisões diferentes', () => {
    const r1 = simularPartida(passivo, 1, 5).estado;
    const r2 = simularPartida(puxaFluxo, 2, 5).estado;
    const chegaram = (e: EstadoSimulacao): string[] =>
      e.pacientes.filter(p => p.id > 92 && !p.name.startsWith('PO-')).map(p => String(p.arrMin).padStart(4, '0')).sort();
    expect(r1.chegadasProcessadas).toBe(r1.agenda.chegadas.length);
    expect(chegaram(r2)).toEqual(chegaram(r1));
  });

  it('Poisson não homogêneo: ~43 chegadas por plantão em 200 sementes, mais o surto', () => {
    const esperado = Object.values(TAXA_CHEGADA_POR_HORA).reduce((a, x) => a + x, 0);
    expect(esperado).toBeCloseTo(43);
    const totais = Array.from({ length: 200 }, (_, s) => criarEstadoInicial(1, s + 1).agenda.chegadas.filter(c => !c.surto).length);
    const media = totais.reduce((a, x) => a + x, 0) / totais.length;
    expect(media).toBeGreaterThan(41);
    expect(media).toBeLessThan(45);
    expect(new Set(totais).size).toBeGreaterThan(8); // há variabilidade de verdade
  });

  it('perfil de gravidade e fora do perfil aproximam as constantes', () => {
    const todas = Array.from({ length: 200 }, (_, s) => criarEstadoInicial(1, s + 1).agenda.chegadas).flat().filter(c => !c.surto);
    const frac = (f: (c: (typeof todas)[number]) => boolean): number => todas.filter(f).length / todas.length;
    expect(frac(c => c.sev === 'red')).toBeCloseTo(0.10, 1);
    expect(frac(c => c.sev === 'green')).toBeCloseTo(0.30, 1);
    expect(frac(c => c.sev === 'green' && c.dest === 'uti')).toBe(0);
    const foraPorPlantao = todas.filter(c => c.foraDoPerfil).length / 200;
    expect(foraPorPlantao).toBeGreaterThan(1.5);
    expect(foraPorPlantao).toBeLessThan(3.5);
  });

  it('surto de 3 pacientes às 12h nas duas rodadas, um deles vermelho para UTI', () => {
    for (const r of [1, 2] as Rodada[]) {
      const e = criarEstadoInicial(r, 3);
      const surto = e.agenda.chegadas.filter(c => c.surto);
      expect(surto).toHaveLength(3);
      expect(surto.every(c => c.minuto === 720)).toBe(true);
      expect(surto.some(c => c.sev === 'red' && c.dest === 'uti')).toBe(true);
      const ocs = avancarAte(e, 720).ocorrencias.filter(o => o.tipo === 'surto');
      expect(ocs).toHaveLength(1);
      expect(ocs[0]!.minuto).toBe(720);
    }
  });

  it('R1 atrasa a sala 1 e avisa com mensagem coerente', () => {
    const e = criarEstadoInicial(1, 4);
    const atraso = Math.round((e.cirurgias[0]!.stH - mkSx()[0]!.stH) * 60);
    expect(atraso).toBeGreaterThanOrEqual(30);
    expect(atraso).toBeLessThanOrEqual(60);
    expect(e.log.some(l => l.msg === `ATRASO: a sala 1 começou ${atraso} min atrasada e as cirurgias dela foram adiadas.`)).toBe(true);
  });

  it('sem sala reservada: a R2 usa a agenda redistribuída sem conflito de horário', () => {
    const e = criarEstadoInicial(2, 2);
    expect(e.flags).toEqual({});
    expect(e.cirurgias.some(c => c.sala === 4)).toBe(true);
    for (const a of e.cirurgias) for (const b of e.cirurgias) if (a.id < b.id) expect(sobrepoem(a, b)).toBe(false);
  });

  it('emergência cirúrgica com a RPA cheia é óbito nas duas rodadas', () => {
    for (const r of [1, 2] as Rodada[]) {
      const rpa = [2, 3, 4].map(id => paciente(id, { sector: 'rpa', ready: true, postOp: true }));
      const vermelho = paciente(1, { sector: 'de', sev: 'red', dest: 'uti', deNeed: 9999 });
      const rs = variosRng(comPacientes(base(r, 600), [vermelho, ...rpa]), 3000).filter(x => x.ocorrencias.some(o => o.tipo === 'emergencia_obito'));
      expect(rs.length).toBeGreaterThan(0);
      expect(rs[0]!.estado.pacientes[0]).toMatchObject({ sector: 'obito', dead: true });
      expect(rs[0]!.estado.carga.emergenciasSemSala).toBe(1);
    }
  });
});

describe('determinismo, imutabilidade e relógio', () => {
  it('mesma semente + mesmas ações ⇒ mesmo resultado', () => {
    for (const r of [1, 2] as Rodada[]) expect(simularPartida(puxaFluxo, r, 123).estado).toEqual(simularPartida(puxaFluxo, r, 123).estado);
  });

  it('o estado sobrevive a JSON (reconexão) e cabe no limite do banco', () => {
    const e = avancarAte(criarEstadoInicial(2, 9), 800).estado;
    const json = JSON.stringify(e);
    expect(json.length).toBeLessThan(512 * 1024);
    expect(avancarAte(JSON.parse(json) as EstadoSimulacao, 1000).estado).toEqual(avancarAte(e, 1000).estado);
  });

  it('passo e aplicarAcao não alteram o estado recebido', () => {
    let e = congelarProfundo(criarEstadoInicial(2, 5));
    e = congelarProfundo(liberarFullCapacity(e).estado);
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

  it('avancarAte(m) é igual a aplicar passo até m', () => {
    const e0 = criarEstadoInicial(2, 77);
    let e = e0;
    const ocs: Ocorrencia[] = [];
    for (let i = 0; i < 300; i++) { const r = passo(e); e = r.estado; ocs.push(...r.ocorrencias); }
    const r = avancarAte(e0, MINUTO_INICIO + 300);
    expect(r.estado).toEqual(e);
    expect(r.ocorrencias).toEqual(ocs);
  });

  it('para às 19h com "Plantão encerrado!"', () => {
    const r = avancarAte(criarEstadoInicial(1, 1), 5000);
    expect(r.estado.minuto).toBe(MINUTO_FIM);
    expect(r.ocorrencias[r.ocorrencias.length - 1]).toMatchObject({ tipo: 'fim', msg: 'Plantão encerrado!' });
    expect(passo(r.estado).estado).toBe(r.estado);
  });

  it('textos sem as grafias antigas sem acento', () => {
    const antigas = /PLANTAO|Plantao|CARDIACA|TOMOGRAFO|Tomografo|LABORATORIO|Laboratorio|decisoes|responsavel|manutencao|RAPIDO|FORA DO PERFIL!/;
    for (const r of [1, 2] as Rodada[]) {
      const res = simularPartida(puxaFluxo, r, 8);
      const msgs = [...res.estado.log.map(l => l.msg), ...avancarAte(criarEstadoInicial(r, 8), MINUTO_FIM).ocorrencias.map(o => o.msg)];
      expect(msgs.filter(m => antigas.test(m))).toEqual([]);
    }
  });
});

describe('fila de Manchester e sala vermelha', () => {
  const deCheio = (n: number) => Array.from({ length: n }, (_, i) => paciente(200 + i, { sector: 'de', dest: 'alta_de', sev: 'yellow', deNeed: 9999 }));

  it('chama por gravidade e depois por ordem de chegada', () => {
    const fila = [
      paciente(1, { sector: 'triagem', sev: 'green', arrMin: 400 }),
      paciente(2, { sector: 'triagem', sev: 'yellow', arrMin: 465 }),
      paciente(3, { sector: 'triagem', sev: 'orange', arrMin: 469 }),
      paciente(4, { sector: 'triagem', sev: 'orange', arrMin: 466 }),
    ];
    const r = passo(comPacientes(base(), [...deCheio(13), ...fila]));
    const setor = (id: number) => r.estado.pacientes.find(p => p.id === id)!.sector;
    expect([setor(4), setor(3)]).toEqual(['de', 'de']);
    expect([setor(2), setor(1)]).toEqual(['triagem', 'triagem']);
  });

  it('vermelho entra com o DE cheio até 2 acima da capacidade; os outros esperam', () => {
    const fila = [paciente(1, { sector: 'triagem', sev: 'red', arrMin: 470 }), paciente(2, { sector: 'triagem', sev: 'orange', arrMin: 460 })];
    let r = passo(comPacientes(base(), [...deCheio(15), ...fila]));
    expect(r.estado.pacientes.find(p => p.id === 1)!.sector).toBe('de');
    expect(r.estado.pacientes.find(p => p.id === 2)!.sector).toBe('triagem');
    r = passo(comPacientes(base(), [...deCheio(17), ...fila]));
    expect(r.estado.pacientes.find(p => p.id === 1)!.sector).toBe('triagem');
  });

  it('SLA: dentro do alvo conta como ok; verde esperando além de 120 min vira falha', () => {
    const fila = [paciente(1, { sector: 'triagem', sev: 'orange', arrMin: 466 }), paciente(2, { sector: 'triagem', sev: 'green', arrMin: 470 - 125 })];
    const r = passo(comPacientes(base(), [...deCheio(14), ...fila]));
    const p1 = r.estado.pacientes.find(p => p.id === 1)!;
    const p2 = r.estado.pacientes.find(p => p.id === 2)!;
    expect(p1).toMatchObject({ sector: 'de', slaOk: true });
    expect(p2).toMatchObject({ sector: 'triagem', slaOk: false, risco: 'alto' });
    expect(slaPct(r.estado)).toBe(50);
  });
});

describe('risco, deterioração e óbito', () => {
  it('halo de risco por boarding e espera', () => {
    const m = 600;
    expect(calcularRisco(paciente(1, { sector: 'de', ready: true, dest: 'enf', sev: 'yellow', bMin: 100 }), m)).toBe('baixo');
    expect(calcularRisco(paciente(1, { sector: 'de', ready: true, dest: 'enf', sev: 'yellow', bMin: 130 }), m)).toBe('atencao');
    expect(calcularRisco(paciente(1, { sector: 'de', ready: true, dest: 'enf', sev: 'yellow', bMin: 180 }), m)).toBe('alto');
    expect(calcularRisco(paciente(1, { sector: 'triagem', sev: 'yellow', arrMin: m - 20 }), m)).toBe('baixo');
    expect(calcularRisco(paciente(1, { sector: 'triagem', sev: 'yellow', arrMin: m - 40 }), m)).toBe('atencao');
    expect(calcularRisco(paciente(1, { sector: 'triagem', sev: 'red', arrMin: m - 1 }), m)).toBe('alto');
    expect(calcularRisco(paciente(1, { sector: 'enf', leitoInadequado: true }), m)).toBe('atencao');
  });

  it('antes do limiar da gravidade não há deterioração em boarding', () => {
    const pts = [paciente(1, { sector: 'de', dest: 'uti', sev: 'red', ready: true, bStart: 471 - 59 })];
    expect(variosRng(comPacientes(base(), pts), 300).every(r => r.estado.stats.dets === 0)).toBe(true);
  });

  it('depois do limiar a chance é por minuto, e a gravidade sobe um nível', () => {
    const pts = [paciente(1, { sector: 'de', dest: 'enf', sev: 'orange', ready: true, bStart: 471 - 130 })];
    const rs = variosRng(comPacientes(base(), pts), 3000);
    const piorou = rs.filter(r => r.estado.stats.dets === 1);
    expect(piorou.length / rs.length).toBeGreaterThan(0.01);
    expect(piorou.length / rs.length).toBeLessThan(0.03);
    expect(piorou[0]!.estado.pacientes[0]).toMatchObject({ det: true, sev: 'red', detMin: 471 });
    expect(piorou[0]!.ocorrencias).toContainEqual(expect.objectContaining({ tipo: 'deterioracao', som: 'det' }));
  });

  it('óbito só depois de deteriorar e de 120 min esperando; sai do DE e para de somar boarding', () => {
    const semDet = [paciente(1, { sector: 'de', dest: 'enf', sev: 'red', ready: true, bStart: 100 })];
    expect(variosRng(comPacientes(base(), semDet), 500).every(r => r.estado.stats.deaths === 0)).toBe(true);
    const detRecente = [paciente(1, { sector: 'de', dest: 'enf', sev: 'red', ready: true, bStart: 100, det: true, detMin: 471 - 119 })];
    expect(variosRng(comPacientes(base(), detRecente), 500).every(r => r.estado.stats.deaths === 0)).toBe(true);
    const detAntigo = [paciente(1, { sector: 'de', dest: 'enf', sev: 'red', ready: true, bStart: 100, det: true, detMin: 300 })];
    const mortes = variosRng(comPacientes(base(), detAntigo), 2000).filter(r => r.estado.stats.deaths === 1);
    expect(mortes.length).toBeGreaterThan(0);
    const e = mortes[0]!.estado;
    expect(e.pacientes[0]).toMatchObject({ sector: 'obito', dead: true });
    expect(metricas(e).deOcc).toBe(0);
    expect(passo(e).estado.stats.boardHrs).toBe(e.stats.boardHrs);
  });

  it('em partidas inteiras, todo óbito por espera tem deterioração ≥ 120 min antes', () => {
    for (let s = 1; s <= 8; s++) {
      const ocs = avancarAte(criarEstadoInicial(1, s), MINUTO_FIM).ocorrencias;
      for (const o of ocs.filter(x => x.tipo === 'obito' || x.tipo === 'obito_espera')) {
        const det = ocs.find(x => x.pacienteId === o.pacienteId && x.tipo.startsWith('deterioracao'));
        expect(det).toBeDefined();
        expect(o.minuto - det!.minuto).toBeGreaterThanOrEqual(120);
      }
    }
  });

  it('leito inadequado: ≈ 25% de piora em 4 h', () => {
    const p4h = 1 - (1 - P_DET_LEITO_INADEQUADO) ** 240;
    expect(p4h).toBeGreaterThan(0.2);
    expect(p4h).toBeLessThan(0.3);
  });

  it('retorno ao DE respeita a capacidade: com o DE cheio, fica na triagem com prioridade máxima', () => {
    const uti = Array.from({ length: 15 }, (_, i) => paciente(300 + i, { sector: 'uti', dest: 'step_down', sev: 'red' }));
    const de = Array.from({ length: 17 }, (_, i) => paciente(400 + i, { sector: 'de', dest: 'alta_de', deNeed: 9999 }));
    const inad = paciente(1, { sector: 'enf', dest: 'uti', sev: 'red', leitoInadequado: true });
    const rs = variosRng(comPacientes(base(), [...uti, ...de, inad]), 3000).filter(r => r.ocorrencias.some(o => o.tipo === 'retorno_de'));
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(r.estado.pacientes.find(p => p.id === 1)).toMatchObject({ sector: 'triagem', retorno: true, det: true });
      expect(metricas(r.estado).deOcc).toBe(17);
    }
  });
});

describe('altas: mesmos pacientes, horários diferentes', () => {
  const prontos = (e: EstadoSimulacao, setor: 'enf' | 'uti'): number[] =>
    e.pacientes.filter(p => p.sector === setor && p.dischReady).map(p => p.id).sort((a, b) => a - b);

  it('lote das 11h da R1 = Bed Huddle das 8h da R2 (preparo zero)', () => {
    for (let s = 1; s <= 5; s++) {
      const r1 = criarEstadoInicial(1, s);
      const lote = r1.agenda.altas.find(l => l.chave === 'enf1')!.pacientes.map(x => x.id).sort((a, b) => a - b);
      expect(lote.length).toBeGreaterThanOrEqual(6);
      expect(lote.length).toBeLessThanOrEqual(8);
      const r2as8 = avancarAte(criarEstadoInicial(2, s), 480).estado;
      expect(prontos(avancarAte(criarEstadoInicial(2, s), 479).estado, 'enf')).toEqual([]);
      expect(prontos(r2as8, 'enf')).toEqual(lote);
      expect(r2as8.pacientes.filter(p => lote.includes(p.id)).every(p => p.prep === 0)).toBe(true);
      const r1as11 = avancarAte(r1, 660).estado;
      expect(prontos(avancarAte(r1, 659).estado, 'enf')).toEqual([]);
      expect(prontos(r1as11, 'enf')).toEqual(lote);
      expect(r1as11.pacientes.filter(p => lote.includes(p.id)).every(p => p.prep >= 119 && p.prep <= 179)).toBe(true);
    }
  });

  it('step-downs da UTI: mesmos pacientes às 11h (R1) e às 9h (R2)', () => {
    const r1 = avancarAte(criarEstadoInicial(1, 3), 660).estado;
    const r2 = avancarAte(criarEstadoInicial(2, 3), 540).estado;
    expect(prontos(r2, 'uti')).toEqual(prontos(r1, 'uti'));
    expect(prontos(r1, 'uti')).toHaveLength(LOTES_ALTA.uti1.quantidade[0]);
  });

  it('lote das 14h da R1 fica pronto às 12h na R2', () => {
    const e = criarEstadoInicial(2, 6);
    const lote = e.agenda.altas.find(l => l.chave === 'enf2')!.pacientes.map(x => x.id);
    const as12 = avancarAte(e, 720);
    expect(as12.ocorrencias.some(o => o.msg.startsWith('ROUND 12h:'))).toBe(true);
    expect(as12.estado.pacientes.filter(p => lote.includes(p.id)).every(p => p.dischReady || p.sector !== 'enf')).toBe(true);
  });
});

describe('centro cirúrgico', () => {
  const cx = (extra: Partial<CirurgiaSim> = {}): CirurgiaSim => ({ id: 1, label: 'Cx Eletiva 1', sala: 1, stH: 7, dur: 2, dest: 'enf', st: 'scheduled', ...extra });

  it('cancela antes de iniciar quando a RPA está reservada (pacientes + cirurgias em andamento)', () => {
    const rpa = [paciente(2, { sector: 'rpa', ready: true, postOp: true })];
    const andamento = [cx({ id: 8, st: 'andamento', stH: 6.5 }), cx({ id: 9, st: 'andamento', stH: 6.5 })];
    const r = passo(comPacientes(base(), rpa, { cirurgias: [cx(), ...andamento] }));
    expect(r.estado.cirurgias[0]!.st).toBe('cancelled');
    expect(r.estado.stats.cxCan).toBe(1);
    expect(r.ocorrencias).toContainEqual(expect.objectContaining({ tipo: 'cirurgia_cancelada', msg: 'Cx Eletiva 1 cancelada antes de iniciar: sem leito/RPA.' }));
  });

  it('cancela sem leito de destino, mas começa se houver alta pronta liberando o leito', () => {
    const enfCheia = Array.from({ length: 85 }, (_, i) => paciente(100 + i, { sector: 'enf' }));
    expect(passo(comPacientes(base(), enfCheia, { cirurgias: [cx()] })).estado.cirurgias[0]!.st).toBe('cancelled');
    enfCheia[0] = { ...enfCheia[0]!, dischReady: true, prep: 0 };
    const r = passo(comPacientes(base(), enfCheia, { cirurgias: [cx()] }));
    expect(r.estado.cirurgias[0]!.st).toBe('andamento');
    expect(r.estado.carga.automatico.cirurgiasViabilizadas).toBe(1);
  });

  it('em andamento, termina no horário e manda o pós-operatório para a RPA', () => {
    const e = comPacientes(base(1, 539), [], { cirurgias: [cx({ st: 'andamento' })] });
    const r = passo(e);
    expect(r.estado.cirurgias[0]!.st).toBe('done');
    expect(r.estado.pacientes).toContainEqual(expect.objectContaining({ name: 'PO-Eletiva 1', sector: 'rpa', postOp: true }));
  });

  it('a alta bloqueada pelo efeito cascata libera depois de 120 min', () => {
    const rpa = [2, 3, 4].map(id => paciente(id, { sector: 'rpa', ready: true, postOp: true }));
    const alta = paciente(5, { sector: 'enf', dischReady: true, prep: 0 });
    let e = passo(comPacientes(base(), [...rpa, alta], { cirurgias: [cx()] })).estado;
    expect(e.pacientes.find(p => p.id === 5)).toMatchObject({ blocked: true, dischReady: false, bloqueioAte: 471 + BLOQUEIO_CASCATA_MIN });
    e = avancarAte(e, 471 + BLOQUEIO_CASCATA_MIN - 1).estado;
    expect(e.pacientes.find(p => p.id === 5)!.blocked).toBe(true);
    const r = passo(e);
    expect(r.estado.pacientes.find(p => p.id === 5)).toMatchObject({ blocked: false, dischReady: true });
    expect(r.ocorrencias.some(o => o.tipo === 'bloqueio_fim')).toBe(true);
  });
});

describe('ferramentas e eventos', () => {
  it('Fast Track: na R2 o verde vai para a área própria (4 vagas) e decide 40% mais rápido; na R1 vai ao DE', () => {
    const verdes = Array.from({ length: 5 }, (_, i) => paciente(i + 1, { sector: 'triagem', sev: 'green', dest: 'alta_de', arrMin: 465 + i, deNeed: 50 }));
    const r2 = passo(comPacientes(base(2), verdes)).estado;
    expect(metricas(r2).fastTrackOcc).toBe(FAST_TRACK_VAGAS);
    expect(r2.pacientes.find(p => p.id === 1)).toMatchObject({ sector: 'fast_track', deNeed: 30 });
    expect(r2.pacientes.find(p => p.id === 5)!.sector).toBe('de');
    expect(metricas(r2).deOcc).toBe(1);
    const r1 = passo(comPacientes(base(1), verdes)).estado;
    expect(metricas(r1).fastTrackOcc).toBe(0);
    expect(metricas(r1).deOcc).toBe(5);
  });

  it('Fluxista dá alta automática a cada 20 min na R2 e conta em libDE', () => {
    const pronto = paciente(1, { sector: 'de', dest: 'alta_de', sev: 'green', ready: true });
    const r = passo(comPacientes(base(2, 479), [pronto]));
    expect(r.estado.pacientes[0]!.sector).toBe('alta');
    expect(r.estado.stats).toMatchObject({ disc: 1, libDE: 1 });
    expect(passo(comPacientes(base(1, 479), [pronto])).estado.pacientes[0]!.sector).toBe('de');
  });

  it('tomógrafo atrasa todos em avaliação (+120 na R1, +60 na R2)', () => {
    for (const [r, extra] of [[1, 120], [2, 60]] as const) {
      const avaliando = paciente(1, { sector: 'de', dest: 'enf', deNeed: 200, deSpent: 0 });
      const comTomo = variosRng(comPacientes(base(r, 500), [avaliando]), 3000).find(x => x.ocorrencias.some(o => o.tipo === 'tomografo'));
      expect(comTomo).toBeDefined();
      expect(comTomo!.estado.pacientes[0]!.deNeed).toBe(200 + extra);
    }
  });

  it('evento social sem paciente elegível tenta de novo depois', () => {
    const semElegivel = variosRng(comPacientes(base(1, 660), [paciente(1, { sector: 'enf' })]), 3000);
    expect(semElegivel.every(r => !r.estado.eventos.social)).toBe(true);
    const elegivel = variosRng(comPacientes(base(1, 660), [paciente(1, { sector: 'enf', dischReady: true, prep: 0 })]), 3000);
    expect(elegivel.some(r => r.estado.eventos.social && r.estado.pacientes[0]!.social)).toBe(true);
  });

  const ptsNir = () => [
    paciente(1, { sector: 'de', dest: 'transferencia', foraDoPerfil: true, ready: true, bStart: 465 }),
    ...[2, 3, 4].map(id => paciente(id, { sector: 'de', dest: 'enf', ready: true, bStart: 465 })),
  ];
  const nir = (id: number): Acao => ({ tipo: 'nir', pacienteId: id });

  it('NIR na R2: transferência de 60 min ocupando a maca, 3 usos, 60 min de espera entre usos', () => {
    let e = comPacientes(base(2), ptsNir());
    expect(destinosPossiveis(e, 1)).toEqual([]);
    expect(metricas(e).boarding).toBe(4);
    const r = ok(aplicarAcao(e, nir(1)));
    expect(r.estado.pacientes.find(p => p.id === 1)).toMatchObject({ sector: 'de', transferenciaAte: 530 });
    expect(metricas(r.estado).boarding).toBe(4);
    expect(r.ocorrencias[0]).toMatchObject({ tipo: 'nir', decisao: 'produtiva' });
    expect(falha(aplicarAcao(r.estado, nir(1))).erro).toMatch(/em andamento/);
    e = r.estado;
    expect(falha(aplicarAcao(e, nir(2))).erro).toMatch(/espera/);
    const quase = avancarAte(e, 529).estado;
    expect(quase.pacientes.find(p => p.id === 1)!.sector).toBe('de');
    const saiu = passo(quase);
    expect(saiu.estado.pacientes.find(p => p.id === 1)).toMatchObject({ sector: 'alta', transferido: true });
    expect(saiu.ocorrencias.some(o => o.tipo === 'nir_concluido')).toBe(true);
    e = ok(aplicarAcao(saiu.estado, nir(2))).estado;
    e = ok(aplicarAcao(avancarAte(e, e.minuto + 60).estado, nir(3))).estado;
    e = avancarAte(e, e.minuto + 60).estado;
    expect(falha(aplicarAcao(e, nir(4))).erro).toMatch(/esgotado/);
  });

  it('NIR na R1: sem espera entre usos, mas a transferência leva de 180 a 240 min (gerador de eventos)', () => {
    let e = comPacientes(base(1), ptsNir());
    const r = ok(aplicarAcao(e, nir(1)));
    const ate = r.estado.pacientes.find(p => p.id === 1)!.transferenciaAte;
    expect(ate - 470).toBeGreaterThanOrEqual(180);
    expect(ate - 470).toBeLessThanOrEqual(240);
    expect(r.estado.rng).not.toBe(e.rng);
    expect(ok(aplicarAcao(e, nir(1))).estado).toEqual(r.estado);
    e = ok(aplicarAcao(r.estado, nir(2))).estado;
    e = ok(aplicarAcao(e, nir(3))).estado;
    expect(falha(aplicarAcao(e, nir(4))).erro).toMatch(/esgotado/);
    expect(metricas(e).deOcc).toBe(4);
  });

  it('fora do perfil conta como boarding e tem o risco da sua gravidade', () => {
    const fora = paciente(1, { sector: 'de', dest: 'transferencia', foraDoPerfil: true, sev: 'red', ready: true, bStart: 470 - 70 });
    const e = passo(comPacientes(base(1), [fora])).estado;
    expect(e.pacientes[0]!.risco).toBe('alto');
    expect(e.stats.boardHrs).toBeGreaterThan(0);
    expect(metricas(e).aguardandoTransferencia).toBe(1);
  });

  it('PCP: corredor da enfermaria com 2 vagas, só com liberação do facilitador, encerra o boarding', () => {
    const pts = [1, 2, 3].map(id => paciente(id, { sector: 'de', dest: 'enf', ready: true, bStart: 460 }));
    const pcp = (id: number): Acao => ({ tipo: 'fullCapacity', pacienteId: id });
    let e = comPacientes(base(2), pts);
    expect(falha(aplicarAcao(e, pcp(1))).codigo).toBe('ferramenta_indisponivel');
    e = liberarFullCapacity(e).estado;
    e = ok(aplicarAcao(e, pcp(1))).estado;
    e = ok(aplicarAcao(e, pcp(2))).estado;
    expect(metricas(e)).toMatchObject({ enfExtraOcc: ENF_EXTRA_VAGAS, boarding: 1, corredor: 0 });
    expect(falha(aplicarAcao(e, pcp(3))).codigo).toBe('lotado');
    expect(destinosPossiveis(e, 1)).toEqual(['enf']);
    const depois = passo(e).estado;
    expect(depois.pacientes.find(p => p.id === 1)!.sector).toBe('enf_extra');
    expect(falha(aplicarAcao(comPacientes(base(1), pts), pcp(1))).codigo).toBe('ferramenta_indisponivel');
  });

  it('leito inadequado: exige confirmação e penaliza', () => {
    const e = comPacientes(base(), [paciente(1, { sector: 'de', dest: 'uti', sev: 'red', ready: true })]);
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'enf' })).codigo).toBe('confirmar_leito_inadequado');
    const r = ok(aplicarAcao(e, { tipo: 'confirmarLeitoInadequado', pacienteId: 1 }));
    expect(r.estado.pacientes[0]).toMatchObject({ sector: 'enf', leitoInadequado: true });
    expect(metricas(r.estado).leitoInadequado).toBe(1);
    expect(pontuacao(r.estado)).toBe(1500 - 25 + 150);
  });

  it('recusa destino inválido, paciente inexistente e setor lotado, com concordância', () => {
    const cheia = Array.from({ length: 85 }, (_, i) => paciente(100 + i, { sector: 'enf' }));
    const e = comPacientes(base(), [paciente(1, { sector: 'de', dest: 'enf', ready: true }), ...cheia]);
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'uti' })).erro).toBe('Teste 1 não pode ir para a UTI agora.');
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 999, destino: 'enf' })).codigo).toBe('paciente_inexistente');
    expect(falha(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'enf' }))).toEqual({ codigo: 'lotado', erro: 'ENF LOTADA!' });
  });

  it('carga do gestor: decisões produtivas e reativas', () => {
    let e = comPacientes(base(), [paciente(1, { sector: 'de', dest: 'alta_de', ready: true }), paciente(2, { sector: 'corredor' })]);
    e = ok(aplicarAcao(e, { tipo: 'mover', pacienteId: 1, destino: 'alta' })).estado;
    e = ok(aplicarAcao(e, { tipo: 'mover', pacienteId: 2, destino: 'de' })).estado;
    expect(metricas(e)).toMatchObject({ decisoes: 2, decisoesProdutivas: 1, decisoesReativas: 1 });
  });

  it('sem bônus exclusivo da R2: mesmas estatísticas, mesma pontuação', () => {
    const r1 = criarEstadoInicial(1, 1);
    const r2 = { ...criarEstadoInicial(2, 1), stats: r1.stats };
    expect(pontuacao(r2)).toBe(pontuacao(r1));
    expect(pontuacao(r1)).toBe(calcScore(r1.stats));
  });

  it('pontuação soma +2 por atendido dentro do tempo-alvo e não tem piso de 50', () => {
    const e = comPacientes(base(), [paciente(1, { sector: 'de', slaOk: true }), paciente(2, { sector: 'de', slaOk: false })]);
    expect(pontuacao(e)).toBe(1500 + 150 + 2);
    expect(pontuacao({ ...e, stats: { ...e.stats, deaths: 20 } })).toBe(0);
  });

  it('capacidades: UTI e RPA nunca passam do limite em partidas inteiras', () => {
    for (let s = 1; s <= 5; s++) {
      const e = simularPartida(puxaFluxo, 2, s).estado;
      expect(metricas(e).utiOcc).toBeLessThanOrEqual(CAP.uti);
      expect(metricas(e).rpaOcc).toBeLessThanOrEqual(CAP.rpa);
    }
  });
});
