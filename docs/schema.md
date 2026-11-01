# Schema — dados, acesso e máquina de estados

> Proposta para o CBMEDE 2026. Nada aqui foi aplicado no banco. A etapa B4 escreve as migrações em `supabase/migrations/` e só as aplica com autorização do Gustavo. As tabelas do FLAME (`rooms`, `teams`, `game_state`, `game_logs`) ficam intactas como arquivo.

## Princípios

1. **Turma é a unidade.** Um evento tem uma turma; a comparação é sempre dentro da turma. Cada turma fica guardada com seus resultados e seu relatório.
2. **Ninguém escreve direto nas tabelas.** O navegador só lê o que é público e escreve por funções no banco (RPC), que validam quem chama e se a ação faz sentido no momento. Assim a regra mora no servidor (playbook, `19-seguranca`: "campo que o servidor decide, o servidor grava").
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
- **Minuto do plantão** = 420 + ⌊(agora − rodada_inicio − pausa_acumulada) / 1000⌋, limitado a 1140 (7h → 19h).

## Regras de entrada (RPC `entrar_grupo(codigo, nome)`)

| Situação | Resultado |
|---|---|
| Turma `aberta` e nome novo | cria o grupo, devolve token e cor |
| Turma em rodada, nome novo, `entrada_liberada = falso` | recusa: "A rodada já começou. Fale com o facilitador." |
| Turma em rodada, nome novo, `entrada_liberada = verdadeiro` | cria o grupo, que entra na rodada atual |
| Nome já existe e o computador tem o token desse grupo | reconecta (devolve o estado para restaurar) |
| Nome já existe, sem token, `reconexao_liberada = verdadeiro` | gera novo token, restaura o estado salvo no servidor e desliga a liberação |
| Nome já existe, sem token, sem liberação | recusa: "Esse grupo já está no jogo. Se é o seu, peça ao facilitador para liberar a reconexão." |
| Turma `encerrada` ou `arquivada` | recusa |

## RPCs

**Públicas:** `estado_turma(codigo)` (status, rodada, relógio, hora do servidor, flags), `ranking(codigo)`, `obter_relatorio(slug)`.

**Do grupo (exigem token):** `entrar_grupo`, `enviar_estado(token, rodada, minuto, versao, estado, pontuacao, metricas)` (recusa versão antiga e rodada que não é a atual), `obter_estado(token, rodada)`, `registrar_serie`, `registrar_eventos`.

**Do facilitador (exigem login e cadastro em `facilitadores`):** `abrir_turma`, `mudar_status`, `pausar`, `retomar`, `liberar_entrada`, `liberar_reconexao(grupo)`, `liberar_full_capacity`, `alternar_musica`, `remover_grupo`, `gerar_relatorio`.

## Volume esperado

6 grupos × (1 envio de estado por 2 s + 1 leitura de estado por 1 s) + facilitador e telão lendo a cada 1 s ≈ 10 requisições por segundo. Muito abaixo de qualquer limite do Supabase.

## Prova de segurança (etapa B4, D3)

Script que, com a chave pública, tenta: escrever direto em cada tabela, ler `estado_jogo` e `token_hash`, mudar o status da turma, enviar estado com token de outro grupo e ler relatório sem o slug. Todas as tentativas precisam falhar, e o resultado vai para `docs/`.
