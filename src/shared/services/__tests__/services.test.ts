import { beforeEach, describe, expect, it, vi } from 'vitest';

// O cliente real exige window e variáveis de ambiente: aqui ele é substituído.
const rpc = vi.fn();
const signInWithPassword = vi.fn();
vi.mock('../../lib/supabase', () => ({
  sb: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args), signOut: vi.fn() },
  },
}));

import {
  CodigoEmUso,
  DadosInvalidos,
  EntradaFechada,
  GrupoJaAtivo,
  NaoAutorizado,
  RelatorioNaoEncontrado,
  RespostaInvalida,
  SemConexao,
  TokenInvalido,
  TurmaNaoEncontrada,
  VersaoAntiga,
  facilitadorService,
  grupoService,
  relatorioService,
  syncService,
  turmaService,
} from '..';

type Resposta = { data?: unknown; error?: unknown; status?: number };

/** Imita o builder do postgrest-js: `sb.rpc(...).abortSignal(...)` é aguardável. */
function responder(r: Resposta | Promise<never>) {
  rpc.mockImplementationOnce(() => ({
    abortSignal: () => (r instanceof Promise ? r : Promise.resolve({ data: null, error: null, status: 200, ...r })),
  }));
}

/** Erro como o banco levanta (`interno.erro`): message = código, details = frase. */
const erroBanco = (codigo: string, sqlstate: string, frase: string) => ({
  error: { code: sqlstate, message: codigo, details: frase, hint: codigo },
  status: 400,
});

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
// Resposta de interno.json_turma (snake_case, jsonb).
const turma = {
  id: '0b6c1f9e-0000-4000-8000-000000000001',
  codigo: 'CBMEDE',
  nome: 'CBMEDE 2026',
  evento: null,
  data: '2026-11-01',
  status: 'aberta',
  rodada: null,
  rodada_inicio: null,
  rodada_fim: null,
  pausada: false,
  pausada_em: null,
  pausa_acumulada_ms: 0,
  minuto: null,
  hora_servidor: '2026-11-01T12:00:00.123456+00:00',
  entrada_liberada: false,
  full_capacity_liberado: false,
  musica_mudo: false,
  grupos: [{ id: 'g1', nome: 'Azul', cor: '#1E88E5', conectado: true }],
};
const estado = { versao: 7, rodada: 1 as const, minuto: 480, pacientes: [] };

beforeEach(() => {
  rpc.mockReset();
  signInWithPassword.mockReset();
});

describe('turmaService', () => {
  it('estado: chama estado_turma(p_codigo, p_token) e valida a resposta', async () => {
    responder({ data: { ...turma, token_valido: true } });
    const r = await turmaService.estado('  cbmede ', TOKEN);
    expect(rpc).toHaveBeenCalledWith('estado_turma', { p_codigo: 'CBMEDE', p_token: TOKEN });
    expect(r.status).toBe('aberta');
    expect(r.tokenValido).toBe(true);
    expect(r.horaServidor).toBe('2026-11-01T12:00:00.123456+00:00');
  });

  it('estado sem token envia p_token null', async () => {
    responder({ data: turma });
    await turmaService.estado('CBMEDE');
    expect(rpc).toHaveBeenCalledWith('estado_turma', { p_codigo: 'CBMEDE', p_token: null });
  });

  it('código inexistente (erro do banco) vira TurmaNaoEncontrada com a frase do servidor', async () => {
    responder(erroBanco('TURMA_NAO_ENCONTRADA', 'CB001', 'Sala não encontrada. Confira o código.'));
    const erro = await turmaService.estado('XYZ').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(TurmaNaoEncontrada);
    expect((erro as Error).message).toBe('Sala não encontrada. Confira o código.');
  });

  it('resposta malformada vira RespostaInvalida', async () => {
    responder({ data: { ...turma, status: 'waiting' } });
    await expect(turmaService.estado('CBMEDE')).rejects.toBeInstanceOf(RespostaInvalida);
  });

  it('falha de rede (status 0) vira SemConexao', async () => {
    responder({ error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
    await expect(turmaService.estado('CBMEDE')).rejects.toBeInstanceOf(SemConexao);
  });

  it('exceção lançada pelo cliente vira SemConexao', async () => {
    responder(Promise.reject(new TypeError('Failed to fetch')));
    await expect(turmaService.ranking('CBMEDE')).rejects.toBeInstanceOf(SemConexao);
  });

  it('ranking: lista com posição', async () => {
    responder({
      data: [{ posicao: 1, grupo_id: 'g1', nome: 'Azul', cor: '#1E88E5', rodada: 1, pontuacao: 812.5, minuto: 600, metricas: { dth: 1 } }],
    });
    const r = await turmaService.ranking('CBMEDE');
    expect(rpc).toHaveBeenCalledWith('ranking', { p_codigo: 'CBMEDE' });
    expect(r[0]).toMatchObject({ posicao: 1, grupoId: 'g1', pontuacao: 812.5 });
  });

  it('código vazio nem chega ao servidor', async () => {
    await expect(turmaService.estado('   ')).rejects.toBeInstanceOf(TurmaNaoEncontrada);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('grupoService.entrar', () => {
  const resposta = (extra: Record<string, unknown> = {}) => ({
    turma_id: turma.id,
    status: 'rodada1',
    rodada: 1,
    grupo: { id: 'g1', nome: 'Azul', cor: '#1E88E5' },
    token: TOKEN,
    reconectado: false,
    estado_salvo: null,
    hora_servidor: '2026-11-01T12:00:00Z',
    ...extra,
  });

  it('grupo novo: envia p_codigo, p_nome normalizado e p_token null; devolve o token gerado', async () => {
    responder({ data: resposta() });
    const r = await grupoService.entrar('cbmede', '  Grupo   Azul ');
    expect(rpc).toHaveBeenCalledWith('entrar_grupo', { p_codigo: 'CBMEDE', p_nome: 'Grupo Azul', p_token: null });
    expect(r).toMatchObject({ token: TOKEN, reconectado: false, estadoSalvo: null, turmaId: turma.id });
  });

  it('reconexão com o próprio token: servidor devolve token null, o service mantém o token local e extrai o estado salvo', async () => {
    responder({
      data: resposta({
        token: null,
        reconectado: true,
        estado_salvo: { rodada: 1, minuto: 480, versao: 7, estado, atualizado_em: '2026-11-01T12:01:00Z' },
      }),
    });
    const r = await grupoService.entrar('CBMEDE', 'Azul', TOKEN);
    expect(rpc).toHaveBeenCalledWith('entrar_grupo', { p_codigo: 'CBMEDE', p_nome: 'Azul', p_token: TOKEN });
    expect(r.token).toBe(TOKEN);
    expect(r.reconectado).toBe(true);
    expect(r.estadoSalvo).toEqual(estado);
  });

  it('token null sem token local é resposta inválida', async () => {
    responder({ data: resposta({ token: null }) });
    await expect(grupoService.entrar('CBMEDE', 'Azul')).rejects.toBeInstanceOf(RespostaInvalida);
  });

  it('token local corrompido vai como ausente', async () => {
    responder({ data: resposta() });
    await grupoService.entrar('CBMEDE', 'Azul', 'lixo');
    expect(rpc).toHaveBeenCalledWith('entrar_grupo', expect.objectContaining({ p_token: null }));
  });

  it.each([
    ['ENTRADA_FECHADA', 'CB002', 'A rodada já começou. Fale com o facilitador.', EntradaFechada],
    [
      'GRUPO_JA_ATIVO',
      'CB003',
      'Esse grupo já está no jogo. Se é o seu, peça ao facilitador para liberar a reconexão.',
      GrupoJaAtivo,
    ],
  ])('recusa %s vira o erro tipado com a frase do servidor', async (codigo, sqlstate, frase, Classe) => {
    responder(erroBanco(codigo, sqlstate, frase));
    const erro = await grupoService.entrar('CBMEDE', 'Azul').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Classe);
    expect((erro as Error).message).toBe(frase);
  });

  it('nome curto é recusado antes de ir ao servidor', async () => {
    await expect(grupoService.entrar('CBMEDE', 'A')).rejects.toBeInstanceOf(DadosInvalidos);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('syncService', () => {
  it('enviarEstado: parâmetros p_* de docs/schema.md', async () => {
    responder({ data: { versao: 7, hora_servidor: '2026-11-01T12:00:00Z' } });
    await syncService.enviarEstado(TOKEN, estado, { pontuacao: 900, metricas: { dth: 0 } });
    expect(rpc).toHaveBeenCalledWith('enviar_estado', {
      p_token: TOKEN,
      p_rodada: 1,
      p_minuto: 480,
      p_versao: 7,
      p_estado: estado,
      p_pontuacao: 900,
      p_metricas: { dth: 0 },
    });
  });

  it('aceita as interfaces do motor (EstadoSimulacao, Metricas), que não têm assinatura de índice', async () => {
    interface MetricasDoMotor {
      dth: number;
      boarding: number;
    }
    interface EstadoDoMotor {
      versao: number;
      rodada: 1 | 2;
      minuto: number;
      rng: number;
      pacientes: { id: number }[];
    }
    const e: EstadoDoMotor = { versao: 1, rodada: 1, minuto: 421, rng: 42, pacientes: [] };
    const m: MetricasDoMotor = { dth: 0, boarding: 2 };
    responder({ data: null });
    await syncService.enviarEstado(TOKEN, e, { pontuacao: 10, metricas: m });
    responder({ data: null });
    await syncService.registrarSerie(TOKEN, 1, 450, m);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('enviarEstado: versão antiga e token inválido viram erros tipados', async () => {
    responder(erroBanco('VERSAO_ANTIGA', 'CB005', 'O servidor já tem uma versão mais nova deste jogo.'));
    await expect(syncService.enviarEstado(TOKEN, estado, { pontuacao: 1, metricas: {} })).rejects.toBeInstanceOf(
      VersaoAntiga,
    );
    responder(erroBanco('TOKEN_INVALIDO', 'CB004', 'Sessão do grupo não reconhecida.'));
    await expect(syncService.enviarEstado(TOKEN, estado, { pontuacao: 1, metricas: {} })).rejects.toBeInstanceOf(
      TokenInvalido,
    );
  });

  it('token malformado nem chega ao servidor', async () => {
    await expect(syncService.obterEstado('curto', 1)).rejects.toBeInstanceOf(TokenInvalido);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('obterEstado: extrai o estado do registro; null quando não há; rodada opcional', async () => {
    responder({ data: { rodada: 1, minuto: 480, versao: 7, estado, atualizado_em: '2026-11-01T12:00:00Z' } });
    expect(await syncService.obterEstado(TOKEN, 1)).toEqual(estado);
    expect(rpc).toHaveBeenLastCalledWith('obter_estado', { p_token: TOKEN, p_rodada: 1 });
    responder({ data: null });
    expect(await syncService.obterEstado(TOKEN)).toBeNull();
    expect(rpc).toHaveBeenLastCalledWith('obter_estado', { p_token: TOKEN, p_rodada: null });
  });

  it('registrarEventos: envia p_rodada e divide em lotes de 50', async () => {
    const eventos = Array.from({ length: 120 }, (_, i) => ({ minuto: 420 + i, tipo: 'obito', chave: `ob-${i}` }));
    responder({ data: { inseridos: 50 } });
    responder({ data: { inseridos: 50 } });
    responder({ data: { inseridos: 20 } });
    await syncService.registrarEventos(TOKEN, 2, eventos);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[0]).toEqual(['registrar_eventos', { p_token: TOKEN, p_rodada: 2, p_eventos: eventos.slice(0, 50) }]);
    expect((rpc.mock.calls[2]?.[1] as { p_eventos: unknown[] }).p_eventos).toHaveLength(20);
  });

  it('registrarEventos: lista vazia não chama o servidor; tipo inválido é recusado antes', async () => {
    await syncService.registrarEventos(TOKEN, 1, []);
    await expect(syncService.registrarEventos(TOKEN, 1, [{ minuto: 500, tipo: 'tem espaço' }])).rejects.toBeInstanceOf(
      DadosInvalidos,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('registrarSerie: parâmetros p_*', async () => {
    responder({ data: { registrado: true } });
    await syncService.registrarSerie(TOKEN, 1, 450, { dth: 0, boarding: 3 });
    expect(rpc).toHaveBeenCalledWith('registrar_serie', {
      p_token: TOKEN,
      p_rodada: 1,
      p_minuto: 450,
      p_metricas: { dth: 0, boarding: 3 },
    });
  });
});

describe('facilitadorService', () => {
  it('login recusado vira NaoAutorizado', async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 },
    });
    await expect(facilitadorService.login('f@x.com', 'senha-errada')).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it('login sem rede vira SemConexao', async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 },
    });
    await expect(facilitadorService.login('f@x.com', 'senha-boa')).rejects.toBeInstanceOf(SemConexao);
  });

  it('login ok devolve a sessão', async () => {
    signInWithPassword.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'f@x.com' } }, error: null });
    expect(await facilitadorService.login('f@x.com', 'senha-boa')).toEqual({ userId: 'u1', email: 'f@x.com' });
  });

  it('pausar: p_turma_id e devolve o estado da turma (visão do facilitador)', async () => {
    responder({
      data: {
        ...turma,
        status: 'rodada1',
        rodada: 1,
        rodada_inicio: '2026-11-01T12:00:00Z',
        pausada: true,
        pausada_em: '2026-11-01T12:01:00Z',
        grupos: [{ id: 'g1', nome: 'Azul', cor: '#1E88E5', conectado: false, visto_em: null, reconexao_liberada: true, removido: false }],
      },
    });
    const r = await facilitadorService.pausar(turma.id);
    expect(rpc).toHaveBeenCalledWith('pausar', { p_turma_id: turma.id });
    expect(r.pausada).toBe(true);
    expect(r.grupos[0]?.reconexaoLiberada).toBe(true);
  });

  it('sem login: NAO_AUTORIZADO do banco vira NaoAutorizado', async () => {
    responder(erroBanco('NAO_AUTORIZADO', 'CB006', 'Acesso restrito ao facilitador.'));
    await expect(facilitadorService.retomar(turma.id)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it('abrirTurma: normaliza o código; CODIGO_EM_USO vira CodigoEmUso; substituir vai em p_substituir', async () => {
    responder(erroBanco('CODIGO_EM_USO', 'CB011', 'Já existe uma turma CBMEDE em andamento.'));
    await expect(facilitadorService.abrirTurma({ codigo: ' cbmede ', nome: 'CBMEDE 2026' })).rejects.toBeInstanceOf(
      CodigoEmUso,
    );
    expect(rpc).toHaveBeenLastCalledWith('abrir_turma', {
      p_codigo: 'CBMEDE',
      p_nome: 'CBMEDE 2026',
      p_evento: null,
      p_data: null,
      p_substituir: false,
    });
    responder({ data: turma });
    await facilitadorService.abrirTurma({ codigo: 'CBMEDE', nome: 'CBMEDE 2026', substituir: true });
    expect(rpc).toHaveBeenLastCalledWith('abrir_turma', expect.objectContaining({ p_substituir: true }));
  });

  it('abrirTurma: código com hífen é recusado antes (o banco aceita só letras e números)', async () => {
    await expect(facilitadorService.abrirTurma({ codigo: 'CB-26', nome: 'Turma' })).rejects.toBeInstanceOf(DadosInvalidos);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('alternarMusica sem argumento manda p_mudo null (inverte)', async () => {
    responder({ data: turma });
    await facilitadorService.alternarMusica(turma.id);
    expect(rpc).toHaveBeenCalledWith('alternar_musica', { p_turma_id: turma.id, p_mudo: null });
  });

  it('mudarStatus recusa status fora da máquina de estados sem chamar o servidor', async () => {
    // @ts-expect-error status inválido de propósito
    await expect(facilitadorService.mudarStatus('t1', 'waiting')).rejects.toBeInstanceOf(DadosInvalidos);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('relatorioService', () => {
  const SLUG = 'Ab3dEf6hIj9kLm2nOp5qRs8t';

  it('gerar: p_turma_id e slug da resposta { slug, turma }', async () => {
    responder({ data: { slug: SLUG, turma } });
    expect(await relatorioService.gerar(turma.id)).toEqual({ slug: SLUG });
    expect(rpc).toHaveBeenCalledWith('gerar_relatorio', { p_turma_id: turma.id, p_versao_regras: null });
  });

  it('obter: converte { slug, criado_em, versao_regras, dados }', async () => {
    responder({ data: { slug: SLUG, criado_em: '2026-11-01T15:00:00Z', versao_regras: null, dados: { ranking: {} } } });
    const r = await relatorioService.obter(SLUG);
    expect(r).toEqual({ slug: SLUG, criadoEm: '2026-11-01T15:00:00Z', versaoRegras: null, dados: { ranking: {} } });
  });

  it('obter: slug malformado nem chega ao servidor; inexistente vira RelatorioNaoEncontrado', async () => {
    await expect(relatorioService.obter('curto')).rejects.toBeInstanceOf(RelatorioNaoEncontrado);
    expect(rpc).not.toHaveBeenCalled();
    responder(erroBanco('RELATORIO_NAO_ENCONTRADO', 'CB012', 'Relatório não encontrado. Confira o link.'));
    await expect(relatorioService.obter(SLUG)).rejects.toBeInstanceOf(RelatorioNaoEncontrado);
  });
});
