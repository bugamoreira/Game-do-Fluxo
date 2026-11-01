#!/usr/bin/env bash
# Backend local de ensaio do Simulador do Plantão.
# Sobe um Postgres temporário, aplica os stubs do Supabase e as migrações,
# cria o facilitador de teste e inicia o servidor que imita o Supabase.
# Ctrl+C para tudo e apaga o banco temporário.
#
# Variáveis (todas opcionais):
#   PG_BIN              pasta dos binários do Postgres (initdb, pg_ctl, psql)
#   PG_PORTA            porta do Postgres (padrão 54329; só socket local)
#   PORTA               porta do servidor (padrão 54321)
#   HOST                endereço em que o servidor escuta (padrão 127.0.0.1)
#   FACILITADOR_EMAIL   padrão facilitador@teste.local
#   FACILITADOR_SENHA   padrão teste1234
#   BACKEND_LOCAL_DIR   pasta para guardar o banco entre execuções (padrão: temporária, apagada ao sair)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
SUPA="$RAIZ/supabase"

achar_bin() {
  if [ -n "${PG_BIN:-}" ]; then echo "$PG_BIN"; return; fi
  local d
  d="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$d" ]; then echo "$d"; return; fi
  for d in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin \
           /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin \
           /Applications/Postgres.app/Contents/Versions/latest/bin; do
    if [ -x "$d/initdb" ]; then echo "$d"; return; fi
  done
  if command -v pg_config >/dev/null 2>&1 && [ -x "$(pg_config --bindir)/initdb" ]; then
    pg_config --bindir; return
  fi
  if command -v initdb >/dev/null 2>&1; then dirname "$(command -v initdb)"; return; fi
  echo ""
}

BIN="$(achar_bin)"
if [ -z "$BIN" ] || [ ! -x "$BIN/initdb" ]; then
  echo "Postgres não encontrado. Instale o Postgres 16 (macOS: brew install postgresql@16)" >&2
  echo "ou indique a pasta dos binários em PG_BIN." >&2
  exit 1
fi

PG_PORTA="${PG_PORTA:-54329}"
export PORTA="${PORTA:-54321}"
# Só este computador por padrão (CORS aberto e senha de teste conhecida).
export HOST="${HOST:-127.0.0.1}"
export FACILITADOR_EMAIL="${FACILITADOR_EMAIL:-facilitador@teste.local}"
export FACILITADOR_SENHA="${FACILITADOR_SENHA:-teste1234}"

PERSISTENTE=0
if [ -n "${BACKEND_LOCAL_DIR:-}" ]; then
  TMP="$BACKEND_LOCAL_DIR"; mkdir -p "$TMP"; PERSISTENTE=1
else
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/simulador-backend.XXXXXX")"
fi
chmod 755 "$TMP"
DATA="$TMP/pgdata"
SOCK="$TMP/sock"
mkdir -p "$SOCK"

RUNAS=()
if [ "$(id -u)" = "0" ]; then
  # o Postgres não roda como root
  chown -R postgres "$TMP"
  RUNAS=(runuser -u postgres --)
fi

PG_INICIADO=0
SERVIDOR_PID=""
limpar() {
  set +e
  if [ -n "$SERVIDOR_PID" ] && kill -0 "$SERVIDOR_PID" 2>/dev/null; then
    kill -TERM "$SERVIDOR_PID" 2>/dev/null
    wait "$SERVIDOR_PID" 2>/dev/null
  fi
  if [ "$PG_INICIADO" = "1" ]; then
    "${RUNAS[@]}" "$BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1
  fi
  if [ "$PERSISTENTE" = "0" ]; then rm -rf "$TMP"; fi
  echo "Backend local encerrado."
}
trap limpar EXIT
trap 'exit 130' INT TERM

NOVO=0
if [ ! -f "$DATA/PG_VERSION" ]; then
  "${RUNAS[@]}" "$BIN/initdb" -D "$DATA" -U postgres -A trust -E UTF8 --locale=C >/dev/null
  NOVO=1
fi
"${RUNAS[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $PG_PORTA -k $SOCK -c listen_addresses=''" \
  -l "$TMP/pg.log" -w start >/dev/null
PG_INICIADO=1

PSQL=("${RUNAS[@]}" "$BIN/psql" -h "$SOCK" -p "$PG_PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

if [ "$NOVO" = "1" ]; then
  echo "== stubs do Supabase"
  "${PSQL[@]}" -f "$SUPA/tests/local/00_stubs_supabase.sql"
  for f in "$SUPA"/migrations/*.sql; do
    echo "== migração $(basename "$f")"
    "${PSQL[@]}" -1 -f "$f"
  done
  echo "== facilitador de teste ($FACILITADOR_EMAIL)"
  "${PSQL[@]}" -v email="$FACILITADOR_EMAIL" <<'SQL'
insert into auth.users (id, email) values (gen_random_uuid(), lower(:'email'));
insert into public.facilitadores (user_id, nome)
select id, 'Facilitador de Teste' from auth.users where email = lower(:'email');
SQL
else
  echo "== reaproveitando o banco em $DATA"
fi

export PGHOST="$SOCK" PGPORT="$PG_PORTA" PGUSER=postgres PGDATABASE=postgres
# segredo do JWT novo a cada execução: sessões antigas deixam de valer
export JWT_SEGREDO="${JWT_SEGREDO:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")}"

cat <<TXT

  Backend local:  http://127.0.0.1:$PORTA (escutando em $HOST)
  Facilitador:    $FACILITADOR_EMAIL / $FACILITADOR_SENHA
  Agora, em outro terminal:  npm run dev:local
  Ctrl+C aqui para parar.

TXT

node "$AQUI/servidor.mjs" &
SERVIDOR_PID=$!
wait "$SERVIDOR_PID"
