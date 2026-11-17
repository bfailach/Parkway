#!/bin/bash
# Primario: carga la estructura, los datos y la migración distribuida en orden.
set -e
for f in schema seed demo migracion_distribuida; do
  echo "Cargando $f.sql"
  psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "/parkway-sql/$f.sql" > /dev/null
done
