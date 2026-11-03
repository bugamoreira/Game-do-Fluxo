# Ajustes da revisão do Gustavo

> Lista viva dos pedidos feitos durante a revisão das telas (a partir de 1º/11/2026). Cada item entra assim que é pedido e muda de estado quando é feito. As decisões de regra de jogo continuam em `docs/plano.md`.

Legenda: ✅ feito · 🔧 em andamento · ⏳ pendente · 💬 aguarda decisão do Gustavo

## Textos e identidade

| # | Pedido | Onde | Estado |
|---|---|---|---|
| 1 | O curso pré acontece em **25 de novembro** (não 25 a 28) | Orientações, docs | ✅ |
| 2 | É o **Curso de Gestão do ED Leaders** | Orientações, descrição da página, demos, docs | ✅ |
| 3 | Não falar em "sete pessoas": **um grupo, um plantão** | Orientações (abertura e seção de papéis), docs | ✅ |
| 4 | Revisão de textos (UX copy) em todas as telas, com norma culta | Jogo, painel, telão, relatório | ✅ primeira varredura ("time" → "grupo"); seguir revisando a cada print |
| 5 | Frase de abertura em duas linhas: "Cada grupo assume um plantão." / "Decidam juntos para o hospital fluir antes que o plantão trave." | Orientações | ✅ |
| 6a | Cartões de "Como funciona" encavalados e quebras de linha ruins: setas com espaço próprio, cartões explicativos em 2 × 2, quebras equilibradas; menu do topo some antes de quebrar | Orientações | ✅ |
| 6c | Nome do jogo: **Simulador do Fluxo** (antes, Simulador do Plantão); as rodadas continuam Plantão Travado e Plantão Lean | Todas as telas, títulos das abas, docs | ✅ |
| 6b | "Pronto-socorro" → **departamento de emergência**; "vigia" → **monitoramento** | Orientações, relatório, demos | ✅ |
| 6 | Pergunta frequente "O jogo já começou" ainda fala em liberar grupo atrasado | Orientações | ✅ |

## Navegação

| # | Pedido | Onde | Estado |
|---|---|---|---|
| 7 | Telas sem como voltar | Entrada do grupo → orientações; treino → entrada da sala e escolha da rodada; login do facilitador → orientações | ✅ |
| 7b | Som sumiu no Safari: o módulo de áudio passa a ser pré-carregado e o som liga dentro do clique; se o navegador recusar, o próximo clique tenta de novo | Jogo | ✅ (confirmar no Safari do Gustavo) |
| 8 | Sem "voltar" na sala de espera e durante a rodada (de propósito, para ninguém abandonar a dinâmica) | Jogo em turma | ✅ decisão de projeto |

## Regras de acesso (decididas em 1º/11)

| # | Decisão | Estado |
|---|---|---|
| 9 | Nenhum grupo novo depois do início; a sala só começa com todos conectados; sai o botão "Liberar entrada" | ✅ |
| 10 | Máximo de 10 grupos por turma | ✅ |
| 11 | Reconexão liberada continua: mesmo nome + código de acesso | ✅ mantida |

## Defeitos do ensaio com 6 grupos-robô

| # | Defeito | Estado |
|---|---|---|
| 12 | Música trava a página em computador lento | ✅ |
| 13 | Espera de login nos grupos sob carga | ✅ |
| 14 | Relógio passa do horário na pausa | ✅ |
| 15 | Dados atrasados do Travado recusados durante o Lean | ✅ |
| 16 | Presença de cada grupo na tela "Ao vivo" | ✅ |
| 17 | Documentação dizia pontuação mínima 50 (o certo é 0) | ✅ |

## Publicação (passos do Gustavo)

| # | Passo | Estado |
|---|---|---|
| 17b | Migrações 1 a 9 aplicadas no Supabase real (autorizado em 1º/11); 35 funções conferidas uma a uma com o banco de teste; Security Advisor só aponta as RPCs expostas de propósito | ✅ |
| 17c | Migrações 10 a 12 (dados atrasados, entrada só antes do início, 10 grupos) | ✅ todas aplicadas (a função antiga `liberar_entrada` foi apagada em 3/11) |
| 18 | Site `plantaocbmede-teste.netlify.app`, renomeado pelo Gustavo para **`plantaocbmede26.netlify.app`** (endereço oficial do evento), criado e publicado (3/11), com as variáveis; teste de fumaça 26/26 e prova de segurança 73/73 contra o banco real (`docs/prova-seguranca-real.md`) | ✅ |
| 19 | Desligar cadastro aberto no Supabase | ✅ |
| 20 | Usuário do facilitador criado e cadastrado em `facilitadores` (3/11, a pedido do Gustavo) | ✅ |
| 21 | Teto de gastos no Supabase | ✅ |
| 22 | Secret scanning e push protection no GitHub | ✅ já estavam ligados |
| 23 | Preparar o Mac para o ensaio local (Homebrew e Postgres 16) | dispensável com o site de teste |

## Pequenos ajustes técnicos anotados

| # | Item | Estado |
|---|---|---|
| 25 | Botão "Trocar senha" no painel do facilitador | ✅ |
| 24 | Aviso do Vite sobre `__dirname` no `vite.config.ts` | ✅ |
