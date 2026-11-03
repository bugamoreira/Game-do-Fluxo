# Prova de segurança no ambiente real

> 3/11/2026. Site de teste `plantaocbmede26.netlify.app (então chamado plantaocbmede-teste)` (proxy) contra o Supabase `okmafynejwrwnmvyruwy`, com a conta real do facilitador. Comando: `scripts/backend-local/prova-local.mjs` com BACKEND_URL apontando para o site de teste.

```
Turma PROVA aberta no backend local.

Tentativa                                                     Resultado  Detalhe
------------------------------------------------------------  ---------  -------
Sanidade: chamar a RPC pública estado_turma (deve responder)  PASSOU     200 
INSERT direto em facilitadores                                PASSOU     401 permission denied for table facilitadores
UPDATE direto em facilitadores                                PASSOU     401 permission denied for table facilitadores
DELETE direto em facilitadores                                PASSOU     401 permission denied for table facilitadores
INSERT direto em turmas                                       PASSOU     401 permission denied for table turmas
UPDATE direto em turmas                                       PASSOU     401 permission denied for table turmas
DELETE direto em turmas                                       PASSOU     401 permission denied for table turmas
INSERT direto em grupos                                       PASSOU     401 permission denied for table grupos
UPDATE direto em grupos                                       PASSOU     401 permission denied for table grupos
DELETE direto em grupos                                       PASSOU     401 permission denied for table grupos
INSERT direto em placar                                       PASSOU     401 permission denied for table placar
UPDATE direto em placar                                       PASSOU     401 permission denied for table placar
DELETE direto em placar                                       PASSOU     401 permission denied for table placar
INSERT direto em estado_jogo                                  PASSOU     401 permission denied for table estado_jogo
UPDATE direto em estado_jogo                                  PASSOU     401 permission denied for table estado_jogo
DELETE direto em estado_jogo                                  PASSOU     401 permission denied for table estado_jogo
INSERT direto em serie_metricas                               PASSOU     401 permission denied for table serie_metricas
UPDATE direto em serie_metricas                               PASSOU     401 permission denied for table serie_metricas
DELETE direto em serie_metricas                               PASSOU     401 permission denied for table serie_metricas
INSERT direto em eventos_jogo                                 PASSOU     401 permission denied for table eventos_jogo
UPDATE direto em eventos_jogo                                 PASSOU     401 permission denied for table eventos_jogo
DELETE direto em eventos_jogo                                 PASSOU     401 permission denied for table eventos_jogo
INSERT direto em relatorios                                   PASSOU     401 permission denied for table relatorios
UPDATE direto em relatorios                                   PASSOU     401 permission denied for table relatorios
DELETE direto em relatorios                                   PASSOU     401 permission denied for table relatorios
UPDATE do status da turma (mudar status direto)               PASSOU     401 permission denied for table turmas
UPDATE pela view grupos_publicos                              PASSOU     401 permission denied for view grupos_publicos
Listar turmas pela view turmas_publicas                       PASSOU     401 permission denied for view turmas_publicas
Listar grupos pela view grupos_publicos                       PASSOU     401 permission denied for view grupos_publicos
Listar placares pela view placar_publico                      PASSOU     401 permission denied for view placar_publico
Listar turmas direto                                          PASSOU     401 permission denied for table turmas
Listar grupos direto                                          PASSOU     401 permission denied for table grupos
Listar placar direto                                          PASSOU     401 permission denied for table placar
Ler estado_jogo                                               PASSOU     401 permission denied for table estado_jogo
Ler grupos.token_hash                                         PASSOU     401 permission denied for table grupos
Ler grupos com select=*                                       PASSOU     401 permission denied for table grupos
Ler token_hash pela view                                      PASSOU     400 column grupos_publicos.token_hash does not exist
Ler serie_metricas                                            PASSOU     401 permission denied for table serie_metricas
Ler eventos_jogo                                              PASSOU     401 permission denied for table eventos_jogo
Listar relatorios (ler sem slug)                              PASSOU     401 permission denied for table relatorios
Ler facilitadores                                             PASSOU     401 permission denied for table facilitadores
Ler turmas.facilitador_id                                     PASSOU     401 permission denied for table turmas
obter_relatorio com slug inventado                            PASSOU     400 RELATORIO_NAO_ENCONTRADO
obter_relatorio com slug vazio                                PASSOU     400 RELATORIO_NAO_ENCONTRADO
RPC abrir_turma sem login                                     PASSOU     401 permission denied for function abrir_turma
RPC mudar_status sem login                                    PASSOU     401 permission denied for function mudar_status
RPC pausar sem login                                          PASSOU     401 permission denied for function pausar
RPC retomar sem login                                         PASSOU     401 permission denied for function retomar
RPC liberar_reconexao sem login                               PASSOU     401 permission denied for function liberar_reconexao
RPC liberar_full_capacity sem login                           PASSOU     401 permission denied for function liberar_full_capacity
RPC alternar_musica sem login                                 PASSOU     401 permission denied for function alternar_musica
RPC remover_grupo sem login                                   PASSOU     401 permission denied for function remover_grupo
RPC gerar_relatorio sem login                                 PASSOU     401 permission denied for function gerar_relatorio
RPC painel_turma sem login                                    PASSOU     401 permission denied for function painel_turma
RPC codigo_acesso_telao sem login                             PASSOU     401 permission denied for function codigo_acesso_telao
RPC series_turma sem login                                    PASSOU     401 permission denied for function series_turma
RPC eventos_turma sem login                                   PASSOU     401 permission denied for function eventos_turma
RPC liberar_entrada não existe mais                           PASSOU     404 Could not find the function public.liberar_entrada(p_liberada, p_turma_id) in the schema cache
RPC interna hash_token                                        PASSOU     404 Could not find the function public.hash_token(p_token) in the schema cache
RPC interna exigir_facilitador                                PASSOU     404 Could not find the function public.exigir_facilitador without parameters in the schema cache
enviar_estado com token inventado                             PASSOU     400 TOKEN_INVALIDO
enviar_estado escolhendo o grupo (parâmetro grupo_id)         PASSOU     404 Could not find the function public.enviar_estado(p_estado, p_grupo_id, p_metricas, p_minuto, p_pontuacao, p_rodada, p_token, p_versao) in the schema cache
obter_estado com token inventado                              PASSOU     400 TOKEN_INVALIDO
Entrar grupo novo sem código de acesso                        PASSOU     400 CODIGO_ACESSO_INVALIDO
Entrar grupo novo com código de acesso errado                 PASSOU     200 CODIGO_ACESSO_INVALIDO
estado_turma não expõe o código de acesso                     PASSOU     200
Entrar 2 grupos de teste (deve funcionar)                     PASSOU     tokens distintos
Tomar o grupo A sem token (mesmo nome)                        PASSOU     400 GRUPO_JA_ATIVO
Tomar o grupo A com o token do grupo B                        PASSOU     400 GRUPO_JA_ATIVO
Token de B não altera o estado de A                           PASSOU     200
estado_turma não expõe token nem hash                         PASSOU     200
estado_turma devolve hora_servidor (deve funcionar)           PASSOU     
Aviso: cadastro de conta pelo Auth                            AVISO      disable_signup=false: desligue em Authentication > Sign In / Providers

73 verificações, 0 falha(s).
```
