import { describe, expect, it } from 'vitest';
import {
  avancarAte,
  criarEstadoInicial,
  destinosPossiveis,
  passo,
  type EstadoSimulacao,
  type PacienteSim,
} from '../../shared/lib/simulation';
import { avancarComMarcos, criarStoreJogo, type LoteOcorrencias, type PontoSerie } from '../jogo/storeJogo';
import { metricas } from '../../shared/lib/simulation';

const SEMENTE = 2026;

/** Avança o motor até achar um paciente que satisfaça o critério. */
function ateAchar(rodada: 1 | 2, criterio: (p: PacienteSim, e: EstadoSimulacao) => boolean): { estado: EstadoSimulacao; paciente: PacienteSim } {
  let e = criarEstadoInicial(rodada, SEMENTE);
  while (e.minuto < 1140) {
    const p = e.pacientes.find(x => criterio(x, e));
    if (p) return { estado: e, paciente: p };
    e = passo(e).estado;
  }
  throw new Error('paciente não encontrado no plantão');
}

function comOuvinte() {
  const store = criarStoreJogo();
  const lotes: LoteOcorrencias[] = [];
  store.getState().assinarOcorrencias(l => lotes.push(l));
  return { store, lotes };
}

describe('store do jogo: relógio', () => {
  it('carregar avança até o minuto da sala e marca as ocorrências como lote (sem rajada de sons)', () => {
    const { store, lotes } = comOuvinte();
    store.getState().carregar(criarEstadoInicial(1, SEMENTE), 600);
    expect(store.getState().estado!.minuto).toBe(600);
    expect(lotes.length).toBeGreaterThan(0);
    expect(lotes.every(l => l.emLote)).toBe(true);
  });

  it('avancarPara anda minuto a minuto e nunca volta', () => {
    const { store, lotes } = comOuvinte();
    store.getState().carregar(criarEstadoInicial(1, SEMENTE));
    expect(store.getState().avancarPara(421)).toBe(1);
    expect(store.getState().avancarPara(421)).toBe(0);
    expect(store.getState().avancarPara(400)).toBe(0);
    expect(store.getState().estado!.minuto).toBe(421);
    store.getState().avancarPara(700);
    expect(store.getState().estado!.minuto).toBe(700);
    expect(lotes[lotes.length - 1]!.emLote).toBe(true);
  });

  it('guarda o resumo ao chegar às 19h e mantém o da rodada anterior ao trocar de rodada', () => {
    const store = criarStoreJogo();
    store.getState().carregar(criarEstadoInicial(1, SEMENTE));
    store.getState().avancarPara(1140);
    const r1 = store.getState().resumos[1];
    expect(r1).toBeDefined();
    store.getState().carregar(criarEstadoInicial(2, SEMENTE));
    expect(store.getState().resumos[1]).toEqual(r1);
    expect(store.getState().resumos[2]).toBeUndefined();
  });
});

describe('store do jogo: decisões', () => {
  it('seleciona o paciente, aplica o destino do motor e limpa a seleção', () => {
    const { estado, paciente } = ateAchar(1, (p, e) => destinosPossiveis(e, p.id).length > 0);
    const store = criarStoreJogo();
    store.getState().carregar(estado);
    store.getState().selecionar(paciente.id);
    expect(store.getState().selecionadoId).toBe(paciente.id);
    const destino = destinosPossiveis(estado, paciente.id)[0]!;
    store.getState().mover(destino === 'enf' && paciente.dest === 'uti' ? 'uti' : destino);
    const s = store.getState();
    if (!s.aviso && !s.confirmacao) {
      expect(s.selecionadoId).toBeNull();
      expect(s.estado!.versao).toBeGreaterThan(estado.versao);
    }
  });

  it('clicar de novo no mesmo paciente desfaz a seleção', () => {
    const store = criarStoreJogo();
    const e = criarEstadoInicial(1, SEMENTE);
    store.getState().carregar(e);
    const id = e.pacientes.find(p => p.sector === 'de')!.id;
    store.getState().selecionar(id);
    store.getState().selecionar(id);
    expect(store.getState().selecionadoId).toBeNull();
  });

  it('erro do motor vira aviso em português e não muda o estado', () => {
    const store = criarStoreJogo();
    const e = criarEstadoInicial(1, SEMENTE);
    store.getState().carregar(e);
    const emAvaliacao = e.pacientes.find(p => p.sector === 'de' && !p.ready)!;
    store.getState().selecionar(emAvaliacao.id);
    store.getState().mover('alta');
    expect(store.getState().aviso?.texto).toMatch(/ainda não pode receber alta/);
    expect(store.getState().estado).toBe(e);
  });

  it('leito inadequado pede confirmação antes de internar na enfermaria', () => {
    const { estado, paciente } = ateAchar(1, p => p.sector === 'de' && p.ready && p.dest === 'uti' && !p.dead);
    const store = criarStoreJogo();
    store.getState().carregar(estado);
    store.getState().selecionar(paciente.id);
    store.getState().mover('enf');
    const c = store.getState().confirmacao;
    if (!c) {
      expect(store.getState().aviso?.texto).toMatch(/LOTAD/); // enfermaria cheia neste plantão
      return;
    }
    expect(c.texto).toMatch(/precisa de UTI/);
    store.getState().confirmarLeitoInadequado();
    const p = store.getState().estado!.pacientes.find(x => x.id === paciente.id)!;
    expect(p.sector).toBe('enf');
    expect(p.leitoInadequado).toBe(true);
    expect(store.getState().confirmacao).toBeNull();
  });

  it('NIR no Travado deixa a transferência em andamento, com horário previsto de saída', () => {
    const { estado, paciente } = ateAchar(1, p => p.sector === 'de' && p.ready && !p.dead && (p.dest === 'enf' || p.dest === 'uti' || p.dest === 'transferencia'));
    const store = criarStoreJogo();
    store.getState().carregar(estado);
    store.getState().selecionar(paciente.id);
    store.getState().usarNir();
    const p = store.getState().estado!.pacientes.find(x => x.id === paciente.id)!;
    expect(p.transferenciaAte).toBeGreaterThanOrEqual(estado.minuto + 180);
    expect(store.getState().estado!.ferramentas.nirUsos).toBe(1);
  });

  it('PCP só é liberado no Lean, uma vez', () => {
    const store = criarStoreJogo();
    store.getState().carregar(criarEstadoInicial(1, SEMENTE));
    store.getState().liberarFullCapacity();
    expect(store.getState().estado!.ferramentas.fcLiberado).toBe(false);
    store.getState().carregar(avancarAte(criarEstadoInicial(2, SEMENTE), 500).estado);
    store.getState().liberarFullCapacity();
    const versao = store.getState().estado!.versao;
    expect(store.getState().estado!.ferramentas.fcLiberado).toBe(true);
    store.getState().liberarFullCapacity();
    expect(store.getState().estado!.versao).toBe(versao);
  });

  it('PCP revogado pelo facilitador chega ao jogo', () => {
    const store = criarStoreJogo();
    store.getState().carregar(avancarAte(criarEstadoInicial(2, SEMENTE), 500).estado);
    store.getState().liberarFullCapacity();
    store.getState().revogarFullCapacity();
    expect(store.getState().estado!.ferramentas.fcLiberado).toBe(false);
    const versao = store.getState().estado!.versao;
    store.getState().revogarFullCapacity();
    expect(store.getState().estado!.versao).toBe(versao);
  });

  it('a seleção some quando o paciente sai do hospital', () => {
    const { estado, paciente } = ateAchar(1, (p, e) => destinosPossiveis(e, p.id).includes('alta') && p.sector === 'de');
    const store = criarStoreJogo();
    store.getState().carregar(estado);
    store.getState().selecionar(paciente.id);
    store.getState().mover('alta');
    expect(store.getState().estado!.pacientes.find(x => x.id === paciente.id)!.sector).toBe('alta');
    store.getState().selecionar(paciente.id);
    expect(store.getState().selecionadoId).toBeNull();
  });
});

describe('série de métricas na recuperação', () => {
  it('ao voltar depois de 2 h fora, registra cada marco de 30 min com as métricas daquele minuto', () => {
    const store = criarStoreJogo();
    const pontos: PontoSerie[] = [];
    store.getState().assinarSerie(p => pontos.push(p));
    const inicio = avancarAte(criarEstadoInicial(1, SEMENTE), 455).estado;
    store.getState().carregar(inicio, 575);
    expect(pontos.map(p => p.minuto)).toEqual([480, 510, 540, 570]);
    expect(pontos[1]!.metricas).toEqual(metricas(avancarAte(inicio, 510).estado));
    expect(store.getState().estado!.minuto).toBe(575);
  });

  it('jogo novo registra as 7h e o relógio normal registra cada marco uma vez', () => {
    const store = criarStoreJogo();
    const pontos: PontoSerie[] = [];
    store.getState().assinarSerie(p => pontos.push(p));
    store.getState().carregar(criarEstadoInicial(2, SEMENTE));
    for (let m = 421; m <= 481; m++) store.getState().avancarPara(m);
    expect(pontos.map(p => [p.rodada, p.minuto])).toEqual([[2, 420], [2, 450], [2, 480]]);
  });

  it('avançar em trechos pelos marcos dá o mesmo estado que avançar direto', () => {
    const e = criarEstadoInicial(1, SEMENTE);
    expect(avancarComMarcos(e, 700).estado).toEqual(avancarAte(e, 700).estado);
  });
});
