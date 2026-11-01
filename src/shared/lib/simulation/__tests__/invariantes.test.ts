import { describe, it, expect } from 'vitest';
import { CAP } from '../../constants';
import { calcScore } from '../../game-engine';
import { aplicarAcao, capacidadeSetor, criarEstadoInicial, ehErro, passo, pontuacao, MINUTO_FIM, MINUTO_INICIO } from '../motor';
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
  expect(pontuacao(e)).toBe(calcScore({ ...e.stats, isR2: e.rodada === 2 }));
  expect(e.log.length).toBeLessThanOrEqual(60);
  expect(e.ferramentas.nirUsos).toBeLessThanOrEqual(3);
  expect(e.ferramentas.fcUsos).toBeLessThanOrEqual(2);
}

describe('invariantes em partidas inteiras', () => {
  for (const [nome, estrategia] of Object.entries(ESTRATEGIAS)) {
    for (const rodada of [1, 2] as Rodada[]) {
      it(`${nome} · R${rodada}`, () => {
        for (const semente of SEMENTES) {
          let e = criarEstadoInicial(rodada, semente, { ccBlocked: semente % 2 === 0 });
          let versao = e.versao;
          while (e.minuto < MINUTO_FIM) {
            for (let i = 0; i < 2; i++) {
              const acao = estrategia(e);
              if (!acao) break;
              const r = aplicarAcao(e, acao);
              if (ehErro(r)) break;
              // Ação do grupo nunca passa da capacidade do setor de destino
              const destino = acao.tipo === 'mover' ? acao.destino : acao.tipo === 'confirmarForaDoPerfil' ? 'enf' : null;
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
          expect(e.eventos.surto || rodada === 2).toBe(true);
        }
      }, 60_000);
    }
  }
});
