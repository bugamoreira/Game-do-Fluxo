# Plano — Simulador do Plantão no CBMEDE 2026

Evento: 25 a 28 de novembro de 2026, Rio de Janeiro. Cenário: cerca de 6 grupos de 7 pessoas, um computador por grupo, Wi-Fi do evento e 5G de reserva. Endereço: `plantaocbmede.netlify.app`.

**Publicação única:** nada vai ao ar até tudo estar concluído e aprovado no ensaio local. Até lá o `plantaocbmede` fica vazio e o `plantaoflame` fica congelado.

Documentos de referência: `docs/fluxo.md` (regras do jogo), `docs/design.md` (marca, telas e conexões), `docs/pos-mortem-flame.md` (o que falhou), `docs/adr/` (decisões).

## Visão de cima

```
Fase A  Especificação ........................ (feita por mim, sequencial)
  └─ Portão 1: Gustavo aprova design, mapa de telas e regras
Fase B  Fundações ............................ (4 subagentes em paralelo)
  B1 Motor   B2 Sala e sincronização   B3 Design system   B4 Banco e segurança
  └─ Portão 2: sessão de pontuação com o Gustavo (usa o simulador do B1)
Fase C  Telas ................................ (3 subagentes em paralelo)
  C1 Jogo    C2 Facilitador    C3 Telão (+ música)
  └─ Portão 3: revisão visual local das telas (prints e navegação)
Fase D  Integração e ensaio .................. (subagentes de QA e revisão)
  D1 Ensaio com 6 grupos-robô   D2 Revisão de código independente   D3 Checklist de segurança
  └─ Portão 4: ensaio aprovado
Fase E  Publicação única ..................... (por mim, com autorização)
```

## Fase A — Especificação (em andamento)

- [x] `docs/pos-mortem-flame.md`, `docs/fluxo.md`, `docs/design.md`, ADR 0001
- [ ] `docs/schema.md`: tabelas, quem lê e quem escreve o quê, máquina de estados da sala
- [ ] `docs/contratos.md`: tipos e interfaces que os subagentes vão compartilhar (estado da sala, payload do placar, API dos services, props dos componentes base). É o que permite trabalho paralelo sem conflito.

## Fase B — Fundações (paralelo, cada agente na sua cópia isolada do repositório)

| Agente | Entrega | Arquivos que são dele |
|---|---|---|
| **B1 Motor** | Simulação extraída do `App.tsx` para função pura `step(estado, rng)` com sorteio controlado (*seed*), mais os testes. Habilita: reproduzir partidas, robôs para o ensaio e simulação de estratégias para a sessão de pontuação. Correção dos pontos de lógica que você aprovar. | `src/shared/lib/game-engine.ts`, `src/shared/lib/simulation/`, testes |
| **B2 Sala e sincronização** | Services de sala, time e placar; consulta a cada 1 s pelo mesmo domínio (sem Realtime); entrada em qualquer momento; reassumir o time pelo nome; "Reconectando…"; proxy local no Vite igual ao do Netlify. | `src/shared/services/`, `src/shared/hooks/`, `vite.config.ts`, `netlify.toml` |
| **B3 Design system** | Tokens no `@theme`, os componentes de `docs/design.md` §4 e uma página local de catálogo (`/ui.html`, fora do build de produção) para revisão. | `src/index.css`, `src/shared/components/ui/` |
| **B4 Banco e segurança** | Migrações versionadas em `supabase/migrations/`; sala de teste separada da sala do evento; facilitador com login real (Supabase Auth) no lugar da senha no código; políticas em que só o facilitador muda a sala ou apaga grupos; script que prova o que um visitante consegue ou não fazer. **Nada é aplicado no banco sem o seu ok.** | `supabase/`, `docs/schema.md` |

## Portão 2 — Revisão da pontuação

Com o motor do B1, simulo estratégias típicas ("segura no PS", "puxa fluxo", "usa fora do perfil", "ignora a RPA") e apresento quanto cada uma pontua na R1 e na R2. Você decide os pesos com critério pedagógico; as mudanças entram com teste.

## Fase C — Telas (paralelo, depois do B)

| Agente | Entrega |
|---|---|
| **C1 Jogo** | J1–J6 de `docs/design.md`, quebrando o `App.tsx` de 1190 linhas em componentes; só consome motor, services e componentes base. |
| **C2 Facilitador** | F0–F5: painel com barra lateral, ranking, debrief com dados da R1, controles, "Nova turma". |
| **C4 Relatório da turma** | Página de relatório por turma (link para compartilhar + versão para imprimir/PDF): regras do jogo, ranking, desempenho de cada grupo na R1 e na R2, evolução ao longo do plantão e comparação entre os grupos. |
| **C3 Telão e música** | P1–P4 em tema escuro, abertos a partir do facilitador (segunda janela ou modo telão); música ligando no primeiro clique em cada computador, mudo pelo facilitador e trilha definida para cada rodada. |

## Fase D — Integração e ensaio local

- **D1 Ensaio:** Playwright abre 6 navegadores de grupos-robô, o facilitador e o telão contra o build local, joga as duas rodadas inteiras e verifica: todos entram, a rodada começa em todos, o placar chega ao ranking, ninguém é expulso. Repete com rede degradada (lenta e caindo) e com entrada atrasada.
- **D2 Revisão:** um agente que não participou da construção revisa o código contra o playbook.
- **D3 Segurança:** checklist de `19-seguranca`, reproduzindo cada achado.
- **Seu teste:** você joga localmente (ou numa versão de pré-visualização privada) antes do Portão 4.

## Fase E — Publicação única

Merge no `main`, site `plantaocbmede` ligado ao GitHub, variáveis de ambiente no Netlify, sala do evento criada, teste de fumaça no endereço final. Só com a sua autorização.

## Como os subagentes trabalham

- Cada um recebe: o objetivo, os documentos de `docs/`, os contratos e a lista de arquivos que são dele. Não mexe em arquivo de outro.
- Cada um trabalha numa cópia isolada (worktree) e entrega com checagem de tipos, lint, testes e build verdes.
- Eu integro, rodo tudo junto e só então passo ao próximo portão.
- Regras do playbook valem para todos: TypeScript estrito, service layer, Zod nas bordas, acessibilidade AA, Conventional Commits, docs atualizadas no mesmo commit.

## Pendências de decisão (Gustavo)

1. ~~Logo CBMEDE/ABRAMEDE~~ autorizado; falta enviar os arquivos oficiais (SVG ou PNG): CBMEDE 2026, ABRAMEDE e ED Leaders em versão para fundo claro e escuro.
2. ~~Turmas~~ uma turma por evento (curso pré-congresso), comparação só dentro da turma. Regra geral para outros eventos: cada turma fica guardada com seus resultados e relatório.
3. ~~Música~~ trilha própria para cada rodada: Travado tenso e irregular, Lean fluido e eficiente (ver `docs/design.md` §7).
4. Validar `docs/fluxo.md` e os 6 pontos de lógica (podem ficar para o Portão 2).
