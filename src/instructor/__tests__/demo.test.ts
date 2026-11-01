import { describe, expect, it } from 'vitest';
import { CodigoEmUso, TransicaoInvalida } from '../../shared/services/erros';
import { criarServicoDemo } from '../demo/servicoDemo';
import { PresencaGrupos } from '../useTurmaFacilitador';

function relogio(inicio = Date.parse('2026-11-25T10:00:00Z')) {
  let t = inicio;
  return { agora: () => t, avancar: (ms: number) => (t += ms) };
}

describe('serviço de demonstração', () => {
  it('abre a turma com 6 grupos e percorre todas as fases', async () => {
    const r = relogio();
    const s = criarServicoDemo({ fase: 'nova', agora: r.agora });
    const t = await s.abrirTurma({ codigo: 'cbmede', nome: 'Turma 1' });
    expect(t.codigo).toBe('CBMEDE');
    expect(t.grupos).toHaveLength(6);
    expect(t.grupos.filter((g) => !g.conectado)).toHaveLength(1);

    for (const status of ['rodada1', 'debrief', 'rodada2', 'encerrada'] as const) {
      const nova = await s.mudarStatus(t.id, status);
      expect(nova.status).toBe(status);
    }
    const ranking = await s.ranking('CBMEDE');
    expect(ranking.filter((i) => i.rodada === 1)).toHaveLength(6);
    expect(ranking.filter((i) => i.rodada === 2)).toHaveLength(6);
    const { slug } = await s.gerarRelatorio(t.id);
    expect((await s.estado('CBMEDE')).status).toBe('arquivada');
    expect((await s.gerarRelatorio(t.id)).slug).toBe(slug);
  });

  it('recusa transição fora do diagrama, como o servidor', async () => {
    const s = criarServicoDemo({ fase: 'sala' });
    const t = await s.estado('CBMEDE');
    await expect(s.mudarStatus(t.id, 'debrief')).rejects.toBeInstanceOf(TransicaoInvalida);
  });

  it('recusa código em uso e aceita com substituir', async () => {
    const s = criarServicoDemo({ fase: 'r1' });
    await expect(s.abrirTurma({ codigo: 'CBMEDE', nome: 'Outra' })).rejects.toBeInstanceOf(CodigoEmUso);
    const nova = await s.abrirTurma({ codigo: 'CBMEDE', nome: 'Outra', substituir: true });
    expect(nova.status).toBe('aberta');
    expect((await s.estado('CBMEDE')).id).toBe(nova.id);
  });

  it('pausa congela o relógio da rodada', async () => {
    const r = relogio();
    const s = criarServicoDemo({ fase: 'r1', agora: r.agora });
    const t = await s.estado('CBMEDE');
    const pausada = await s.pausar(t.id);
    r.avancar(60_000);
    const depois = await s.estado('CBMEDE');
    expect(depois.minuto).toBe(pausada.minuto);
    await s.retomar(t.id);
    r.avancar(10_000);
    expect((await s.estado('CBMEDE')).minuto).toBe((pausada.minuto ?? 0) + 10);
  });

  it('remover grupo tira da leitura pública e mantém na visão do facilitador', async () => {
    const s = criarServicoDemo({ fase: 'sala' });
    const t = await s.estado('CBMEDE');
    const alvo = t.grupos[0]!;
    const visao = await s.removerGrupo(alvo.id);
    expect(visao.grupos.find((g) => g.id === alvo.id)?.removido).toBe(true);
    expect((await s.estado('CBMEDE')).grupos.some((g) => g.id === alvo.id)).toBe(false);
  });

  it('o Lean melhora a pontuação e reduz a carga do gestor nos dados de demonstração', async () => {
    const s = criarServicoDemo({ fase: 'resultado' });
    const ranking = await s.ranking('CBMEDE');
    for (const r1 of ranking.filter((i) => i.rodada === 1)) {
      const r2 = ranking.find((i) => i.rodada === 2 && i.grupoId === r1.grupoId)!;
      expect(r2.pontuacao).toBeGreaterThan(r1.pontuacao);
      expect(r2.metricas.decisoes!).toBeLessThan(r1.metricas.decisoes!);
    }
  });
});

describe('PresencaGrupos', () => {
  it('lembra quando o grupo foi visto e mostra removidos da visão do facilitador', async () => {
    const r = relogio();
    const s = criarServicoDemo({ fase: 'sala', agora: r.agora });
    const p = new PresencaGrupos(r.agora);
    p.receberTurma(await s.estado('CBMEDE'));
    const desconectado = p.instantaneo().grupos.find((g) => !g.conectado)!;
    expect(desconectado.vistoHaS).toBeNull();

    const visao = await s.removerGrupo(p.instantaneo().grupos[0]!.id);
    p.receberVisao(visao);
    const grupos = p.instantaneo().grupos;
    expect(grupos.filter((g) => g.removido)).toHaveLength(1);
    expect(grupos.find((g) => g.id === desconectado.id)!.vistoHaS).toBe(48);
  });
});
