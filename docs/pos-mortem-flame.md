# Pós-mortem — FLAME 2026 (29/04/2026)

> Auditoria feita em 01/11/2026 sobre o código do `main` (commit `97b4c90`), as publicações no Netlify e o banco Supabase (só leitura). Os sintomas foram relatados pelo Gustavo: os grupos não conseguiam acessar a sala, não "linkava", não gerava integração, a sala virtual não aparecia e a música não funcionava.

## Linha do tempo no dia do evento

| Horário (BRT) | O que aconteceu |
|---|---|
| 06h57 | Publicação manual em `plantaoflame2`: "Versão de emergência (pré-JP)" |
| 10h02 | Publicação manual em `plantaoflame`: "Proxy Netlify para Supabase (resolve bloqueio Chrome)". O commit equivalente é o `97b4c90` |

As duas foram enviadas direto do computador (`deploy_source: api`), sem passar pelo GitHub.

## Causas encontradas

1. **Tempo real quebrado pelo proxy (causa principal).** Em algumas redes, o Chrome dava "Failed to fetch" ao falar com `supabase.co`. A correção do dia passou as chamadas por redirects do Netlify (`netlify.toml`). Redirect do Netlify repassa requisições HTTP, mas não repassa o WebSocket do Realtime. Efeitos:
   - O jogador só descobre que a rodada começou por um evento Realtime (`src/player/App.tsx`, `joinRoom`). Não há consulta periódica de reserva para isso, então os grupos ficavam presos em "Aguardando".
   - O facilitador e o projetor consultam o banco a cada 1,5 s e continuavam vendo os times, daí a impressão de que "uns veem, outros não".
2. **"Criar sala" apagava os times.** No mesmo commit, `createRoom` do facilitador virou um reset que apaga `teams` e `game_state`. Grupos que entraram antes do facilitador eram expulsos ("Sala reiniciada pelo facilitador").
3. **Entrada tardia bloqueada por padrão** (`allow_late_join = false`).
4. **Música nunca liga no computador do jogador.** `SimsMusic.init()` só é chamado no projetor, e só depois do clique em "ativar áudio". No jogador, `update()` e `sfx()` saem sem fazer nada.
5. **Instabilidade expulsa o grupo.** Depois de 5 falhas seguidas no envio do placar (cerca de 5 s de rede ruim), o jogo mostra "Sessão expirada" e volta ao início.
6. **Voltar com o mesmo nome é recusado.** Um grupo que perdeu a sessão é barrado por "Já existe um time com esse nome".

## Riscos de segurança

- A credencial do facilitador está escrita em `src/shared/lib/constants.ts`: repositório público e visível no bundle. Precisa ser trocada.
- As políticas de acesso permitem que qualquer visitante apague times e placares e mude o status da sala.

## O que não era o problema

- **Volume:** 6 grupos (um computador cada) + facilitador + projetor são cerca de 8 clientes. É uma carga mínima.
- **Projeto Supabase:** estava ativo, com tabelas, políticas e publicação Realtime configuradas.
- **Build:** a checagem de tipos, os 25 testes e o build passam.

## Lições

- Não depender do Realtime para transições de estado: com 8 clientes, consultar o banco a cada 1–2 s pelo mesmo domínio é simples e resiste a redes que bloqueiam WebSocket.
- Nenhuma ação de "entrar" ou "criar" pode apagar dados de outros.
- Publicar sempre a partir do GitHub, para o que está no ar ser o que está no código.
- Ensaiar com 6 grupos simulados e a rede do evento antes do dia.
