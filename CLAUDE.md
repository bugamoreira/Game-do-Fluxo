# Simulador do Plantão — CBMEDE 2026

Jogo educacional de gestão de fluxo na emergência para o Curso de Gestão do ED Leaders, pré-congresso do CBMEDE 2026 (25 de novembro, Windsor Barra, Rio de Janeiro). Cerca de seis grupos, um plantão por grupo, jogam no próprio computador o Plantão Travado (rodada 1) e o Plantão Lean (rodada 2); o facilitador conduz a turma e o telão projeta o ranking.

## Regras absolutas

- **Nada de deploy, push para `main` ou aplicação de migração no Supabase sem autorização expressa do Gustavo.** `main` é produção.
- **Publicação única** em `plantaocbmede.netlify.app`, só depois do ensaio aprovado (`docs/plano.md`). O `plantaoflame.netlify.app` está congelado.
- **Nenhuma credencial no código.** Facilitador entra pelo Supabase Auth; as variáveis `VITE_*` são públicas no bundle e só levam a chave anônima.
- Não apague dados nem rode SQL no projeto real sem perguntar.

## Onde está o contexto

- `docs/plano.md` (fases e decisões do Gustavo), `docs/fluxo.md` (regras do jogo), `docs/design.md` (marca e telas), `docs/schema.md` (tabelas, RPCs e erros), `docs/contratos.md` (motor, services, hooks), `docs/pos-mortem-flame.md`, `docs/adr/`.
- Banco: `supabase/README.md`. Ensaio local: `scripts/backend-local/README.md`.
- Playbook de engenharia (fora do repositório): `19-seguranca/README.md`, `07-service-layer.md`, `09-validacao-runtime.md`. Se não estiver acessível na sessão, diga isso em vez de improvisar.

## Arquitetura

| Pasta | O que é |
|---|---|
| `src/shared/lib/simulation/` | Motor puro e determinístico (semente, `passo`, `aplicarAcao`, `metricas`) |
| `src/shared/services/` | Únicos módulos que falam com o Supabase (RPC + Auth); respostas validadas com Zod (`src/shared/schemas/`) |
| `src/shared/hooks/` | Consulta periódica (1 s) com reconexão e relógio do servidor; **sem Realtime** |
| `src/shared/components/ui/` | Design system (catálogo local em `ui.html`) |
| `src/player/` | Jogo do grupo (`jogar.html`), telas J1–J6 |
| `src/instructor/` | Painel do facilitador (`instrutor.html`), F0–F5 |
| `src/projector/` | Telão (`projetor.html`), P1–P4, e música |
| `src/report/` | Relatório da turma (`relatorio.html?r=<slug>`) |
| `src/landing/` | Orientações e teste do computador (`index.html`, TS puro) |
| `supabase/` | Migrações, rollback e testes SQL locais |
| `scripts/backend-local/` | Postgres temporário + servidor que imita o Supabase, para o ensaio |

Toda escrita passa por RPC `security definer` que valida quem chama; o navegador fala só com o próprio domínio (proxy `/rest` e `/auth` no `netlify.toml` e no `vite.config.ts`). Jogo, painel, telão e relatório têm modo demonstração (`?demo=1`). `src/shared/types/` e `src/shared/lib/game-engine.ts` ainda fornecem tipos e a fórmula de pontos ao motor; os componentes soltos em `src/shared/components/` (`Podium`, `TeamRow`, `ScoreBar`, `PSvg`) são legado do FLAME e não devem ser usados em código novo.

## Regras de trabalho

- TypeScript estrito; componente não fala com banco (só com service); Zod em toda borda (RPC, `localStorage`, URL).
- Autorização é no servidor. RPC nova: `security definer`, `set search_path = ''`, nomes qualificados, `grant execute` só a quem precisa, teste em `supabase/tests/local/`.
- Mudou comportamento, atualize `docs/` no mesmo commit. Conventional Commits em português; norma culta em todo texto.
- Uma etapa por vez, com tipos, lint, testes e build verdes antes da próxima.

## Comandos

```bash
npm run dev            # Vite em http://localhost:3000 (precisa de .env com VITE_SUPABASE_URL e VITE_SUPABASE_KEY)
npm run build          # tsc --noEmit + vite build
npx tsc --noEmit && npx eslint src && npx vitest run --exclude '.claude/**'
bash supabase/tests/rodar-local.sh       # migrações num Postgres temporário
npm run backend:local  # backend de ensaio (outro terminal: npm run dev:local)
npm run fumaca:local && npm run prova:local   # com o backend local no ar
```
