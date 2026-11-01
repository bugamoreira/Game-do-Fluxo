import { describe, expect, it } from 'vitest';
import { contarPorRotulo, eventosMarcantes, evolucaoPorHora, horaDoMinuto, temEvolucao, type EventoBasico } from '../evolucao';

describe('evolução por hora', () => {
  it('média dos grupos com o último ponto de cada um até a hora', () => {
    const series = [
      { grupoId: 'a', rodada: 1 as const, minuto: 420, metricas: { deOcc: 4 } },
      { grupoId: 'a', rodada: 1 as const, minuto: 480, metricas: { deOcc: 10 } },
      { grupoId: 'b', rodada: 1 as const, minuto: 420, metricas: { deOcc: 6 } },
      { grupoId: 'a', rodada: 2 as const, minuto: 450, metricas: { deOcc: 3 } },
    ];
    const pontos = evolucaoPorHora(series, (m) => m.deOcc);
    expect(pontos).toHaveLength(13);
    expect(pontos[0]).toEqual({ hora: 7, r1: 5, r2: 3 });
    expect(pontos[1]).toEqual({ hora: 8, r1: 8, r2: 3 });
    expect(temEvolucao(pontos, 2)).toBe(true);
    expect(temEvolucao(evolucaoPorHora([], (m) => m.deOcc))).toBe(false);
  });

  it('métrica ausente vira hora sem dado', () => {
    const pontos = evolucaoPorHora([{ grupoId: 'a', rodada: 1, minuto: 420, metricas: {} }], (m) => m.boarding);
    expect(pontos.every((p) => p.r1 === null && p.r2 === null)).toBe(true);
  });
});

describe('eventos marcantes', () => {
  const ev = (id: number, tipo: string, rodada: 1 | 2 = 1, minuto = 600): EventoBasico => ({
    id, grupoId: 'g', nome: 'Grupo', cor: '#123456', rodada, minuto, tipo, mensagem: '',
  });

  it('reconhece os tipos gravados pelo jogo e ignora os demais', () => {
    const lista = eventosMarcantes([ev(1, 'surto'), ev(2, 'movimento'), ev(3, 'de_lotado'), ev(4, 'nir', 2)]);
    expect(lista.map((e) => e.rotulo)).toEqual(['Surto de chegadas', 'DE lotado', 'NIR acionado']);
    expect(lista.find((e) => e.tipo === 'nir')?.problema).toBe(false);
  });

  it('filtra por rodada, respeita o limite e conta por rótulo', () => {
    const base = [ev(1, 'obito'), ev(2, 'obito'), ev(3, 'corredor'), ev(4, 'lwbs', 2)];
    expect(eventosMarcantes(base, { rodada: 1, limite: 2 })).toHaveLength(2);
    expect(contarPorRotulo(eventosMarcantes(base, { rodada: 1 }))[0]).toEqual({ rotulo: 'Óbito', problema: true, total: 2 });
  });

  it('hora do plantão a partir do minuto', () => {
    expect(horaDoMinuto(420)).toBe('07:00');
    expect(horaDoMinuto(1139)).toBe('18:59');
  });
});
