import { beforeEach, describe, expect, it, vi } from 'vitest';

const estadoContexto = { state: 'suspended' as 'suspended' | 'running' };
const tone = {
  start: vi.fn(async () => {
    /* o navegador decide: o teste muda estadoContexto */
  }),
  getContext: () => estadoContexto,
};
const api = { iniciar: vi.fn(async () => {}), atualizar: vi.fn(), efeito: vi.fn(), definirMudo: vi.fn() };

vi.mock('tone', () => tone);
vi.mock('../../../shared/lib/music', () => ({ musica: api }));

async function adaptadorNovo() {
  vi.resetModules();
  return (await import('../musicaAdapter')).musica;
}

describe('adaptador de música', () => {
  beforeEach(() => {
    estadoContexto.state = 'suspended';
    vi.clearAllMocks();
  });

  it('primeiro gesto antes do download só prepara; o seguinte liga', async () => {
    const musica = await adaptadorNovo();
    estadoContexto.state = 'running';
    expect(await musica.iniciar()).toBe(false);
    expect(await musica.iniciar()).toBe(true);
    expect(tone.start).toHaveBeenCalledTimes(1);
  });

  it('chama Tone.start de forma síncrona dentro do gesto quando já pré-carregado', async () => {
    const musica = await adaptadorNovo();
    await musica.preparar();
    estadoContexto.state = 'running';
    const promessa = musica.iniciar();
    expect(tone.start).toHaveBeenCalledTimes(1); // antes de qualquer await
    expect(await promessa).toBe(true);
  });

  it('se o navegador deixar o contexto suspenso, pede nova tentativa e tenta de novo', async () => {
    const musica = await adaptadorNovo();
    await musica.preparar();
    expect(await musica.iniciar()).toBe(false);
    estadoContexto.state = 'running';
    expect(await musica.iniciar()).toBe(true);
    expect(tone.start).toHaveBeenCalledTimes(2);
  });

  it('guarda estado e mudo até ligar e não toca efeitos antes disso', async () => {
    const musica = await adaptadorNovo();
    musica.definirMudo(true);
    musica.atualizar({ rodada: 2, tensao: 0.5, rodando: true });
    musica.efeito('morte' as never);
    await musica.preparar();
    expect(api.definirMudo).toHaveBeenCalledWith(true);
    expect(api.atualizar).toHaveBeenCalledWith({ rodada: 2, tensao: 0.5, rodando: true });
    expect(api.efeito).not.toHaveBeenCalled();
  });
});
