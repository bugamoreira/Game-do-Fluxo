import { describe, it, expect } from 'vitest';
import { CAP } from '../../constants';
import { calcScore } from '../../game-engine';
import { aplicarAcao, capacidadeSetor, criarEstadoInicial, ehErro, liberarFullCapacity, passo, pontuacao, MINUTO_FIM, MINUTO_INICIO } from '../motor';
import { ENF_EXTRA_VAGAS, FAST_TRACK_VAGAS, SALA_VERMELHA_EXTRA } from '../constantes';
import { ESTRATEGIAS } from '../estrategias';
import type { EstadoSimulacao, Rodada } from '../types';

const SEMENTES = [1, 2, 3, 4, 5, 42];

function contar(e: EstadoSimulacao, setor: string): number {
  return e.pacientes.filter(p => p.sector === setor).length;
}

function verificar(e: EstadoSimulacao): void {
  expect(e.minuto).toBeGreaterThanOrEqual(MINUTO_INICIO);
  expect(e.minuto).toBeLessThanOrEqual(MINUTO_FIM);
  expect(contar(e, 'enf')).toBeLessThanOrEqual(CAP.enf);
  expect(contar(e, 'uti')).toBeLessThanOrEqual(CAP.uti);
  expect(contar(e, 'rpa')).toBeLessThanOrEqual(CAP.rpa);
  expect(contar(e, 'de')).toBeLessThanOrEqual(CAP.de + SALA_VERMELHA_EXTRA);
  expect(contar(e, 'fast_track')).toBeLessThanOrEqual(FAST_TRACK_VAGAS);
  expect(contar(e, 'enf_extra')).toBeLessThanOrEqual(ENF_EXTRA_VAGAS);
  expect(pontuacao(e)).toBe(calcScore({ ...e.stats, atendidosNoAlvo: e.pacientes.filter(p => p.slaOk === true).length }));
  expect(pontuacao(e)).toBeGreaterThanOrEqual(0);
  expect(e.pacientes.filter(p => p.dead).every(p => p.sector === 'obito')).toBe(true);
  expect(e.log.length).toBeLessThanOrEqual(60);
  expect(e.ferramentas.nirUsos).toBeLessThanOrEqual(3);
}

describe('invariantes em partidas inteiras', () => {
  for (const [nome, estrategia] of Object.entries(ESTRATEGIAS)) {
    for (const rodada of [1, 2] as Rodada[]) {
      it(`${nome} · R${rodada}`, () => {
        for (const semente of SEMENTES) {
          let e = criarEstadoInicial(rodada, semente);
          if (rodada === 2) e = liberarFullCapacity(e).estado;
          let versao = e.versao;
          while (e.minuto < MINUTO_FIM) {
            for (let i = 0; i < 2; i++) {
              const acao = estrategia(e);
              if (!acao) break;
              const r = aplicarAcao(e, acao);
              if (ehErro(r)) break;
              // Ação do grupo nunca passa da capacidade do setor de destino
              const destino = acao.tipo === 'mover' ? acao.destino : acao.tipo === 'confirmarLeitoInadequado' ? 'enf' : acao.tipo === 'fullCapacity' ? 'enf_extra' : null;
              if (destino && destino !== 'alta') {
                expect(contar(r.estado, destino)).toBeLessThanOrEqual(capacidadeSetor(r.estado, destino));
              }
              expect(r.estado.versao).toBe(versao + 1);
              expect(r.estado.minuto).toBe(e.minuto);
              e = r.estado;
              versao = e.versao;
              verificar(e);
            }
            const r = passo(e);
            expect(r.estado.minuto).toBe(e.minuto + 1);
            expect(r.estado.versao).toBe(versao + 1);
            e = r.estado;
            versao = e.versao;
            verificar(e);
            expect(r.ocorrencias.every(o => o.minuto === e.minuto)).toBe(true);
          }
          expect(new Set(e.pacientes.map(p => p.id)).size).toBe(e.pacientes.length);
          expect(e.eventos.surto).toBe(true);
          expect(e.chegadasProcessadas).toBe(e.agenda.chegadas.length);
        }
      }, 60_000);
    }
  }
});
