# Diretrizes de Trabalho — Simulador do Plantao (FLAME 2026)

## Regras Absolutas

- **NUNCA fazer deploy sem autorizacao expressa do Gustavo** ("deployar", "pode subir", "ok")
- **NUNCA fazer push para `main`** sem autorizacao — `main` = producao (plantaoflame.netlify.app)
- Desenvolvimento acontece em branches (`feat/vite-migration`, etc.)
- Merge para `main` apenas apos teste funcional completo

## Projeto

- **O que e**: Jogo educacional multiplayer de gestao de fluxo hospitalar
- **Evento**: FLAME 2026, 29 de abril — 2o Congresso Latino-americano de Medicina de Emergencia
- **Branding**: ED Leaders (principal), FLAME 2026, ABRAMEDE
- **URL producao**: plantaoflame.netlify.app
- **GitHub**: bugamoreira/Game-do-Fluxo
- **Supabase**: okmafynejwrwnmvyruwy.supabase.co

## Stack (branch feat/vite-migration)

| Camada | Tecnologia |
|--------|-----------|
| Build | Vite 6 |
| Framework | React 19 |
| Linguagem | TypeScript (strict mode) |
| State | useState + useRef (Zustand planejado para Fase 2) |
| Backend | Supabase (PostgreSQL + Realtime + RLS) |
| Audio | Tone.js v15 (sintese adaptativa) |
| Deploy | Netlify (auto-deploy do git push main) |
| Validacao | Zod (planejado para Fase 2) |

## Estrutura de Arquivos

```
index.html                    # Player entry point
instrutor.html                # Instructor entry point
projetor.html                 # Projector entry point
vite.config.ts                # Multi-entry build (3 HTMLs)
tsconfig.json                 # Strict mode
.env                          # VITE_SUPABASE_URL + VITE_SUPABASE_KEY (nao commitado)
.env.example                  # Template
netlify.toml                  # command="npm run build", publish="dist"

src/
  shared/                     # Codigo compartilhado entre as 3 apps
    types/
      game.ts                 # Patient, Surgery, Stats, Events, LogEntry, Phase, Round, etc
      supabase.ts             # DbRoom, DbTeam, DbGameState, DbGameLog
    lib/
      supabase.ts             # createClient com env vars
      game-engine.ts          # Funcoes puras: mkInit, calcScore, rollDest, hospMult, etc
      music.ts                # Tone.js ES module: SimsMusic.init/update/sfx/toggleMute
      format.ts               # fmt, pctOf, rnd, pick, getScoreColor
      constants.ts            # CAP, SEV, TICK, SH, EH, BOARD_*, NAMES, TEAM_COLORS
    components/
      ErrorBoundary.tsx       # Fallback visual de erro (class component)
      ScoreBar.tsx             # Barra de score parametrizavel
      TeamRow.tsx              # Linha de ranking
      Podium.tsx               # Podio final com medalhas
      PSvg.tsx                 # Icone SVG de paciente
    hooks/                    # (Fase 2: useSupabaseRoom, useSession)
    stores/                   # (Fase 2: Zustand game-store)

  player/                     # App do jogador
    main.tsx                  # createRoot + ErrorBoundary
    App.tsx                   # Game component (~700 linhas: tick, move, render)
    components/
      RoleSelector.tsx        # Tela inicial (Jogador / Facilitador)
      LobbyScreen.tsx         # Entrada na sala FLAME
      WaitingScreen.tsx       # Aguardando facilitador
      MenuScreen.tsx          # Solo: Plantao Travado ou Lean
      GameOverModal.tsx       # Modal de fim de rodada + comparativo R1 vs R2
      Chip.tsx                # Paciente no DE/RPA/UTI
      MiniChip.tsx            # Paciente na ENF (compacto)
      SurgeryPanel.tsx        # Painel CC com cirurgias
      FacilitadorLogin.tsx    # Login → redirect instrutor.html

  instructor/                 # App do facilitador
    main.tsx
    App.tsx                   # Dashboard + Login + Ranking + Controles

  projector/                  # App do projetor
    main.tsx
    App.tsx                   # Ranking ao vivo + Musica + Podio

public/                       # Assets estaticos (Vite copia para dist)
  img/
    edleaders.png
    flame-banner.jpg
```

## Convencoes de Codigo

### TypeScript
- `strict: true` no tsconfig — sem `any` exceto em migracoes incrementais
- Tipos definidos em `src/shared/types/` — nunca inline
- Funcoes puras em `src/shared/lib/` — sem side effects
- Componentes React em `.tsx`, logica pura em `.ts`

### Componentes React
- Functional components (sem class, exceto ErrorBoundary)
- Props tipadas com interfaces no mesmo arquivo
- Componentes compartilhados em `src/shared/components/`
- Componentes especificos de cada app em `src/{app}/components/`

### Supabase
- Cliente em `src/shared/lib/supabase.ts` — NUNCA hardcoded
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`
- RLS granular (nao "Allow all")
- Realtime: REPLICA IDENTITY FULL em todas as tabelas
- game_logs e append-only (sem UPDATE/DELETE)

### Game Engine
- Funcoes puras em `game-engine.ts` — sem React, sem DOM, sem side effects
- Constantes em `constants.ts` — nunca magic numbers
- Formatacao em `format.ts` — `fmt()` e amigos deduplicados (uma unica fonte)

### Multiplayer (Padrao Kahoot)
1. Facilitador cria sala → status "waiting"
2. Jogadores entram → team aparece no facilitador via Realtime + polling
3. Facilitador inicia → todos recebem via Realtime subscription
4. Score sincroniza a cada 1s (upsert) + polling 1.5s (safety net)
5. Heartbeat: jogador verifica se team existe a cada 3s

### Inline Styles (temporario)
- Atualmente ~800 inline styles (`style={{...}}`)
- Fase 3 migrara para Tailwind v4
- Ate la: manter consistencia com o padrao existente

## Banco de Dados (Supabase)

### Tabelas
- `rooms`: id, code, status, round, allow_late_join, music_muted, full_cap_approved
- `teams`: id, room_id, name (2-30 chars), color (hex)
- `game_state`: id, team_id, room_id, round (1|2), sim_minute, score (0-5000), metrics (JSONB)
- `game_logs`: id, team_id, room_id, round, events, final_score, final_stats (append-only)

### RLS
- SELECT: aberto para todos
- INSERT: validado (nome, round, score range)
- UPDATE: validado (status enum, score range)
- DELETE: permitido em rooms/teams/game_state (facilitador reset), bloqueado em game_logs

### Realtime
- Publication: rooms, teams, game_state
- REPLICA IDENTITY FULL em todas

## Scripts

```bash
npm run dev       # Vite dev server (HMR, port 3000)
npm run build     # tsc --noEmit && vite build
npm run preview   # Servir dist/ local
npm run typecheck # tsc --noEmit
npm run test      # vitest run (Fase 4)
```

## Branches

| Branch | Proposito |
|--------|-----------|
| `main` | Producao (CDN React, online no Netlify) |
| `feat/vite-migration` | Migracao Vite + TS (Fase 1 completa, build OK) |

## Roadmap

| Fase | Status | Descricao |
|------|--------|-----------|
| 1. Vite + TS | COMPLETA | Build funcional, zero erros TS |
| 2. Zustand + Zod + Reconnection | Pendente | State management, validacao, resiliencia |
| 3. Tailwind v4 | Pendente | Substituir inline styles |
| 4. Testes + CI/CD | Pendente | Vitest + GitHub Actions |
| 5. Sentry + ESLint | Pendente | Monitoring + code quality |
