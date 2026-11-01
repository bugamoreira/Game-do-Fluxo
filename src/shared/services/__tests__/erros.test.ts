import { describe, expect, it } from 'vitest';
import {
  CodigoEmUso,
  DadosInvalidos,
  EntradaFechada,
  ErroServico,
  GrupoJaAtivo,
  NaoAutorizado,
  RelatorioNaoEncontrado,
  RodadaInvalida,
  SemConexao,
  TokenInvalido,
  TransicaoInvalida,
  TurmaCheia,
  TurmaNaoEncontrada,
  VersaoAntiga,
  ehErroDeNegocio,
  mapearErroRpc,
} from '../erros';

/** Erro como o supabase-js entrega o `interno.erro` do banco: message = código, details = frase. */
const doBanco = (codigo: string, sqlstate: string, frase = 'Frase para a tela.') => ({
  code: sqlstate,
  message: codigo,
  details: frase,
  hint: codigo,
});

describe('mapearErroRpc — códigos do banco (docs/schema.md, "Erros")', () => {
  it.each([
    ['TURMA_NAO_ENCONTRADA', 'CB001', TurmaNaoEncontrada],
    ['ENTRADA_FECHADA', 'CB002', EntradaFechada],
    ['GRUPO_JA_ATIVO', 'CB003', GrupoJaAtivo],
    ['TOKEN_INVALIDO', 'CB004', TokenInvalido],
    ['VERSAO_ANTIGA', 'CB005', VersaoAntiga],
    ['NAO_AUTORIZADO', 'CB006', NaoAutorizado],
    ['TRANSICAO_INVALIDA', 'CB007', TransicaoInvalida],
    ['DADOS_INVALIDOS', 'CB008', DadosInvalidos],
    ['RODADA_INVALIDA', 'CB009', RodadaInvalida],
    ['TURMA_CHEIA', 'CB010', TurmaCheia],
    ['CODIGO_EM_USO', 'CB011', CodigoEmUso],
    ['RELATORIO_NAO_ENCONTRADO', 'CB012', RelatorioNaoEncontrado],
  ])('%s (%s)', (codigo, sqlstate, Classe) => {
    const e = mapearErroRpc(doBanco(codigo, sqlstate), 400);
    expect(e).toBeInstanceOf(Classe);
    expect(e.message).toBe('Frase para a tela.');
  });

  it('LIMITE_EXCEDIDO vira o erro genérico, guardando o código', () => {
    const e = mapearErroRpc(doBanco('LIMITE_EXCEDIDO', 'CB013'), 400);
    expect(e).toBeInstanceOf(ErroServico);
    expect((e as ErroServico).codigoServidor).toBe('LIMITE_EXCEDIDO');
  });

  it('código desconhecido vira ErroServico', () => {
    expect(mapearErroRpc(doBanco('ALGO_NOVO', 'CB000'), 400)).toBeInstanceOf(ErroServico);
  });

  it('reconhece só pelo SQLSTATE se a mensagem vier diferente', () => {
    expect(mapearErroRpc({ code: 'CB002', message: 'entrada fechada', details: 'x' }, 400)).toBeInstanceOf(EntradaFechada);
  });

  it('sem frase do servidor, usa o texto padrão', () => {
    expect(mapearErroRpc({ code: 'CB003', message: 'GRUPO_JA_ATIVO' }, 400).message).toBe(new GrupoJaAtivo().message);
  });
});

describe('mapearErroRpc — transporte e permissão', () => {
  it.each([
    ['status 0 (fetch falhou)', { message: 'TypeError: Failed to fetch', code: '' }, 0],
    ['tempo esgotado', { message: 'FetchError: The user aborted a request.', code: '20' }, 0],
    ['proxy fora (502)', { message: 'Bad Gateway' }, 502],
    ['gateway timeout (504)', { message: '' }, 504],
    ['sem status, só o texto', { message: 'TypeError: NetworkError when attempting to fetch resource.' }, undefined],
  ])('falha de transporte: %s', (_, erro, status) => {
    expect(mapearErroRpc(erro, status)).toBeInstanceOf(SemConexao);
  });

  it('anon chamando RPC de facilitador (401 permission denied) vira NaoAutorizado', () => {
    expect(mapearErroRpc({ code: '42501', message: 'permission denied for function pausar' }, 401)).toBeInstanceOf(
      NaoAutorizado,
    );
  });

  it('função inexistente vira ErroServico', () => {
    expect(
      mapearErroRpc({ code: 'PGRST202', message: 'Could not find the function public.estado_turma' }, 404),
    ).toBeInstanceOf(ErroServico);
  });
});

describe('classes de erro', () => {
  it('classifica erros de negócio', () => {
    expect(ehErroDeNegocio(new EntradaFechada())).toBe(true);
    expect(ehErroDeNegocio(new RodadaInvalida())).toBe(true);
    expect(ehErroDeNegocio(new SemConexao())).toBe(false);
    expect(ehErroDeNegocio(new ErroServico())).toBe(false);
  });

  it('têm nome e código estáveis', () => {
    const e = new GrupoJaAtivo();
    expect(e.name).toBe('GrupoJaAtivo');
    expect(e.codigo).toBe('GRUPO_JA_ATIVO');
    expect(e).toBeInstanceOf(Error);
  });
});
