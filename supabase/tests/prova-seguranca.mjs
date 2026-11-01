#!/usr/bin/env node
// Prova de segurança do schema CBMEDE (docs/schema.md).
//
// Ataca o projeto com a CHAVE PÚBLICA, como qualquer visitante faria, e confere
// que toda tentativa indevida falha. Sem dependências: Node 18+ (fetch nativo).
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_ANON_KEY=eyJ... \
//   CODIGO_TESTE=PROVA \            # opcional: turma "aberta" só para a prova
//   node supabase/tests/prova-seguranca.mjs
//
// Com CODIGO_TESTE, o script cria dois grupos "Prova A/B xxxx" nessa turma para
// testar tokens. Use uma turma de teste, nunca a do evento.
//
// Sai com código 1 se alguma tentativa indevida der certo (ou se a chave não
// funcionar, porque aí "tudo falhou" não prova nada).
//
// As tentativas de escrita usam filtros que não casam com nenhuma linha, para
// não estragar dado nem se o banco estiver aberto: o que se mede é se o banco
// RECUSA o comando (sem privilégio), não se ele achou linha.

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const CHAVE = process.env.SUPABASE_ANON_KEY || '';
const CODIGO = process.env.CODIGO_TESTE || '';

if (!URL_BASE || !CHAVE) {
  console.error('Defina SUPABASE_URL e SUPABASE_ANON_KEY (chave pública/anon).');
  process.exit(2);
}

const ZERO = '00000000-0000-0000-0000-000000000000';
const TABELAS = {
  facilitadores: { filtro: `user_id=eq.${ZERO}`, corpo: { user_id: ZERO, nome: 'Invasor' } },
  turmas: { filtro: `id=eq.${ZERO}`, corpo: { codigo: 'HACK', nome: 'Invasor' } },
  grupos: { filtro: `id=eq.${ZERO}`, corpo: { turma_id: ZERO, nome: 'Invasor', cor: '#000000', token_hash: '\\x00' } },
  placar: { filtro: `grupo_id=eq.${ZERO}`, corpo: { grupo_id: ZERO, rodada: 1, minuto: 420, pontuacao: 9999 } },
  estado_jogo: { filtro: `grupo_id=eq.${ZERO}`, corpo: { grupo_id: ZERO, rodada: 1, minuto: 420, versao: 1, estado: {} } },
  serie_metricas: { filtro: `grupo_id=eq.${ZERO}`, corpo: { grupo_id: ZERO, rodada: 1, minuto: 420, metricas: {} } },
  eventos_jogo: { filtro: `grupo_id=eq.${ZERO}`, corpo: { grupo_id: ZERO, rodada: 1, minuto: 420, tipo: 'x' } },
  relatorios: { filtro: `id=eq.${ZERO}`, corpo: { turma_id: ZERO, slug: 'a'.repeat(22), dados: {} } },
};

const cabecalhos = {
  apikey: CHAVE,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};
// chave legada (JWT) vai também no Authorization; a publishable nova vai só no apikey
if (CHAVE.startsWith('eyJ')) cabecalhos.Authorization = `Bearer ${CHAVE}`;

async function chamar(metodo, caminho, corpo) {
  try {
    const r = await fetch(`${URL_BASE}${caminho}`, {
      method: metodo,
      headers: { ...cabecalhos, Prefer: 'return=minimal' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await r.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não JSON */ }
    return { status: r.status, json, texto };
  } catch (e) {
    return { status: 0, json: null, texto: `rede: ${e.message}` };
  }
}
const rpc = (nome, args) => chamar('POST', `/rest/v1/rpc/${nome}`, args);
const ok2xx = (r) => r.status >= 200 && r.status < 300;
const codigoErro = (r) => (r.json && (r.json.message || r.json.code)) || r.texto.slice(0, 60);

const resultados = [];
function registrar(tentativa, passou, detalhe) {
  resultados.push({ tentativa, resultado: passou === null ? 'PULADO' : passou ? 'PASSOU' : 'FALHOU', detalhe });
}
// "deve falhar": PASSOU se o servidor recusou (não 2xx e não erro de rede)
async function deveFalhar(tentativa, promessa, { esperado } = {}) {
  const r = await promessa;
  if (r.status === 0) return registrar(tentativa, false, r.texto);
  const recusou = !ok2xx(r) && (!esperado || codigoErro(r) === esperado);
  registrar(tentativa, recusou, `${r.status} ${codigoErro(r)}`);
}

async function main() {
  // 0. Sanidade: a chave funciona? Sem isso, "tudo recusado" não prova nada.
  const sanidade = await chamar('GET', '/rest/v1/turmas_publicas?select=id&limit=1');
  registrar('Sanidade: ler a view pública turmas_publicas (deve funcionar)', ok2xx(sanidade), `${sanidade.status}`);
  const sanidadeGrupos = await chamar('GET', '/rest/v1/grupos_publicos?select=id,nome,cor,conectado&limit=1');
  registrar('Sanidade: ler a view pública grupos_publicos (deve funcionar)', ok2xx(sanidadeGrupos), `${sanidadeGrupos.status}`);

  // 1. Escrita direta em cada tabela nova
  for (const [tabela, { filtro, corpo }] of Object.entries(TABELAS)) {
    await deveFalhar(`INSERT direto em ${tabela}`, chamar('POST', `/rest/v1/${tabela}`, corpo));
    await deveFalhar(`UPDATE direto em ${tabela}`, chamar('PATCH', `/rest/v1/${tabela}?${filtro}`, { criado_em: null }));
    await deveFalhar(`DELETE direto em ${tabela}`, chamar('DELETE', `/rest/v1/${tabela}?${filtro}`));
  }
  await deveFalhar('UPDATE do status da turma (mudar status direto)',
    chamar('PATCH', `/rest/v1/turmas?${TABELAS.turmas.filtro}`, { status: 'encerrada' }));
  await deveFalhar('UPDATE pela view grupos_publicos',
    chamar('PATCH', `/rest/v1/grupos_publicos?id=eq.${ZERO}`, { nome: 'x' }));

  // 2. Leituras proibidas
  await deveFalhar('Ler estado_jogo', chamar('GET', '/rest/v1/estado_jogo?select=*&limit=1'));
  await deveFalhar('Ler grupos.token_hash', chamar('GET', '/rest/v1/grupos?select=token_hash&limit=1'));
  await deveFalhar('Ler grupos com select=*', chamar('GET', '/rest/v1/grupos?select=*&limit=1'));
  await deveFalhar('Ler token_hash pela view', chamar('GET', '/rest/v1/grupos_publicos?select=token_hash&limit=1'));
  await deveFalhar('Ler serie_metricas', chamar('GET', '/rest/v1/serie_metricas?select=*&limit=1'));
  await deveFalhar('Ler eventos_jogo', chamar('GET', '/rest/v1/eventos_jogo?select=*&limit=1'));
  await deveFalhar('Listar relatorios (ler sem slug)', chamar('GET', '/rest/v1/relatorios?select=slug,dados&limit=1'));
  await deveFalhar('Ler facilitadores', chamar('GET', '/rest/v1/facilitadores?select=*&limit=1'));
  await deveFalhar('Ler turmas.facilitador_id', chamar('GET', '/rest/v1/turmas?select=facilitador_id&limit=1'));
  await deveFalhar('obter_relatorio com slug inventado',
    rpc('obter_relatorio', { p_slug: 'AAAAAAAAAAAAAAAAAAAAAAAA' }), { esperado: 'RELATORIO_NAO_ENCONTRADO' });
  await deveFalhar('obter_relatorio com slug vazio',
    rpc('obter_relatorio', { p_slug: '' }), { esperado: 'RELATORIO_NAO_ENCONTRADO' });

  // 3. RPCs do facilitador sem login
  const rpcsFacilitador = {
    abrir_turma: { p_codigo: 'HACK', p_nome: 'Invasor' },
    mudar_status: { p_turma_id: ZERO, p_status: 'rodada1' },
    pausar: { p_turma_id: ZERO },
    retomar: { p_turma_id: ZERO },
    liberar_entrada: { p_turma_id: ZERO, p_liberada: true },
    liberar_reconexao: { p_grupo_id: ZERO, p_liberada: true },
    liberar_full_capacity: { p_turma_id: ZERO, p_liberado: true },
    alternar_musica: { p_turma_id: ZERO },
    remover_grupo: { p_grupo_id: ZERO },
    gerar_relatorio: { p_turma_id: ZERO },
  };
  for (const [nome, args] of Object.entries(rpcsFacilitador)) {
    await deveFalhar(`RPC ${nome} sem login`, rpc(nome, args));
  }
  // auxiliares internas não podem ser alcançáveis
  await deveFalhar('RPC interna hash_token', rpc('hash_token', { p_token: 'x' }));
  await deveFalhar('RPC interna exigir_facilitador', rpc('exigir_facilitador', {}));

  // 4. Tokens de grupo
  const tokenFalso = 'A'.repeat(43);
  await deveFalhar('enviar_estado com token inventado',
    rpc('enviar_estado', { p_token: tokenFalso, p_rodada: 1, p_minuto: 420, p_versao: 999, p_estado: {}, p_pontuacao: 9999, p_metricas: {} }),
    { esperado: 'TOKEN_INVALIDO' });
  await deveFalhar('enviar_estado escolhendo o grupo (parâmetro grupo_id)',
    rpc('enviar_estado', { p_token: tokenFalso, p_grupo_id: ZERO, p_rodada: 1, p_minuto: 420, p_versao: 999, p_estado: {}, p_pontuacao: 9999, p_metricas: {} }));
  await deveFalhar('obter_estado com token inventado',
    rpc('obter_estado', { p_token: tokenFalso }), { esperado: 'TOKEN_INVALIDO' });

  if (!CODIGO) {
    registrar('Token de outro grupo (precisa de CODIGO_TESTE)', null, 'defina CODIGO_TESTE');
  } else {
    const sufixo = Math.random().toString(36).slice(2, 6);
    const a = await rpc('entrar_grupo', { p_codigo: CODIGO, p_nome: `Prova A ${sufixo}` });
    const b = await rpc('entrar_grupo', { p_codigo: CODIGO, p_nome: `Prova B ${sufixo}` });
    if (!ok2xx(a) || !ok2xx(b)) {
      registrar(`Entrar 2 grupos de teste em ${CODIGO} (deve funcionar)`, false, `${a.status} ${codigoErro(a)} / ${b.status} ${codigoErro(b)}`);
    } else {
      const tokA = a.json.token;
      const tokB = b.json.token;
      registrar('Entrar 2 grupos de teste (deve funcionar)', Boolean(tokA && tokB && tokA !== tokB), 'tokens distintos');
      await deveFalhar('Tomar o grupo A sem token (mesmo nome)',
        rpc('entrar_grupo', { p_codigo: CODIGO, p_nome: `Prova A ${sufixo}` }), { esperado: 'GRUPO_JA_ATIVO' });
      await deveFalhar('Tomar o grupo A com o token do grupo B',
        rpc('entrar_grupo', { p_codigo: CODIGO, p_nome: `Prova A ${sufixo}`, p_token: tokB }), { esperado: 'GRUPO_JA_ATIVO' });
      // com o token de B, só se alcança B: o grupo A segue sem estado
      await rpc('enviar_estado', { p_token: tokB, p_rodada: 1, p_minuto: 420, p_versao: 1, p_estado: { invasor: true }, p_pontuacao: 1, p_metricas: {} });
      const estA = await rpc('obter_estado', { p_token: tokA, p_rodada: 1 });
      registrar('Token de B não altera o estado de A', ok2xx(estA) && (estA.json === null || !estA.json?.estado?.invasor),
        `${estA.status}`);
      const st = await rpc('estado_turma', { p_codigo: CODIGO });
      registrar('estado_turma não expõe token nem hash', ok2xx(st) && !/token_hash|"token"/.test(st.texto), `${st.status}`);
      registrar('estado_turma devolve hora_servidor (deve funcionar)', ok2xx(st) && Boolean(st.json?.hora_servidor), '');
    }
  }

  // 5. Aviso (não reprova): cadastro aberto no Auth
  const conf = await chamar('GET', '/auth/v1/settings');
  if (ok2xx(conf) && conf.json) {
    const aberto = conf.json.disable_signup === false;
    resultados.push({
      tentativa: 'Aviso: cadastro de conta pelo Auth',
      resultado: aberto ? 'AVISO' : 'PASSOU',
      detalhe: aberto ? 'disable_signup=false: desligue em Authentication > Sign In / Providers' : 'cadastro desligado',
    });
  }

  // Tabela
  const larg = Math.max(...resultados.map((r) => r.tentativa.length));
  console.log(`\n${'Tentativa'.padEnd(larg)}  Resultado  Detalhe`);
  console.log(`${'-'.repeat(larg)}  ---------  -------`);
  for (const r of resultados) console.log(`${r.tentativa.padEnd(larg)}  ${r.resultado.padEnd(9)}  ${r.detalhe}`);
  const falhas = resultados.filter((r) => r.resultado === 'FALHOU');
  console.log(`\n${resultados.length} verificações, ${falhas.length} falha(s).`);
  process.exit(falhas.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
