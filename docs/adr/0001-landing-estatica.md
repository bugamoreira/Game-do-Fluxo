# ADR 0001 — Landing de orientações em HTML/TS puro, sem React nem Tailwind

- **Status:** aceito
- **Data:** 2026-11-01

## Contexto

Para o CBMEDE 2026 o aluno precisa de uma página de entrada, em `plantaocbmede.netlify.app`, que explique como acessar o jogo pelo computador do grupo e teste se a máquina está pronta (navegador, tela, conexão com o servidor, som).

O padrão do playbook (cap. 02) é React + Tailwind. O próprio cap. 02 abre exceção: "Página estática simples → HTML + um pouco de JS".

## Decisão

- `index.html` vira a landing, com a lógica em `src/landing/main.ts` (TypeScript estrito) e o estilo em `src/landing/landing.css`.
- O jogador muda para `jogar.html`.
- A landing não importa nada de `src/shared/`. Ao reaproveitar o cliente Supabase do jogo, o build arrastou junto o CSS global do jogo (Tailwind + tema escuro do FLAME), que sobrescrevia a página.
- O teste de conexão fica em `connectivityService.ts` e valida a resposta com Zod (cap. 07 e 09).
- O CSS próprio usa tokens no `:root` com a paleta CBMEDE. Quando o visual CBMEDE for aplicado ao jogo, os tokens migram para o `@theme` do Tailwind e a landing passa a consumi-los.

## Consequências

- Landing leve, 17 kB gzip de JS (12 kB são do Zod), e independente do jogo: se o jogo quebrar, as orientações continuam no ar.
- Os tokens de cor ficam duplicados até a migração do visual do jogo para a paleta CBMEDE (item do `docs/plano.md`).
- Quem tinha `plantaoflame.netlify.app/index.html` salvo cai na landing, e não direto no jogo. Não afeta o CBMEDE, que usa um endereço novo.
