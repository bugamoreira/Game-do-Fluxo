import { describe, expect, it } from 'vitest';
import {
  EstadoSimulacaoTransporteSchema,
  EventoJogoSchema,
  RespostaEntrarGrupoSchema,
  RespostaEstadoTurmaSchema,
  RespostaObterEstadoSchema,
  RespostaRankingSchema,
  RelatorioGeradoSchema,
  RelatorioSchema,
  TokenSchema,
  camelizar,
  instanteEmMs,
} from '..';

const turmaSnake = {
  id: 't1',
  codigo: 'CBMEDE',
  nome: 'CBMEDE 2026',
  status: 'rodada1',
  rodada: 1,
  rodada_inicio: '2026-11-01T12:00:00.000+00:00',
  pausada: false,
  pausada_em: null,
  pausa_acumulada_ms: 0,
  hora_servidor: '2026-11-01T12:00:30.123456+00:00',
  entrada_liberada: false,
  full_capacity_liberado: false,
  musica_mudo: false,
  grupos: [{ id: 'g1', nome: 'Azul', cor: '#1d4ed8', conectado: true }],
};

describe('EstadoTurma', () => {
  it('aceita resposta em snake_case e converte para o formato de tela', () => {
    const r = RespostaEstadoTurmaSchema.parse(turmaSnake);
    expect(r).toMatchObject({
      codigo: 'CBMEDE',
      rodadaInicio: '2026-11-01T12:00:00.000+00:00',
      pausaAcumuladaMs: 0,
      horaServidor: '2026-11-01T12:00:30.123456+00:00',
      grupos: [{ id: 'g1', conectado: true }],
    });
  });

  it('aceita resposta já em camelCase', () => {
    const camel = camelizar(turmaSnake) as Record<string, unknown>;
    expect(RespostaEstadoTurmaSchema.parse(camel)?.status).toBe('rodada1');
  });

  it('aceita lista de uma linha (returns table) e nulo (código inexistente)', () => {
    expect(RespostaEstadoTurmaSchema.parse([turmaSnake])?.id).toBe('t1');
    expect(RespostaEstadoTurmaSchema.parse([])).toBeNull();
    expect(RespostaEstadoTurmaSchema.parse(null)).toBeNull();
  });

  it('turma aberta: rodada e início nulos', () => {
    const r = RespostaEstadoTurmaSchema.parse({ ...turmaSnake, status: 'aberta', rodada: null, rodada_inicio: null });
    expect(r?.rodada).toBeNull();
  });

  it.each([
    ['status desconhecido', { status: 'waiting' }],
    ['rodada 3', { rodada: 3 }],
    ['hora do servidor inválida', { hora_servidor: 'ontem' }],
    ['pausa negativa', { pausa_acumulada_ms: -1 }],
    ['cor que não é hex', { grupos: [{ id: 'g1', nome: 'A', cor: 'azul', conectado: true }] }],
    ['grupo sem conectado', { grupos: [{ id: 'g1', nome: 'A', cor: '#fff' }] }],
    ['flag como texto', { pausada: 'false' }],
  ])('recusa resposta malformada: %s', (_, mudanca) => {
    expect(RespostaEstadoTurmaSchema.safeParse({ ...turmaSnake, ...mudanca }).success).toBe(false);
  });

  it('recusa HTML devolvido por proxy mal configurado', () => {
    expect(RespostaEstadoTurmaSchema.safeParse('<!doctype html><html>').success).toBe(false);
  });
});

describe('instanteEmMs', () => {
  it('lê ISO com microssegundos e o formato texto do Postgres', () => {
    const iso = instanteEmMs('2026-11-01T12:00:00.500+00:00');
    expect(instanteEmMs('2026-11-01 12:00:00.500+00')).toBe(iso);
    expect(instanteEmMs('2026-11-01T12:00:00.500123+00:00')).toBe(iso);
  });
  it('devolve NaN para texto que não é data', () => {
    expect(instanteEmMs('xx')).toBeNaN();
  });
});

describe('Ranking', () => {
  const item = { grupo_id: 'g1', nome: 'Azul', cor: '#1d4ed8', rodada: 1, pontuacao: 812, metricas: { dth: 1, boarding: 4 }, minuto: 600 };

  it('aceita lista e converte grupo_id', () => {
    expect(RespostaRankingSchema.parse([item])[0]?.grupoId).toBe('g1');
  });
  it('nulo vira lista vazia', () => {
    expect(RespostaRankingSchema.parse(null)).toEqual([]);
  });
  it('recusa métrica não numérica e pontuação ausente', () => {
    expect(RespostaRankingSchema.safeParse([{ ...item, metricas: { dth: 'um' } }]).success).toBe(false);
    const semPontuacao: Partial<typeof item> = { ...item };
    delete semPontuacao.pontuacao;
    expect(RespostaRankingSchema.safeParse([semPontuacao]).success).toBe(false);
  });
});

describe('Estado da simulação (opaco)', () => {
  const estado = { versao: 3, rodada: 2, minuto: 421, pacientes: [{ id: 1 }], flags: { round_10h: true } };

  it('valida só os campos da sincronização e preserva o resto intacto', () => {
    const r = EstadoSimulacaoTransporteSchema.parse(estado);
    expect(r).toEqual(estado);
  });
  it.each([
    ['minuto fora do plantão', { minuto: 1141 }],
    ['versão negativa', { versao: -1 }],
    ['rodada inválida', { rodada: 0 }],
  ])('recusa %s', (_, mudanca) => {
    expect(EstadoSimulacaoTransporteSchema.safeParse({ ...estado, ...mudanca }).success).toBe(false);
  });

  it('obter_estado: aceita nulo, estado direto ou registro com campo estado', () => {
    expect(RespostaObterEstadoSchema.parse(null)).toBeNull();
    expect(RespostaObterEstadoSchema.parse(estado)?.versao).toBe(3);
    expect(RespostaObterEstadoSchema.parse({ estado, versao: 3 })?.minuto).toBe(421);
    expect(RespostaObterEstadoSchema.parse([{ estado }])?.rodada).toBe(2);
  });
});

describe('Entrada do grupo (entrar_grupo)', () => {
  const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
  const base = {
    turma_id: 't1',
    status: 'debrief',
    rodada: 1,
    grupo: { id: 'g1', nome: 'Azul', cor: '#1E88E5' },
    token: TOKEN,
    reconectado: false,
    estado_salvo: null,
    hora_servidor: '2026-11-01T12:00:00.5+00:00',
  };

  it('aceita grupo novo (no debrief, para jogar a R2)', () => {
    const r = RespostaEntrarGrupoSchema.parse(base);
    expect(r).toMatchObject({ turmaId: 't1', status: 'debrief', token: TOKEN, estadoSalvo: null });
  });

  it('aceita reconexão: token null e estado_salvo como registro de estado_jogo', () => {
    const estado = { versao: 2, rodada: 1, minuto: 430, log: [] };
    const r = RespostaEntrarGrupoSchema.parse({
      ...base,
      token: null,
      reconectado: true,
      estado_salvo: { rodada: 1, minuto: 430, versao: 2, estado, atualizado_em: '2026-11-01T12:00:00Z' },
    });
    expect(r.token).toBeNull();
    expect(r.estadoSalvo).toEqual(estado);
  });

  it('recusa token fora do formato e estado salvo corrompido', () => {
    expect(RespostaEntrarGrupoSchema.safeParse({ ...base, token: 'curto' }).success).toBe(false);
    expect(
      RespostaEntrarGrupoSchema.safeParse({ ...base, estado_salvo: { estado: { versao: 'x', rodada: 1, minuto: 430 } } }).success,
    ).toBe(false);
  });

  it('token: 43 caracteres base64url', () => {
    expect(TokenSchema.safeParse(TOKEN).success).toBe(true);
    expect(TokenSchema.safeParse(TOKEN + 'a').success).toBe(false);
    expect(TokenSchema.safeParse(TOKEN.slice(0, 42) + '+').success).toBe(false);
  });
});

describe('Evento do jogo', () => {
  it('aceita { minuto, tipo, mensagem?, chave? } e recusa fora dos limites do banco', () => {
    expect(EventoJogoSchema.safeParse({ minuto: 600, tipo: 'obito', mensagem: 'Óbito no corredor', chave: 'r1:600:obito' }).success).toBe(true);
    expect(EventoJogoSchema.safeParse({ minuto: 600, tipo: 'óbito' }).success).toBe(false);
    expect(EventoJogoSchema.safeParse({ minuto: 600, tipo: 'obito', mensagem: 'x'.repeat(301) }).success).toBe(false);
    expect(EventoJogoSchema.safeParse({ minuto: 1200, tipo: 'obito' }).success).toBe(false);
  });
});

describe('Relatório', () => {
  it('gerar_relatorio: { slug, turma } → slug; recusa slug curto', () => {
    expect(RelatorioGeradoSchema.parse({ slug: 'Ab3dEf6hIj9kLm2nOp5qRs8t', turma: {} }).slug).toBe('Ab3dEf6hIj9kLm2nOp5qRs8t');
    expect(RelatorioGeradoSchema.safeParse({ slug: 'curto' }).success).toBe(false);
  });
  it('obter_relatorio: exige dados como objeto', () => {
    const base = { slug: 'Ab3dEf6hIj9kLm2nOp5qRs8t', criado_em: '2026-11-01T15:00:00Z', versao_regras: 'v1' };
    expect(RelatorioSchema.parse({ ...base, dados: {} })?.versaoRegras).toBe('v1');
    expect(RelatorioSchema.safeParse({ ...base, dados: [] }).success).toBe(false);
  });
});
