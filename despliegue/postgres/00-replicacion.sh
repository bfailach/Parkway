#!/bin/bash
# Primario: crea el usuario de replicación y le permite conectarse.
# Se ejecuta una sola vez, cuando el contenedor inicializa la base.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
CREATE ROLE replicador WITH REPLICATION LOGIN PASSWORD '${REPLICACION_PASSWORD}';
SELECT pg_create_physical_replication_slot('replica1');
CREATE DATABASE parkway_eventos;
SQL
echo "host replication replicador all scram-sha-256" >> "$PGDATA/pg_hba.conf"
