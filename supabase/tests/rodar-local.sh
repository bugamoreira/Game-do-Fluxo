#!/usr/bin/env bash
# Valida as migrações num Postgres temporário local (nada toca o Supabase).
# Uso: supabase/tests/rodar-local.sh [diretorio-temporario]
# Variáveis: PG_BIN (pasta dos binários do Postgres), PG_PORTA (padrão 54329).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="${1:-$(mktemp -d)}"
DATA="$TMP/pgdata"
SOCK="$TMP/sock"
PORTA="${PG_PORTA:-54329}"
mkdir -p "$SOCK"

RUNAS=()
if [ "$(id -u)" = "0" ]; then
  # o Postgres não roda como root
  chown -R postgres "$TMP"
  RUNAS=(runuser -u postgres --)
fi

"${RUNAS[@]}" "$BIN/initdb" -D "$DATA" -U postgres -A trust -E UTF8 --locale=C >/dev/null
"${RUNAS[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $PORTA -k $SOCK -c listen_addresses=''" \
  -l "$TMP/pg.log" -w start >/dev/null
trap '"${RUNAS[@]}" "$BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null' EXIT

PSQL=("${RUNAS[@]}" "$BIN/psql" -h "$SOCK" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$AQUI/local/00_stubs_supabase.sql"
for f in "$RAIZ"/migrations/*.sql; do
  echo "== migração $(basename "$f")"
  "${PSQL[@]}" -1 -f "$f"
done

for f in "$AQUI"/local/[1-9]*.sql; do
  echo "== teste $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "== rollback"
"${PSQL[@]}" -1 -f "$RAIZ/rollback/cbmede_rollback.sql"
"${PSQL[@]}" -tAc "select 'objetos restantes em public: ' || count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'"

echo "== reaplicando as migrações depois do rollback"
for f in "$RAIZ"/migrations/*.sql; do
  "${PSQL[@]}" -1 -f "$f"
done
echo "OK"
