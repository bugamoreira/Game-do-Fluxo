# Design — Simulador do Plantão · CBMEDE 2026

> Regras de marca, sistema visual e mapa de telas. Referências: padrão visual do site cbmede2026.com.br e 4 referências de dashboard trazidas pelo Gustavo (timeline de medicação, Overview cripto, Pay, Wallet).

## 1. Princípios

1. **Clareza clínica antes de estética.** O jogo é uma sala de situação: o grupo precisa ler o hospital em 2 segundos.
2. **Uma cor, um significado.** Cor nunca é decoração quando também carrega informação clínica.
3. **Cada tela tem uma ação principal.** Ela é o único botão verde da tela.
4. **Mesma linguagem nas quatro superfícies** (orientações, jogo, facilitador, telão), com densidade diferente em cada uma.

## 2. Regras de marca

| Regra | Detalhe |
|---|---|
| Moldura CBMEDE | Azul-marinho `#1B2A6B` (valor oficial do site) (estrutura, títulos, barra lateral), amarelo `#F5C518` (destaque, foco, "você está aqui") e verde `#3DB54A` (ação principal). |
| Manchester é sagrado | Vermelho, laranja, amarelo e verde de gravidade (`--sev-*`) só aparecem em paciente e risco. Nenhum botão ou enfeite usa essas cores. O amarelo da marca e o amarelo Manchester ficam visualmente distintos: o da marca vai em fundo e preenchimento, o Manchester vai em ponto ou borda do paciente. |
| Setores em tons pastel | Cada setor tem um tom de fundo fixo, como os cartões de ativos das referências: DE lavanda, ENF menta, UTI pêssego, RPA/CC creme, corredor e triagem cinza. O tom identifica o setor; a lotação aparece por barra e número, não por troca de cor do cartão. |
| Cartão escuro = momento | O cartão azul-marinho profundo (como o "Earn free crypto" e o "Sell Order" das referências) é reservado para o que exige atenção agora: evento ativo no jogo, próxima ação do facilitador, chamada no telão. No máximo um por tela. |
| Times | Cada grupo tem uma cor de identificação (8 cores fixas, nenhuma igual às de Manchester) usada em avatar, linha do ranking e gráficos. |
| Assinaturas | "Simulador do Plantão" é a marca do jogo. CBMEDE 2026 e ABRAMEDE autorizados (o congresso é da casa), com logos oficiais em todas as superfícies; ED Leaders como realização. Arquivos oficiais (SVG ou PNG) a receber. |
| Norma culta | Todo texto do jogo, do facilitador, do telão, do relatório e das mensagens segue a norma-padrão do português (acentuação, concordância, crase, pontuação). Revisão de texto faz parte do ensaio. |
| Tom de voz | Português claro, linguagem de plantão ("boarding", "alta", "RPA lotada"), frases curtas, verbo no imperativo nos botões ("Iniciar rodada", "Autorizar"). |

## 3. Sistema visual (tokens)

Os tokens vão para o `@theme` do Tailwind em `src/index.css` e são a única fonte. A landing passa a consumi-los (ADR 0001).

- **Tipografia (a mesma do site oficial):** Sora para títulos (700) e texto (300–500); Space Mono para rótulos em caixa alta ("— FALE CONOSCO"), relógio do plantão e números do placar. Escala: 12 / 14 / 16 / 20 / 28 / 40 / 64 (telão até 120).
- **Degradê oficial de destaque (do site):** `linear-gradient(135deg, #0e1840 0%, #1B2A6B 55%, #1f3380 100%)`. Usar em hero, telão e cartão escuro; `#0e1840` é o azul-marinho profundo.
- **Superfícies:** fundo de app `#F4F5FA`, cartão branco, borda `#E3E5F0`, sombra suave (`0 4px 18px rgba(31,42,107,.06)`).
- **Raios:** cartão 20, cartão grande 28, pílula 999, chip 10.
- **Espaçamento:** base 4 (8, 12, 16, 24, 32, 48).
- **Tons pastel de setor:** DE `#ECEBFB`, ENF `#E3F5EA`, UTI `#FDEBE3`, RPA/CC `#FBF3D9`, triagem e corredor `#EEF0F4`.
- **Gravidade (Manchester):** `--sev-red #E53935`, `--sev-orange #F57C00`, `--sev-yellow #FBC02D`, `--sev-green #43A047`.
- **Tema:** claro em orientações, jogo e facilitador; escuro azul-marinho no telão (projeção em auditório).
- **Acessibilidade (cap. 14):** contraste AA, foco visível em amarelo, alvos de pelo menos 40 px, nada comunicado só por cor (gravidade também por letra ou ícone).

## 3b. Ativos de marca e imagem

- `public/img/brand/abramede.png`: logo ABRAMEDE (fundo azul-marinho).
- `public/img/brand/edleaders-escuro.png`: ED Leaders, recortado da arte recebida. A arte tem a marca-d'água de gerador de imagem no canto (removida no recorte); o ideal é receber o original em SVG.
- `public/img/rio/`: fotos do Rio (vista aérea, Cristo na névoa, cachoeira, panorama do Pão de Açúcar, bondinho, Cristo aéreo, Cristo nas montanhas) e o Windsor Barra Hotel, local do evento. As do site foram recortadas de capturas de tela: boas para fundo com véu, não para tela cheia nítida no telão. Uso: fundo da landing, da sala de espera e do pódio, sempre com véu azul-marinho por cima, como no site.
- Pendente: logo próprio do CBMEDE 2026, se existir (o site usa só o da ABRAMEDE) e as imagens originais do site, que dependem de liberar `cbmede2026.com.br`, `images.unsplash.com` e `bucket.livenotes.com.br` na rede desta sessão.

## 4. Componentes base (`src/shared/components/ui/`)

Button (verde, azul-marinho, amarelo, contorno, fantasma) · Card · SectorTile (tom pastel + título + barra de lotação + conteúdo) · PatientChip (ponto Manchester, nome, tempo, ícone de estado) · StatTile (número grande + rótulo + variação) · DarkCallout (cartão de momento) · Timeline (horário à esquerda e cartões, como na referência de medicação, usada para os eventos do plantão) · RankingTable · TeamAvatar · ClockBar (relógio 07:00→19:00 com progresso) · Modal · Toast · ConnectionBanner ("Reconectando…") · Sidebar (facilitador).

## 5. Mapa de telas e como se conectam

A sala tem um único estado no banco: `waiting → round1 → debrief → round2 → finished`. **Todas as telas derivam desse estado**, consultado a cada 1 s. Nenhuma tela "manda" a outra mudar; o facilitador muda o estado e as demais acompanham.

```
                        ┌──────────── Orientações (/) ────────────┐
                        │ passo a passo · teste do computador     │
                        └───────┬───────────────────────┬─────────┘
                                │ Entrar no jogo        │ Acesso do facilitador
                                ▼                       ▼
 JOGO (/jogar.html)                         FACILITADOR (/instrutor.html)        TELÃO (/projetor.html)
 ──────────────────                         ─────────────────────────────        ──────────────────────
 J1 Nome do grupo                           F0 Login
 J2 Sala de espera     ◄── waiting ──►      F1 Sala: grupos conectados,          P1 Endereço grande +
    (grupos já dentro)                         saúde da conexão, "Iniciar R1"       grupos que entraram
 J3 Plantão Travado    ◄── round1 ───►      F2 Ao vivo: ranking, métricas,       P2 Relógio, ranking,
                                               pausar/encerrar, música              eventos ao vivo
 J4 Fim da rodada 1    ◄── debrief ──►      F3 Debrief: dados da R1 por grupo    P3 Gráficos do debrief
    (seu resumo)                               para discussão, "Iniciar R2"
 J5 Plantão Lean       ◄── round2 ───►      F4 Ao vivo R2 + "Autorizar Full      P2 (modo Lean)
                                               Capacity"
 J6 Resultado final    ◄── finished ─►      F5 Resultado: comparativo R1×R2,     P4 Pódio
    (R1×R2 e posição)                          "Nova turma"
```

Regras de acesso à sala:
- **Código de acesso de 4 dígitos** (gerado ao abrir a turma): a J1 pede o nome do grupo e o código. O painel do facilitador mostra o código grande na Sala (F1) e no Ao vivo; o telão aberto pela janela do facilitador mostra o código grande na P1 e discreto durante as rodadas; sem a sessão do facilitador, o telão diz “Peça o código ao facilitador”. Reconexão no mesmo computador não pede o código; reconexão liberada pelo facilitador pede (só quem está na sala vê o código).
- **A sala abre quando o facilitador abre a turma (F1).** Grupos podem entrar desde então, em qualquer ordem, sem precisar entrar juntos.
- **O facilitador vê quem já entrou** (nome, cor, conexão ativa) e o botão "Iniciar Plantão Travado" mostra quantos grupos estão prontos ("6 grupos prontos"). Ele inicia quando todos estiverem lá.
- **Depois do início, a entrada de grupos novos fecha** (todos jogam o plantão inteiro). O facilitador pode abrir uma exceção ("Liberar entrada") para um grupo que se atrasou.
- **Reconexão nunca é bloqueada:** um grupo que já estava na sala volta para o mesmo time, em qualquer momento.
- **Nome repetido** só é recusado se o outro time estiver ativo; senão, a pessoa reassume o time.

Regras de transição:
- Perdeu a conexão: a simulação continua no computador do grupo e aparece "Reconectando…". Ao voltar, o placar sincroniza.
- **Reconexão só com o estado completo.** A simulação roda no computador do grupo; o banco hoje recebe só o placar resumido. Reassumir um time sem o estado completo (pacientes, eventos, relógio) dessincroniza o jogo. Regras:
  1. O computador do grupo salva o estado completo localmente e envia uma cópia ao banco a cada poucos segundos.
  2. Ao reconectar, o jogo restaura a cópia mais recente da rodada (local ou do banco, a de maior versão). Se o banco responde que **não há jogo salvo desta rodada** (o navegador do grupo estava fechado quando ela começou), o jogo começa do zero e avança até o horário da sala. Só quando o banco tem um jogo salvo que não foi possível obter (sem rede) ou abrir, o jogo não inventa estado: mostra "Tentar de novo", que pergunta ao banco outra vez.
  - A sessão local guarda a turma: sessão antiga de outra turma com o mesmo código não entra sozinha (vai para a J1). Na J1, digitar o mesmo nome da sessão deste computador reaproveita o token (dispensa o código de acesso e a liberação). Token que deixa de valer mostra uma mensagem neutra e volta à J1, exceto na tela final, que continua com o resultado.
  3. O relógio da rodada é o da sala (horário de início gravado pelo facilitador). Se o grupo ficou fora 2 minutos, o jogo avança esses 2 minutos com o motor, sem decisões do grupo, e todos seguem no mesmo horário de plantão. Isso depende do motor determinístico da etapa B1.
- **Um grupo, um motor:** se o mesmo grupo for aberto em duas abas do mesmo navegador, a segunda mostra “Este grupo já está aberto em outra aba” com o botão “Assumir aqui” (a outra aba para de rodar o jogo).
- O modo **Treinar sozinho** continua existindo (100% local, sem servidor) e fica nas orientações como plano B e para treino.
- "Nova turma" (F5) é a única ação que limpa grupos, e pede confirmação.
- O modo solo ("Treinar sozinho") fica acessível pelas orientações, totalmente local, como plano B.

## 6. Como cada superfície aparece (aplicação das referências)

**Jogo — computador do grupo (densidade alta, tema claro).** Topo: nome e cor do grupo, ClockBar do plantão, pontuação em pílula, estado da conexão. Centro: grade de SectorTiles (DE maior à esquerda; ENF, UTI, RPA/CC à direita), com os pacientes como PatientChips. Clicar no paciente destaca os destinos possíveis; clicar no destino move. Coluna direita: Timeline de eventos do plantão (referência de medicação) com o DarkCallout do evento ativo no topo (ex.: "Surto: 3 pacientes chegando"). Rodada 2: barra de ferramentas Lean (NIR, Full Capacity) com contadores de uso.

**Facilitador — painel (referências Overview, Pay e Wallet).** Barra lateral azul-marinho com as fases (Sala, Ao vivo, Debrief, Resultado). Topo: turma e relógio. Linha de StatTiles por grupo (cor do time, pontuação, mini-tendência). Corpo: RankingTable com as métricas que importam para a discussão (boarding, deteriorações, óbitos, cancelamentos, altas). Direita: DarkCallout com a próxima ação da aula ("Iniciar Plantão Lean", "Autorizar Full Capacity"), conexão dos grupos (o mesmo indicador da Sala: "Conectado" ou "Sem sinal há N s", com o resumo "4 de 6 conectados") e controles (pausar, música).

**Telão — projeção (tema escuro, densidade baixa).** Faz parte da tela do facilitador: o botão "Abrir telão" abre a visão de projeção numa segunda janela, para arrastar para o projetor (tela estendida), e também há o modo telão na própria janela, para quem usa uma tela só. `/projetor.html` continua existindo como endereço dessa visão. Letras enormes, legível do fundo do auditório. Relógio do plantão, ranking em barras com as cores dos times, faixa de eventos marcantes e pódio final animado.

**Orientações.** Já feita no padrão CBMEDE; migra para os tokens comuns.

## 7. Música

Cada rodada tem identidade sonora própria, reforçando a virada pedagógica:

- **Plantão Travado:** tensão que cresce. Ritmo irregular, harmonia menor e dissonante, e mais camadas e andamento conforme o boarding sobe. Óbito leva ao modo crise. Alertas secos.
- **Plantão Lean:** fluxo. Pulso constante e estável (a "esteira" bem regulada), tom maior e timbres mais claros. Quando o fluxo melhora (altas, Fluxista), a música ganha camadas em vez de acelerar. Eventos positivos têm som próprio (alta, Fluxista, NIR). Problemas soam, mas sem o modo crise.
- Toca no computador de cada grupo (liga no primeiro clique) e no telão; o facilitador controla o mudo de todos.
- **A música nunca derruba o jogo.** O sequenciador é próprio (não usa o Transport do Tone.js, que congelava a página com a CPU apertada no ensaio): agenda no máximo alguns passos à frente, descarta passos atrasados mais de 0,2 s, nunca agenda no passado e limita a oito vozes por passo. Um disjuntor silencia e para o sequenciador quando a aba fica oculta ou depois de três engasgos (atraso acima de 1 s) ou cinco erros em 30 s; volta limpo, sem tocar o que ficou para trás, ao reaparecer a aba ou 10 s depois. Exceções do áudio são engolidas e registradas uma única vez no console.

## 8. Relatório da turma

Gerado ao fim da sessão, guardado no banco e compartilhável por link (só leitura) e em versão para imprimir ou salvar em PDF:

1. Capa: evento, data, turma, facilitador, logos.
2. Regras do jogo em linguagem simples (resumo de `docs/fluxo.md`).
3. Ranking final e pódio.
4. Por grupo: pontuação e métricas da R1 e da R2 (boarding, deteriorações, óbitos, cancelamentos, LWBS, altas) e a variação entre as rodadas.
5. Evolução ao longo do plantão: curvas de ocupação do DE e boarding por hora simulada, R1 × R2.
6. Mensagens-chave para o debrief (o que mudou do Travado para o Lean).

Dados guardados: só nomes de grupo e métricas do jogo, sem dado pessoal dos participantes.

## 9. Mensagem do Lean: menos sobrecarga no gestor

O debrief e o relatório mostram, além do resultado clínico, a carga de quem coordena:
- decisões por hora tomadas pelo grupo (R1 × R2) e quanto delas foram reativas (apagar incêndio) ou produtivas (puxar fluxo);
- alertas e crises por hora (deterioração, cancelamento, DE lotado, corredor);
- trabalho feito pelas ferramentas automáticas no Lean (altas do Fluxista, leitos liberados pelo Discharge Lounge, cirurgias protegidas).

Mensagem: no Lean, o sistema faz o trabalho repetitivo, o gestor decide menos e melhor, e a operação funciona.
