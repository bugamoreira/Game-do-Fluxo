# Plano — Simulador do Plantão no CBMEDE 2026

Evento: 25 a 28 de novembro de 2026, Rio de Janeiro. Cenário: cerca de 6 grupos de 7 pessoas, um computador por grupo, Wi-Fi do evento e 5G de reserva. Endereço: `plantaocbmede.netlify.app`.

Regra de trabalho (CLAUDE.md): uma etapa por vez, testada antes da próxima.

| # | Etapa | Status |
|---|---|---|
| 0 | Auditoria do FLAME (`docs/pos-mortem-flame.md`) e site `plantaocbmede` criado no Netlify | feito |
| 1 | Landing de orientações + teste do computador (`index.html`, ADR 0001) | feito, aguardando publicação |
| 2 | Entrada robusta: entrar antes ou depois do facilitador sem apagar ninguém; entrada tardia; retomar com o mesmo nome | a fazer |
| 3 | Sincronização sem Realtime: consulta periódica pelo mesmo domínio, banner "Reconectando…", sem expulsar por instabilidade | a fazer |
| 4 | Música e efeitos no computador do grupo (liga no primeiro clique); mudo controlado pelo facilitador | a fazer |
| 5 | **Revisão das regras de pontuação** (ver abaixo) | a fazer |
| 6 | Segurança: credencial fora do código; ações do facilitador protegidas no servidor; políticas restritas | a fazer |
| 7 | Sala `CBMEDE` no lugar de `FLAME` e visual CBMEDE no jogo, no facilitador e no projetor | a fazer |
| 8 | Publicação ligada ao GitHub + ensaio geral com 6 grupos simulados | a fazer |

## Quando revisar a pontuação (etapa 5)

Depois das etapas 2 a 4 e antes do visual (etapa 7) e do ensaio (etapa 8):

- **Depois da infraestrutura:** a pontuação só pode ser avaliada com o jogo sincronizando direito. No FLAME, placar travado ou time expulso distorcia o ranking, e qualquer ajuste feito antes disso seria testado em cima de dados ruins.
- **Antes do visual:** o projetor e a tela de fim de rodada mostram as métricas da pontuação. Se as regras mudarem, essas telas mudam junto, e é melhor redesenhá-las uma vez só.
- **Antes do ensaio:** o ensaio com 6 grupos simulados é a validação final das regras novas.

Formato da sessão: apresentar a fórmula atual (`calcScore` em `src/shared/lib/game-engine.ts`) em linguagem clínica, com simulações de estratégias típicas (por exemplo, "segura no PS" versus "puxa fluxo"), para o Gustavo decidir os pesos com critério pedagógico. Cada mudança entra com teste no Vitest.
