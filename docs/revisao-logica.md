# Revisão da lógica do jogo — pauta para o Portão 2

> Pente fino do código atual (`src/player/App.tsx`, `src/shared/lib/game-engine.ts`, `constants.ts`). Nada foi alterado: o motor está sendo extraído com comportamento idêntico (etapa B1), para servir de linha de base. As decisões abaixo são do Gustavo, com números das simulações de estratégias.

## 1. Chegada de pacientes

**Como está:** taxa por hora (2/3/5/3/2 por hora; R1 com +2/h das 11h às 14h). O intervalo é quase fixo (60/taxa ± 4 min), sem a aleatoriedade natural de chegadas. Destino sorteado: 50% alta do DE, 35% enfermaria, 15% UTI (taxa de internação de 50%). Gravidade sorteada pelo destino. São cerca de 40 pacientes por plantão.

**Pontos para decidir:**
- Usar chegadas com variabilidade realista (processo de Poisson). Picos e vales aleatórios ensinam mais sobre capacidade do que um ritmo regular.
- A internação de 50% é alta para a realidade (10–25%), mas comprime o problema num jogo de 12 minutos. Manter como licença didática ou reduzir?
- Na R2, o mesmo paciente precisa de muito menos tempo de decisão no DE (30–60 contra 60–120 min, se alta). Ver o item 8.

## 2. Triagem e DE

**Como está:** quem chega vai para o DE se houver maca; senão fica na triagem e depois no corredor. A ordem é só de chegada: a gravidade (Manchester) não muda prioridade nem risco. O tempo até a decisão anda mais devagar com o hospital cheio (×1,2 a ×2 na R1).

**Pontos para decidir:**
- A gravidade deveria importar: vermelho passa na frente e piora se esperar; verde tolera espera.
- Paciente esperando decisão, na triagem ou no corredor, hoje nunca piora. Só piora quem já está em boarding.
- A saída sem atendimento (LWBS) só acontece com quem tem destino de alta do DE. Coerente com a realidade (quem vai embora é o menos grave), mas a probabilidade é fixa.

## 3. Deterioração e óbito

**Como está:** só por tempo de boarding, igual para todos: 3h deteriora, 6h é óbito evitável. Fora do perfil (UTI → enfermaria): chance de 1 em 150 por minuto, o que dá deterioração em praticamente todos dentro de algumas horas.

**Pontos para decidir:**
- Risco proporcional à gravidade: vermelho em boarding piora antes (ex.: 1h30 e 3h), amarelo depois.
- Óbito com tempo fixo é previsível demais; uma chance crescente com o tempo é mais realista e menos "relógio".
- "Fora do perfil" hoje é quase sentença de deterioração. É a mensagem pedagógica desejada, ou deveria ser um risco real, porém calculável?

## 4. Altas da enfermaria e da UTI

**Como está:** as altas só nascem nos rounds (R1: 11h com 6–8 altas e 2–3h de preparo, 14h, 17h; R2: Bed Huddle às 8h com liberação imediata). O grupo só clica para efetivar. São cerca de 12 altas por dia contra cerca de 20 internações, então a ocupação sobe ao longo do dia. A UTI faz step-down às 11h e às 15h. O paciente social prende o leito por 3–5h (R1) ou 1h (R2).

**Pontos para decidir:**
- O grupo não tem nenhuma decisão sobre altas além de clicar. Uma ação "antecipar alta" ou "puxar alta" daria agência e ligação direta com a prática (alta antes do meio-dia).
- Uma alta bloqueada por cancelamento cirúrgico (efeito cascata) nunca é desbloqueada: o leito fica preso até o fim. Intencional?

## 5. Centro cirúrgico e RPA

**Como está:** 7 cirurgias eletivas fixas. Na R1 ficam concentradas de manhã, com atraso aleatório na sala 1; na R2 são redistribuídas. A RPA tem 3 vagas e só esvazia quando o grupo move o pós-operatório. Se a RPA está cheia quando a cirurgia termina, ela é cancelada. Há emergência cirúrgica aleatória vinda do DE. A reserva da sala 4 só existe no modo solo.

**Pontos para decidir:**
- Cancelar no fim da cirurgia é estranho clinicamente: o cancelamento acontece antes de começar, por falta de leito de destino. Mudar para "não começa se não houver leito/RPA previstos"?
- Ativar a decisão da sala de emergência no jogo em grupo, como escolha do grupo ou do facilitador no início.

## 6. Eventos

Parada cardíaca, tomógrafo, laboratório, surto (garantido às 12h na R1), social, observação prolongada e emergência cirúrgica. Todos com probabilidades fixas por minuto. Ver se a frequência média por partida está boa (o simulador vai medir).

## 7. Pontuação

Ver `docs/fluxo.md`. A alta dá +3 e cada hora de boarding custa −10; óbito −150; bônus de +150 sem óbito e +300 na R2 "limpa". Avaliar com as estratégias simuladas se o ranking premia quem gere fluxo de verdade.

## 8. Plantão Lean — o ponto mais importante

Hoje a R2 é mais fácil por regra, não só pelas decisões do grupo:

| Muda sozinho na R2 | Efeito |
|---|---|
| Tempo de decisão no DE muito menor | pacientes ficam prontos em cerca de metade do tempo |
| Sem o bônus de chegadas no pico | menos pacientes |
| Penalidade de lotação mais branda | o DE anda mesmo com o hospital cheio |
| Fluxista dá alta automática a cada 20 min | sem clique do grupo |
| Fast Track e fluxo puxado automáticos | aceleram sem decisão |
| Bed Huddle às 8h, preparo zero | leitos liberam cedo |
| Cirurgias redistribuídas e social de só 1h | menos cancelamento e bloqueio |
| Bônus de +300 | só existe na R2 |

**Consequência:** a melhora da R1 para a R2 aparece mesmo para um grupo que não fizer nada. A comparação "Travado × Lean" mede o cenário, não o aprendizado do grupo.

**Proposta para discutir:** manter o mesmo hospital e a mesma demanda nas duas rodadas, e transformar as ferramentas Lean em **decisões** do grupo, com custo e efeito: ativar o Fluxista, fazer o Bed Huddle, abrir o Fast Track, antecipar altas, pedir NIR, reservar sala. Assim o ranking da R2 mostra quem usou bem as ferramentas, e o debrief ganha força ("vocês ativaram o huddle às 8h e o boarding caiu X%").

## Como vamos decidir (Portão 2)

1. O simulador de estratégias (B1) roda o jogo atual: pontuação e métricas por estratégia, na R1 e na R2.
2. Discutimos item por item; você decide cada um.
3. As decisões entram no motor com testes, e o simulador roda de novo para mostrar o efeito de cada mudança antes de chegar às telas.
