# Backend local de ensaio

Permite rodar o Simulador do Fluxo inteiro num computador, **sem internet e sem tocar no Supabase real**. Um Postgres temporário recebe as mesmas migrações de `supabase/migrations/`, e um pequeno servidor Node imita a parte do Supabase que o app usa (RPCs em `/rest/v1/rpc/*` e o login do facilitador em `/auth/v1/*`). As permissões são as do banco: o servidor apenas assume o papel `anon` ou `authenticated` em cada pedido, exatamente como o Supabase faz.

Serve para o ensaio geral e para testes. **Não é para o evento**: no CBMEDE o app usa o Supabase de verdade.

## Pré-requisitos

- **Node 20** ou mais recente (`node -v`).
- **Postgres 16** instalado (só os programas; não é preciso deixá-lo rodando nem criar banco).
  - macOS com Homebrew: `brew install postgresql@16`
  - Ubuntu/Debian: `sudo apt install postgresql-16`
  - Se o script não encontrar o Postgres, indique a pasta dos programas: `PG_BIN=/caminho/para/bin npm run backend:local`.
- Dependências do projeto instaladas: `npm ci` (uma vez, na raiz do repositório).

## Como rodar

São dois terminais, ambos na raiz do repositório.

**Terminal 1 — banco e servidor:**

```bash
npm run backend:local
```

Aguarde a mensagem `Backend local no ar em http://127.0.0.1:54321 (só este computador)`. Esse terminal fica ocupado e mostra cada pedido recebido.

**Terminal 2 — o app:**

```bash
npm run dev:local
```

O Vite abre em `http://localhost:3000` e repassa `/rest` e `/auth` ao backend local.

## As três telas

| Tela | Endereço |
|---|---|
| Facilitador | http://localhost:3000/instrutor.html |
| Projetor | http://localhost:3000/projetor.html |
| Grupos (jogadores) | http://localhost:3000/jogar.html |

Para simular vários grupos no mesmo computador, abra cada grupo numa janela anônima ou num navegador diferente (cada grupo guarda o próprio token no navegador). Para que outros computadores da mesma rede entrem como grupos, rode `npm run dev:local -- --host` e use o endereço de rede que o Vite mostrar. O backend continua escutando só em `127.0.0.1` (o Vite repassa os pedidos a ele). **Ao usar `--host`, o painel do facilitador fica acessível na rede: troque antes a senha de teste** (`FACILITADOR_SENHA=... npm run backend:local`, com um banco novo). Só abra o próprio backend na rede (`HOST=0.0.0.0 npm run backend:local`) se for indispensável, e também com outra senha: ele responde a qualquer origem (CORS `*`).

## Credenciais de teste

- E-mail: `facilitador@teste.local`
- Senha: `teste1234`

Para trocar: `FACILITADOR_EMAIL=... FACILITADOR_SENHA=... npm run backend:local`. A troca vale para um banco novo (veja "Guardar os dados" abaixo).

## Conferir se está tudo certo

Com o backend no ar, num terceiro terminal:

```bash
npm run fumaca:local   # percorre uma turma inteira: login, duas rodadas, relatório
npm run prova:local    # prova de segurança (supabase/tests/prova-seguranca.mjs) contra o backend local
```

Cada linha sai como `PASSOU` ou `FALHOU`; ao final, ambos devem indicar `0 falha(s)`. O teste de fumaça abre a turma `CBMEDE` com substituição: se já houver uma, ela é arquivada.

## Como parar

No terminal 1, tecle **Ctrl+C**. O servidor e o Postgres são encerrados e o banco temporário é apagado. No terminal 2, **Ctrl+C** encerra o Vite.

## Guardar os dados entre execuções

Por padrão o banco é descartado ao parar. Para mantê-lo (por exemplo, para conferir o relatório de um ensaio no dia seguinte), indique uma pasta:

```bash
BACKEND_LOCAL_DIR=$HOME/simulador-ensaio npm run backend:local
```

Na próxima execução com a mesma pasta, o banco é reaproveitado (as migrações não são reaplicadas). Para recomeçar do zero, apague a pasta. A sessão do facilitador não sobrevive ao reinício: basta entrar de novo.

## Outras variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `PORTA` | `54321` | porta do servidor (se mudar, ajuste também o `dev:local`) |
| `PG_PORTA` | `54329` | porta interna do Postgres (só socket local, não abre rede) |
| `PG_BIN` | detectado | pasta dos programas do Postgres |
| `LOG_PEDIDOS` | ligado | `LOG_PEDIDOS=0` silencia o registro de pedidos |

## O que o servidor imita (e o que não)

- `POST /rest/v1/rpc/<função>`: parâmetros nomeados em JSON; respostas e erros no formato do PostgREST (`code` = SQLSTATE, `message`, `details`, `hint`). Sem login, a chamada roda como `anon`; com o token do login, como `authenticated`.
- `GET/POST/PATCH/DELETE /rest/v1/<tabela ou view>`: subconjunto simples (`select`, `limit`, `offset`, `order`, filtros `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `is`), suficiente para a prova de segurança.
- `/auth/v1/token` (senha e renovação), `/auth/v1/user`, `/auth/v1/logout`, `/auth/v1/settings`. O cadastro de contas é recusado.
- Não há Realtime, Storage nem painel. Funções e nomes de colunas são validados contra o catálogo do banco, e os valores seguem sempre como parâmetros, nunca colados no SQL.

Arquivos: `iniciar.sh` (banco e servidor), `servidor.mjs` (o servidor), `fumaca.mjs` (teste de fumaça), `prova-local.mjs` (prova de segurança local).
