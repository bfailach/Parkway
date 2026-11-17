#!/bin/bash
# Réplica de lectura en espera (hot standby) por replicación en streaming.
# La primera vez copia el primario con pg_basebackup; -R deja configurada la
# conexión al primario (primary_conninfo) y el archivo standby.signal.
set -e
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Esperando al primario..."
  until pg_isready -h postgres-primario -U postgres -q; do sleep 2; done
  sleep 3
  mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA" && chmod 700 "$PGDATA"
  gosu postgres env PGPASSWORD="$REPLICACION_PASSWORD" \
    pg_basebackup -h postgres-primario -U replicador -D "$PGDATA" -X stream -S replica1 -R -c fast -P
fi
exec docker-entrypoint.sh postgres -c hot_standby=on
