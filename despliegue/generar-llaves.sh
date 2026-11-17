#!/bin/sh
# Genera la llave privada ES256 (ECDSA P-256) con la que el backend firma
# los tokens. Se monta como Docker secret; nunca se sube al repositorio.
set -e
cd "$(dirname "$0")"
mkdir -p secretos
if [ -f secretos/jwt_es256.pem ]; then
  echo "La llave ya existe: secretos/jwt_es256.pem"
else
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out secretos/jwt_es256.pem
  chmod 644 secretos/jwt_es256.pem
  echo "Llave creada: despliegue/secretos/jwt_es256.pem"
fi
