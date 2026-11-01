# Fluxo e regras do jogo — Simulador do Plantão

> Entendimento do código em 01/11/2026 (`src/shared/lib/game-engine.ts`, `constants.ts` e o tick em `src/player/App.tsx`). Validar com o Gustavo antes de mudar qualquer regra.

## Dinâmica da aula

1. Facilitador entra (`instrutor.html`) e prepara a sala.
2. Cada grupo entra com o nome do time num computador (`jogar.html`).
3. **Rodada 1 — Plantão Travado** (hospital como ele é). O facilitador inicia e encerra.
4. **Debrief** conduzido pelo facilitador, com o ranking da R1.
5. **Rodada 2 — Plantão Lean** (mesmo hospital, com ferramentas lean). O facilitador libera o Full Capacity quando quiser.
6. Resultado final: comparativo R1 × R2 por time, no facilitador e no projetor.

Cada rodada simula das 7h às 19h, com 1 segundo real = 1 minuto simulado, ou seja, **12 minutos reais por rodada**.

## O hospital

| Setor | Capacidade | Início da rodada |
|---|---|---|
| Departamento de Emergência (DE) | 15 macas | 8 (53%), com 3 já em boarding |
| Enfermaria (ENF) | 85 leitos | 71 (84%) |
| UTI | 15 leitos | 13 (87%) |
| RPA (recuperação pós-anestésica) | 3 | 0 |
| Triagem e corredor | sem limite | 0 |

Ocupação hospitalar = (ENF + UTI) / 100 leitos, começando em 84%.

## O que o jogo faz sozinho a cada minuto

- **Chegadas:** 2/h até 9h, 3/h até 11h, 5/h das 11h às 14h, 3/h até 17h, depois 2/h. Na R1, o pico ganha +2/h. Destinos: 50% alta do DE, 35% ENF, 15% UTI.
- **Triagem → DE:** automático enquanto houver maca. DE cheio com mais de 2 na triagem → pacientes vão ao corredor. Corredor acima de 2 (R1) ou 3 (R2) → paciente de baixa complexidade sai sem atendimento (LWBS).
- **Tempo de decisão no DE:** cada paciente precisa de um tempo até ficar "pronto". Esse tempo anda mais devagar quando o hospital está cheio: na R1, ×1,2 acima de 75% de ocupação, ×1,5 acima de 85% e ×2 acima de 92%; na R2 a penalidade é menor.
- **Boarding:** paciente pronto para ENF ou UTI que continua no DE. Com 3h, deteriora; com 6h, óbito evitável.
- **Altas da enfermaria:** a R1 tem round médico às 11h (6 a 8 altas, com 2 a 3h de preparo), às 14h e às 17h. Na R2, o Bed Huddle às 8h e o Discharge Lounge liberam o leito na hora. A UTI dá step-down para a ENF às 11h e às 15h.
- **Centro cirúrgico:** 7 cirurgias. Na R1 concentradas de manhã, com atraso na sala 1; na R2 redistribuídas (surgical smoothing). Cirurgia que termina com a RPA lotada é cancelada e pode bloquear uma alta (efeito cascata).
- **Eventos aleatórios** (mais frequentes ou mais graves na R1): parada cardíaca (prende 1 maca por 1h), tomógrafo quebrado (+120 min), atraso de laboratório, surto de 3 pacientes (garantido às 12h na R1), paciente social que prende leito, observação prolongada, emergência cirúrgica (óbito se a RPA estiver cheia sem sala reservada) e deterioração de paciente fora do perfil.
- **Só na R2:** Fluxista (alta automática do DE a cada 20 min), Fast Track (verdes mais rápidos), fluxo puxado (DE acima de 80% acelera as decisões).

## O que o grupo decide (clicar no paciente → clicar no destino)

- Liberar alta do DE, internar na ENF ou na UTI.
- Mandar paciente de UTI para a ENF ("fora do perfil": libera o DE, mas arrisca deterioração e penaliza).
- Dar alta da ENF ou da UTI quando estiver pronta.
- Tirar o pós-operatório da RPA (para não cancelar a próxima cirurgia).
- **R2:** NIR (transferir para outra unidade; 3 usos, 1h de intervalo entre eles) e Full Capacity (2 verdes ao corredor, só com autorização do facilitador).

## Pontuação atual (`calcScore`)

Começa em 1500 e o mínimo é 50.

| Item | Pontos |
|---|---|
| Hora de boarding | −10 |
| Deterioração | −40 |
| Óbito evitável | −150 |
| Cirurgia cancelada | −80 |
| LWBS | −40 |
| Fora do perfil | −25 |
| Bloqueio social | −15 |
| Alta hospitalar (ENF) | +3 |
| Zero óbitos | +150 |
| R2 sem óbito, sem deterioração e sem cancelamento | +300 |

## Pontos a esclarecer ou corrigir (lógica)

1. **Sala 4 reservada para emergências** só existe no modo solo. No multiplayer a rodada sempre começa sem reserva, e nenhum controle do facilitador decide isso.
2. **Full Capacity** manda o paciente para o mesmo "corredor" de superlotação do DE. Ele passa a contar para o limite que dispara LWBS e não tem saída definida.
3. **Emergência cirúrgica com sala reservada e RPA cheia:** o paciente fica marcado como bloqueado no DE sem regra de saída clara.
4. **Bloqueio social** é penalizado (−15) mesmo sendo um evento aleatório, fora do controle do grupo.
5. **Alta do DE** não pontua; só a alta da ENF vale +3. Confirmar se é intencional.
6. **O log enviado ao banco no fim da rodada** sai incompleto: usa uma cópia antiga da lista de eventos.
