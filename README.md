# Simulador do Plantao — ED Leaders x FLAME 2026

Jogo educacional multiplayer de gestao de fluxo hospitalar. Ensina Theory of Constraints e Lean aplicados a emergencia atraves de simulacao pratica.

**URL:** [plantaoflame.netlify.app](https://plantaoflame.netlify.app)

---

## Conceito

O jogador assume o papel de **coordenador de fluxo** de um hospital com 100 leitos (85 ENF + 15 UTI). O gargalo esta na **saida**, nao na entrada.

- **Rodada 1 (Plantao Travado):** Sem ferramentas Lean. O hospital congela.
- **Rodada 2 (Plantao Lean):** Ferramentas ativas (NIR, Pull System, Surgical Smoothing, Porta-Decisao). Mesma demanda, resultado oposto.

3 telas sincronizadas via Supabase Realtime:
- **Jogador** (`index.html`) — simulacao interativa
- **Facilitador** (`instrutor.html`) — dashboard de controle
- **Projetor** (`projetor.html`) — ranking ao vivo + musica adaptativa

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 via CDN + Babel Standalone (sem build step) |
| Backend | Supabase (PostgreSQL + Realtime + RLS) |
| Audio | Tone.js v14 (sintese em tempo real) |
| Deploy | Netlify (static, auto-deploy do GitHub) |

---

## Estrutura de Arquivos

```
public/
  index.html              # Tela do jogador (entry point)
  instrutor.html          # Tela do facilitador
  projetor.html           # Tela de projecao
  img/
    edleaders.png         # Logo ED Leaders
    flame-banner.jpg      # Banner FLAME
  js/
    app.js                # UI principal + multiplayer (~1.660 linhas)
    game-engine.js        # Motor de simulacao — funcoes puras (~162 linhas)
    music.js              # Musica adaptativa Tone.js (~185 linhas)
    supabase-config.js    # Cliente Supabase (URL + anon key)
    error-boundary.js     # Error Boundary React compartilhado
netlify.toml              # Config Netlify (publish = "public")
```

---

## Banco de Dados (Supabase)

**Projeto:** `okmafynejwrwnmvyruwy`
**Regiao:** default

### Schema

```
rooms
  id          UUID PK (gen_random_uuid)
  code        TEXT UNIQUE NOT NULL        # Codigo da sala (ex: "FLAME")
  status      TEXT DEFAULT 'waiting'      # waiting|round1|debrief|round2|finished
  round       INT DEFAULT 0
  allow_late_join  BOOL DEFAULT false
  music_muted      BOOL DEFAULT false
  full_cap_approved BOOL DEFAULT false
  created_at  TIMESTAMPTZ DEFAULT now()

teams
  id          UUID PK (gen_random_uuid)
  room_id     UUID FK -> rooms.id
  name        TEXT NOT NULL               # CHECK: 2-30 chars
  color       TEXT                        # Hex color (#FF3B3B)
  created_at  TIMESTAMPTZ DEFAULT now()

game_state
  id          UUID PK (gen_random_uuid)
  team_id     UUID FK -> teams.id
  room_id     UUID FK -> rooms.id
  round       INT NOT NULL                # CHECK: 1 ou 2
  sim_minute  INT DEFAULT 420             # Minuto simulado (420 = 07:00)
  score       INT DEFAULT 1000            # CHECK: 0-5000
  metrics     JSONB DEFAULT '{}'          # deOcc, enfOcc, utiOcc, boarding, deaths...
  updated_at  TIMESTAMPTZ DEFAULT now()
  UNIQUE(team_id, round)                  # Upsert conflict target

game_logs (append-only)
  id          UUID PK (gen_random_uuid)
  team_id     UUID FK -> teams.id
  room_id     UUID FK -> rooms.id
  round       INT NOT NULL                # CHECK: 1 ou 2
  events      JSONB DEFAULT '[]'
  final_score INT
  final_stats JSONB DEFAULT '{}'
  created_at  TIMESTAMPTZ DEFAULT now()
```

### RLS (Row Level Security)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| rooms | Todos | Validado (code 2-10 chars) | Validado (status enum) | Sim |
| teams | Todos | Validado (nome 2-30 chars, cor hex) | Sim | Sim |
| game_state | Todos | Validado (round 1-2, score 0-5000) | Validado (score 0-5000) | Sim |
| game_logs | Todos | Validado (round 1-2) | Bloqueado | Bloqueado |

### Realtime

Tabelas em `supabase_realtime` publication: `rooms`, `teams`, `game_state`
REPLICA IDENTITY FULL em todas as tabelas.

---

## Mecanicas do Jogo

### Setores
- **DE** (Dept. Emergencia) — 15 macas, triagem por cor (Manchester)
- **ENF** (Enfermaria) — 85 leitos
- **UTI** — 15 leitos
- **RPA** (Recuperacao Pos-Anestesica) — 3 leitos
- **CC** (Centro Cirurgico) — 4 salas, 7 cirurgias/dia

### Scoring (base 1500, floor 50)
- Alta hospitalar (ENF->Alta): +3 pts
- Boarding >3h (deterioracao): -40 pts
- Boarding >6h (obito): -150 pts
- Cirurgia cancelada: -80 pts
- R2 perfeito (0 obitos + 0 cirurgias canceladas): +300 bonus

### Ferramentas Lean (R2)
- **NIR** (Nucleo Interno de Regulacao) — transferencia externa
- **Pull System** — alta precoce ENF
- **Surgical Smoothing** — redistribuicao cirurgica
- **Porta-Decisao** — 40% mais rapido
- **Full Capacity** — corredor emergencial (requer autorizacao facilitador)

---

## Fluxo Multiplayer (Padrao Kahoot)

1. Facilitador abre `instrutor.html` -> cria sala FLAME
2. Jogadores abrem `index.html` -> entram com nome do time
3. Projetor abre `projetor.html` -> mostra ranking ao vivo
4. Facilitador inicia R1 -> todos comecam simultaneamente
5. Game state sincroniza a cada 1s (upsert) + polling 1.5s (safety net)
6. Facilitador encerra R1 -> debrief -> inicia R2
7. Podio final com ranking comparativo R1 vs R2

---

## Desenvolvimento

**Ferramenta:** Claude Code (Anthropic) — Claude Opus 4.6
**Responsavel:** Gustavo Fernandes Moreira — ED Leaders

### Setup local
```bash
git clone https://github.com/bugamoreira/Game-do-Fluxo.git
cd Game-do-Fluxo
# Abrir public/index.html no navegador (ou usar live server)
# Nao precisa de npm install — tudo via CDN
```

### Deploy
```bash
git push origin main  # Netlify auto-deploy
```

### Supabase
- Dashboard: https://supabase.com/dashboard/project/okmafynejwrwnmvyruwy
- Realtime habilitado em rooms, teams, game_state
- RLS granular com constraints de validacao

---

## Branding

- **ED Leaders** — marca principal (logo circular)
- **FLAME 2026** — 2o Congresso Latino-americano de Medicina de Emergencia
- **ABRAMEDE** — apoio institucional
