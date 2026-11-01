# Simulador do Plantão — CBMEDE 2026

Jogo educacional de gestão de fluxo na emergência, da ED Leaders com a ABRAMEDE, para o curso pré-congresso do CBMEDE 2026 (Rio de Janeiro, novembro de 2026). Cada grupo coordena o fluxo de um hospital em duas rodadas com a mesma demanda: o **Plantão Travado**, em que tudo depende do gestor, e o **Plantão Lean**, em que ferramentas automáticas puxam o fluxo. A comparação mostra o efeito do Lean no boarding, nos óbitos evitáveis e na carga do gestor.

Endereço do evento: **plantaocbmede.netlify.app** (publicado só depois do ensaio aprovado).

## Telas

| Endereço | Quem usa | O que faz |
|---|---|---|
| `/` | grupos | Orientações e teste do computador |
| `/jogar.html` | grupos | O jogo (entrada pelo código da sala; `?modo=solo` para treinar sem sala) |
| `/instrutor.html` | facilitador | Login, abrir a turma, iniciar e encerrar rodadas, debrief, resultado e relatório |
| `/projetor.html` | telão | Sala aberta, ranking ao vivo, debrief e pódio, com música por rodada |
| `/relatorio.html?r=<código>` | todos | Relatório da turma para compartilhar e imprimir |

Jogo, painel, telão e relatório têm modo demonstração sem servidor (`?demo=1`).

## Como funciona

- **Motor** (`src/shared/lib/simulation/`): simulação pura e determinística; mesma semente e mesmas ações dão o mesmo resultado. Regras em `docs/fluxo.md`.
- **Servidor**: Supabase (Postgres + Auth). O navegador não escreve em tabela nenhuma: toda escrita passa por funções no banco (RPC) que validam quem chama e se a ação faz sentido no momento. O grupo se identifica por um token gerado ao entrar; o facilitador, por login no Supabase Auth. Desenho completo em `docs/schema.md`.
- **Sincronização**: consulta periódica (cerca de 1 s) pelo mesmo domínio do site, com proxy para `/rest` e `/auth`. Não há Realtime nem WebSocket (`docs/pos-mortem-flame.md`). O relógio do plantão é o do servidor; o grupo que perde a conexão não é expulso: guarda uma cópia local do jogo e reenvia ao voltar.
- **Services** (`src/shared/services/`): únicos módulos que falam com o Supabase; toda resposta é validada com Zod.

## Desenvolvimento

Requisitos: Node 20+ e, para o banco local, Postgres 16.

```bash
npm ci
npm run dev                  # http://localhost:3000, com .env (veja .env.example)
npm run build                # checagem de tipos + build de produção
npx tsc --noEmit && npx eslint src && npx vitest run --exclude '.claude/**'
```

**Ensaio completo sem internet** (não toca no Supabase real): `npm run backend:local` num terminal e `npm run dev:local` em outro. Credenciais de teste, teste de fumaça e prova de segurança em `scripts/backend-local/README.md`.

**Banco**: as migrações ficam em `supabase/migrations/` e são validadas com `bash supabase/tests/rodar-local.sh`. Aplicar no projeto real, cadastrar o facilitador e reverter: `supabase/README.md` (só com autorização).

## Configuração

`.env` (não versionado) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (chave anônima, pública por natureza). Nenhuma senha ou chave de serviço vai para o código. Em produção, as mesmas variáveis ficam no Netlify, e o `netlify.toml` faz o proxy e os cabeçalhos de segurança.

## Documentação

`docs/plano.md` (plano e decisões), `docs/fluxo.md` (regras), `docs/design.md` (marca e telas), `docs/schema.md` (banco), `docs/contratos.md` (interfaces), `docs/revisao-logica.md`, `docs/adr/`.

Responsável: Gustavo Fernandes Moreira — ED Leaders.
