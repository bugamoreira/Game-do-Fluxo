# Schema — dados, acesso e máquina de estados

> Proposta para o CBMEDE 2026. Nada aqui foi aplicado no banco. As migrações estão em `supabase/migrations/` (etapa B4, validadas num Postgres local) e só serão aplicadas com autorização do Gustavo. Como aplicar, cadastrar o facilitador e reverter: `supabase/README.md`. As tabelas do FLAME (`rooms`, `teams`, `game_state`, `game_logs`) ficam intactas como arquivo.

## Princípios

1. **Turma é a unidade.** Um evento tem uma turma; a comparação é sempre dentro da turma. Cada turma fica guardada com seus resultados e seu relatório.
2. **Ninguém escreve direto nas tabelas.** O navegador escreve por funções no banco (RPC), que validam quem chama e se a ação faz sentido no momento (playbook, `19-seguranca`: "campo que o servidor decide, o servidor grava"). **O motor do jogo roda no navegador do grupo**: o servidor não refaz a simulação, mas faz checagem de plausibilidade do que recebe (minuto dentro do relógio da sala, pontuação na faixa possível, tamanho e frequência dos envios).
3. **Grupo se identifica por um token**, gerado ao entrar e guardado no computador do grupo. Sem conta, sem dado pessoal.
4. **Facilitador tem login real** (Supabase Auth, e-mail e senha). Nenhuma credencial no código.
5. **O relógio é do servidor.** O minuto do plantão é calculado a partir do início da rodada gravado no banco, e todos os computadores corrigem o próprio relógio pela hora do servidor.

## Tabelas

| Tabela | Conteúdo | Quem lê | Quem escreve |
|---|---|---|---|
| `facilitadores` | `user_id` (auth), nome | o próprio facilitador | só pelo painel do Supabase |
| `turmas` | código da sala (ex.: `CBMEDE`), nome, evento, data, facilitador, `status`, `rodada`, `rodada_inicio`, `pausada_em`, `pausa_acumulada_ms`, `entrada_liberada`, `full_capacity_liberado`, `musica_mudo` | público (só os campos de estado) | RPC do facilitador |
| `grupos` | turma, nome, cor, `token_hash`, `reconexao_liberada`, `visto_em` | público (nome, cor, se está conectado) | RPC `entrar_grupo` e RPCs do facilitador |
| `placar` | grupo, rodada, minuto, pontuação, métricas resumidas | público (alimenta ranking e telão) | RPC `enviar_estado` |
| `estado_jogo` | grupo, rodada, minuto, **estado completo da simulação** (JSON), versão | só o próprio grupo (pelo token) e o facilitador | RPC `enviar_estado` |
| `serie_metricas` | grupo, rodada, minuto, métricas (a cada 30 min simulados) | facilitador e relatório | RPC `registrar_serie` (só inclui, nunca altera) |
| `eventos_jogo` | grupo, rodada, minuto, tipo, mensagem (óbitos, cancelamentos, surto…) | facilitador e relatório | RPC `registrar_eventos` (só inclui) |
| `relatorios` | turma, `slug` público impossível de adivinhar, dados congelados no fim da sessão, versão das regras | qualquer pessoa com o link (RPC `obter_relatorio`) | RPC `gerar_relatorio` do facilitador |

Todas as tabelas com RLS ligado. Política de escrita direta para `anon`: nenhuma. Leituras públicas por *views* que expõem só as colunas permitidas (nunca `token_hash` ou `estado_jogo`).

## Máquina de estados da turma

```
aberta ──Iniciar Travado──► rodada1 ──Encerrar──► debrief ──Iniciar Lean──► rodada2 ──Encerrar──► encerrada ──Gerar relatório──► arquivada
            ▲                 │  ▲                                          │  ▲
            │              Pausar Retomar                                Pausar Retomar
            └──── Nova turma (cria outra turma; a anterior vai para arquivada)
```

- Transições validadas no servidor; qualquer outra é recusada.
- `rodada_inicio` é gravado ao iniciar cada rodada; pausar e retomar acumulam `pausa_acumulada_ms`.
- **Minuto do plantão** = 420 + ⌊(agora − rodada_inicio − pausa_acumulada) / 1000 ms⌋, limitado a 1140 (7h → 19h): 1 segundo real = 1 minuto simulado, rodada de 12 minutos. Durante a pausa, "agora" é o início da pausa; depois de encerrar, é `rodada_fim`. `estado_turma` já devolve o `minuto` calculado e a `hora_servidor`.
- **Encerrar** grava `rodada_fim` e fecha a pausa em curso. Por 30 s depois disso o servidor ainda aceita envios da rodada que acabou, para o último placar (minuto 1140) não se perder na corrida com o clique do facilitador.
- **Nova turma com o mesmo código:** `abrir_turma` arquiva sozinho a anterior se ela estiver `encerrada` ou `aberta` sem grupos; em qualquer outro caso recusa com `CODIGO_EM_USO` e só arquiva com `p_substituir = true`. Nada é apagado (lição 2 do pós-mortem).
- Qualquer facilitador cadastrado comanda qualquer turma (equipe pequena, um evento por vez).

## Regras de entrada (RPC `entrar_grupo(codigo, nome)`)

| Situação | Resultado |
|---|---|
| Turma `aberta` e nome novo | cria o grupo, devolve token e cor |
| Turma em rodada (`rodada1`/`rodada2`), nome novo, `entrada_liberada = falso` | recusa: "A rodada já começou. Fale com o facilitador." |
| Turma em rodada, nome novo, `entrada_liberada = verdadeiro` | cria o grupo, que entra na rodada atual |
| Nome já existe e o computador tem o token desse grupo | reconecta (devolve o estado para restaurar) |
| Nome já existe, sem token, `reconexao_liberada = verdadeiro` | gera novo token, restaura o estado salvo no servidor e desliga a liberação |
| Nome já existe, sem token, sem liberação | recusa: "Esse grupo já está no jogo. Se é o seu, peça ao facilitador para liberar a reconexão." |
| Turma `aberta`, nome novo | cria o grupo |
| Turma em `rodada1`, `debrief` ou `rodada2`, nome novo, sem liberação | recusa: "O jogo já começou. Fale com o facilitador." (todo grupo joga as duas rodadas) |
| Turma `encerrada` ou `arquivada` | recusa, inclusive reconexão |
| Sala com `max_grupos` (12) grupos ativos | recusa: `TURMA_CHEIA` |

Nome: espaços normalizados, 2 a 30 caracteres, comparação sem diferenciar maiúsculas ("Grupo A" = "grupo  a"). Cor: a primeira livre de 8 cores fixas (repete a partir do 9º grupo). O token (32 bytes aleatórios, 43 caracteres base64url) volta **uma vez**, só quando é gerado; o banco guarda só o sha256. Reconexão pelo próprio token não troca o token.

## RPCs

Todas são `security definer` com `search_path = ''` e nomes qualificados. Parâmetros com prefixo `p_` (é o nome que vai no `supabase.rpc`). Todas devolvem `jsonb`, com chaves em snake_case (o B2 converte para o formato do contrato 4 no schema Zod).

**Públicas (anon e authenticated):**

| RPC | Devolve |
|---|---|
| `estado_turma(p_codigo, p_token?)` | `id, codigo, nome, evento, data, status, rodada, rodada_inicio, rodada_fim, pausada, pausada_em, pausa_acumulada_ms, minuto, hora_servidor, entrada_liberada, full_capacity_liberado, musica_mudo, grupos[{id, nome, cor, conectado}]`. Com `p_token` válido, marca o grupo como visto (presença na sala de espera) e acrescenta `token_valido`. Busca a turma ativa com o código ou, se não houver, a mais recente (arquivada). |
| `ranking(p_codigo)` | `[{posicao, grupo_id, nome, cor, rodada, pontuacao, minuto, metricas}]`, rodada 1 e depois rodada 2. Empate: quem entrou antes na turma e, depois, o nome (ordem estável; migração `20261102100000`) |
| `obter_relatorio(p_slug)` | `{slug, criado_em, versao_regras, dados}` |

**Do grupo (anon e authenticated; o token identifica o grupo, não há parâmetro de grupo):**

| RPC | Regra |
|---|---|
| `entrar_grupo(p_codigo, p_nome, p_token?)` | Tabela acima. Devolve `{turma_id, status, rodada, grupo{id, nome, cor}, token, reconectado, estado_salvo, hora_servidor}`; `token` é `null` quando não foi gerado token novo. |
| `enviar_estado(p_token, p_rodada, p_minuto, p_versao, p_estado, p_pontuacao, p_metricas)` | Recusa `p_versao` ≤ guardada (`VERSAO_ANTIGA`) e rodada que não é a atual (`RODADA_INVALIDA`). Plausibilidade (migração `20261102100100`): minuto mais de 3 min à frente do relógio da sala ou menor que o guardado, pontuação fora de 0–3000 e estado acima de 256 KB dão `DADOS_INVALIDOS`; nova versão menos de 1 s depois da anterior do mesmo grupo dá `LIMITE_EXCEDIDO` (o app envia a cada 2 s e tenta de novo). Grava estado e placar e atualiza `grupos.visto_em`. Métricas ≤ 16 KB, minuto 420–1140. |
| `obter_estado(p_token, p_rodada?)` | Último estado do próprio grupo (`{rodada, minuto, versao, estado, atualizado_em}`) ou `null`. Sem rodada, usa a atual. |
| `registrar_serie(p_token, p_rodada, p_minuto, p_metricas)` | Um ponto por (grupo, rodada, minuto); reenvio não altera (`{registrado: false}`). |
| `registrar_eventos(p_token, p_rodada, p_eventos)` | Lista de `{minuto, tipo, mensagem?, chave?}`; até 50 por chamada e 3000 por grupo e rodada. `chave` torna o reenvio idempotente. |

**Do facilitador (só authenticated; cada uma confere `auth.uid()` em `facilitadores`):** `abrir_turma(p_codigo, p_nome, p_evento?, p_data?, p_substituir?)`, `mudar_status(p_turma_id, p_status)`, `pausar(p_turma_id)`, `retomar(p_turma_id)`, `liberar_entrada(p_turma_id, p_liberada?)`, `liberar_reconexao(p_grupo_id, p_liberada?)`, `liberar_full_capacity(p_turma_id, p_liberado?)`, `alternar_musica(p_turma_id, p_mudo?)` (sem `p_mudo`, inverte), `remover_grupo(p_grupo_id)`, `gerar_relatorio(p_turma_id, p_versao_regras?, p_local?)`. Devolvem o estado da turma com, por grupo, também `visto_em`, `reconexao_liberada` e `removido`. Pausar já pausada e retomar não pausada não fazem nada (clique duplo não dá erro). `remover_grupo` é lógico: o token deixa de valer, o nome fica livre e os dados ficam guardados, fora do ranking e do relatório. `gerar_relatorio` só depois de `encerrada`; congela grupos, ranking R1/R2, placar, séries e eventos em `relatorios.dados`, cria `slug` aleatório de 24 caracteres (144 bits), passa a turma para `arquivada`; chamar de novo devolve o mesmo slug. Grava também `dados.facilitador` (o `nome` em `facilitadores` de quem gerou) e `dados.local` (`p_local`, até 120 caracteres; padrão `Windsor Barra Hotel, Rio de Janeiro`). Devolve `{slug, turma}`.

**Leituras do facilitador (só authenticated, mesma checagem; migração `20261101200000`):**

| RPC | Devolve |
|---|---|
| `painel_turma(p_turma_id)` | O estado da turma na visão do facilitador (o mesmo formato das ações, com `visto_em`, `reconexao_liberada` e `removido` por grupo). É a consulta periódica do painel. |
| `series_turma(p_turma_id, p_rodada?)` | `[{grupo_id, nome, cor, rodada, minuto, metricas}]` dos grupos ativos, por grupo, rodada e minuto. |
| `eventos_turma(p_turma_id, p_desde_minuto?, p_rodada?, p_limite? = 100)` | `[{id, grupo_id, nome, cor, rodada, minuto, tipo, mensagem, criado_em}]` dos grupos ativos, mais recentes primeiro; `p_limite` de 1 a 500. Alimenta o painel e o telão aberto pela janela logada do facilitador. |

Turma inexistente: `TURMA_NAO_ENCONTRADA`; rodada fora de 1–2 ou limite fora da faixa: `DADOS_INVALIDOS`.

## Erros

`raise exception` com `message` = código estável, `detail` = frase para a tela, `hint` = código e SQLSTATE próprio. No supabase-js: `error.message` é o código, `error.details` a frase. O PostgREST responde HTTP 400 para todos.

| Código | SQLSTATE | Quando |
|---|---|---|
| `TURMA_NAO_ENCONTRADA` | CB001 | código ou id de turma inexistente |
| `ENTRADA_FECHADA` | CB002 | rodada em andamento sem entrada liberada; turma encerrada/arquivada |
| `GRUPO_JA_ATIVO` | CB003 | nome em uso, sem o token do grupo e sem reconexão liberada |
| `TOKEN_INVALIDO` | CB004 | token malformado, inexistente ou de grupo removido |
| `VERSAO_ANTIGA` | CB005 | `enviar_estado` com versão ≤ guardada |
| `NAO_AUTORIZADO` | CB006 | RPC de facilitador sem login ou sem cadastro em `facilitadores` |
| `TRANSICAO_INVALIDA` | CB007 | transição fora do diagrama; pausar fora de rodada; relatório antes de encerrar |
| `DADOS_INVALIDOS` | CB008 | nome, minuto, tamanho ou formato fora dos limites; grupo inexistente |
| `RODADA_INVALIDA` | CB009 | envio para rodada que não é a atual (ou depois dos 30 s de tolerância) |
| `TURMA_CHEIA` | CB010 | `max_grupos` atingido |
| `CODIGO_EM_USO` | CB011 | `abrir_turma` com turma ativa de mesmo código e grupos, sem `p_substituir` |
| `RELATORIO_NAO_ENCONTRADO` | CB012 | slug malformado ou inexistente |
| `LIMITE_EXCEDIDO` | CB013 | mais de 50 eventos por chamada ou 3000 por rodada; `enviar_estado` com menos de 1 s desde o último envio |

Sem permissão de EXECUTE (anon chamando RPC de facilitador) o PostgREST responde 401 `permission denied` antes de entrar na função.

## Acesso direto às tabelas

- `anon` e `authenticated` não têm INSERT, UPDATE, DELETE nem TRUNCATE em nenhuma tabela nova (revogados; não depende só do RLS).
- Leitura pública por GRANT de coluna + RLS: `turmas` (sem `facilitador_id`, `max_grupos`), `grupos` (sem `token_hash`; `reconexao_liberada` só para logados), `placar`. Views `turmas_publicas`, `grupos_publicos` (com `conectado` = visto nos últimos 15 s) e `placar_publico`, todas `security_invoker`.
- `estado_jogo`, `serie_metricas`, `eventos_jogo` e `relatorios`: só o facilitador lê direto (política para `authenticated` que exige cadastro em `facilitadores`); `anon` não tem GRANT.
- Funções auxiliares ficam no schema `interno`, que não é exposto pelo PostgREST e não tem USAGE para ninguém além do dono.

## Volume esperado

6 grupos × (1 envio de estado por 2 s + 1 leitura de estado por 1 s) + facilitador e telão lendo a cada 1 s ≈ 10 requisições por segundo. Muito abaixo de qualquer limite do Supabase.

## Prova de segurança (etapa B4, D3)

Script que, com a chave pública, tenta: escrever direto em cada tabela, ler `estado_jogo` e `token_hash`, mudar o status da turma, enviar estado com token de outro grupo e ler relatório sem o slug. Todas as tentativas precisam falhar, e o resultado vai para `docs/`.

- `supabase/tests/prova-seguranca.mjs`: o script acima, contra o projeto real, depois de aplicado (`supabase/README.md`, seção 5). Ainda não foi rodado.
- `supabase/tests/rodar-local.sh`: o mesmo raciocínio dentro do banco, num Postgres local, com os papéis `anon` e `authenticated` de verdade (130+ verificações, incluindo catálogo: RLS em todas as tabelas, nenhuma política de escrita, `search_path` fixo em toda `security definer`).
