# Manual de instalación y ejecución: Parkway distribuido

Este manual explica cómo levantar Parkway como sistema distribuido con
Docker Compose, cómo comprobar que funciona y cómo reproducir las pruebas de
tolerancia a fallos. El despliegue de un solo nodo en Render sigue igual y
está en [DESPLIEGUE.md](../DESPLIEGUE.md).

## 1. Requisitos

| Recurso | Mínimo | Recomendado |
|---|---|---|
| Sistema operativo | Windows 10/11 con WSL 2, macOS 12 o Linux | — |
| Software | Docker Desktop 4.x (Docker Engine 24+ y Compose v2), Git | Node.js 22 para correr las pruebas |
| CPU | 2 núcleos | 4 núcleos |
| Memoria | 4 GB libres para Docker | 8 GB |
| Disco | 5 GB (imágenes, incluida la de Prophet) | 10 GB |
| Red | Acceso a Docker Hub y a npm la primera vez | — |

## 2. Componentes y puertos

| Contenedor | Imagen | Puerto interno | Publicado en el equipo | Función |
|---|---|---|---|---|
| `gateway` | nginx:1.27-alpine | 80 | **8080** | Punto único de entrada, balanceo, failover, límites |
| `api1`, `api2` | construida con `Dockerfile` | 3000 | — | Backend (API REST, WebSocket y aplicación web) |
| `eventos` (×2) | `servicios/eventos/Dockerfile` | 4000 | — | Consumidor de eventos y resumen por sede |
| `postgres-primario` | postgres:16-alpine | 5432 | — | Base transaccional (escrituras) |
| `postgres-replica` | postgres:16-alpine | 5432 | — | Réplica en espera (streaming) |
| `redis` | redis:7-alpine | 6379 | — | Bloqueos, caché y liderazgo |
| `rabbitmq` | rabbitmq:3.13-management-alpine | 5672 / 15672 | **15672** | Bus de eventos y consola web |
| `ia` | `ia/Dockerfile` | — | — | Pronóstico de ocupación (Prophet) |

Solo el gateway y la consola de RabbitMQ quedan expuestos. Los demás nodos se
comunican por la red interna `interna` de Docker.

## 3. Variables de configuración

Docker Compose toma los valores de un archivo `.env` en la raíz del
repositorio. Todas tienen un valor por defecto para uso local; en cualquier
otro entorno deben cambiarse.

| Variable | Por defecto | Uso |
|---|---|---|
| `POSTGRES_PASSWORD` | `parkway-local` | Contraseña de PostgreSQL |
| `REPLICACION_PASSWORD` | `replica-local` | Usuario `replicador` de la réplica |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | `parkway` / `parkway-local` | Acceso a RabbitMQ y a su consola |
| `JWT_SECRET` | `solo-para-tokens-antiguos` | Solo para validar tokens HS256 emitidos antes del cambio |
| `QR_HORAS` | `24` | Vigencia del QR de entrada de cada sede |
| `PUBLIC_URL` | (la del gateway) | Dirección pública que se pone en el enlace del QR |

Variables del backend que activan la parte distribuida (ya vienen en el
`docker-compose.yml`). Sin ellas el backend funciona como un solo nodo:

| Variable | Valor en el clúster | Efecto |
|---|---|---|
| `NODO_ID` | `api1`, `api2` | Nombre de la réplica (cabecera `X-Parkway-Nodo`) |
| `REDIS_URL` | `redis://redis:6379` | Bloqueo distribuido, caché y liderazgo |
| `RABBITMQ_URL` | `amqp://…@rabbitmq:5672` | Publicación de eventos |
| `OUTBOX_HABILITADO` | `true` | Guarda los eventos en `evento_outbox` |
| `JWT_PRIVATE_KEY_FILE` | `/run/secrets/jwt_es256` | Firma ES256 y publicación del JWKS |

## 4. Instalación paso a paso

```bash
git clone https://github.com/bfailach/Parkway.git
cd Parkway
git checkout bryan/arquitectura-distribuida

# 1. Llave privada ES256 para firmar los tokens (una sola vez).
#    En Windows, ejecútelo desde Git Bash o WSL.
./despliegue/generar-llaves.sh

# 2. Construir las imágenes y levantar los 10 contenedores.
docker compose up -d --build

# 3. Ver el estado. Espere a que postgres-primario y rabbitmq digan "healthy".
docker compose ps
```

La primera vez, `postgres-primario` crea las tablas y carga `seed.sql`,
`demo.sql`, `migracion_distribuida.sql` y `migracion_propuesta.sql` (unos 30 a 60 s). La réplica se
copia sola del primario cuando este está listo.

Abra <http://localhost:8080>. Usuarios de prueba:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@parkway.test | Admin123* |
| Operador | operador1@parkway.test | Operador123* |
| Cliente | cliente1@parkway.test | Cliente123* |

## 5. Comprobar que el sistema está distribuido

```bash
# ¿Qué réplica atiende cada petición? (alterna entre api1 y api2)
for i in 1 2 3 4; do curl -s -D - -o /dev/null http://localhost:8080/api/health | grep -i x-parkway-nodo; done

# Estado del nodo y sus dependencias: base, réplica, Redis, RabbitMQ, outbox
curl -s http://localhost:8080/api/salud/distribuida

# Llave pública de firma de los tokens
curl -s http://localhost:8080/.well-known/jwks.json

# Servicio de eventos
curl -s http://localhost:8080/eventos/salud
```

Consola de RabbitMQ: <http://localhost:15672> (usuario `parkway`). En
**Queues** aparecen `eventos.proyeccion` y su cola de mensajes muertos
`eventos.proyeccion.dlq`.

Réplica de la base:

```bash
docker compose exec postgres-primario psql -U postgres -c "select application_name, state, replay_lag from pg_stat_replication"
docker compose exec postgres-replica  psql -U postgres -d parkway -c "select pg_is_in_recovery(), count(*) from registro_estacionamiento"
```

## 6. Pruebas

Desde la carpeta `backend`, con Node.js 22 (`npm ci` la primera vez):

```bash
npm test                                   # 70 pruebas unitarias
API_URL=http://localhost:8080/api npx tsx scripts/pruebaConcurrencia.ts   # 50 ingresos sobre 10 espacios
API_URL=http://localhost:8080/api npx tsx scripts/pruebaCarga.ts 100 60   # 100 usuarios, 60 s
# 11 escenarios distribuidos. Requiere haber corrido antes la de concurrencia.
# Los de fallos detienen y reinician contenedores con docker compose.
API_URL=http://localhost:8080 npx tsx scripts/pruebaDistribuida.ts integracion
API_URL=http://localhost:8080 npx tsx scripts/pruebaDistribuida.ts fallos
```

El gateway limita a 30 peticiones por segundo por IP (10 por minuto en el
inicio de sesión). Las pruebas de carga simulan cientos de usuarios desde un
solo equipo; si se lanzan desde fuera del gateway recibirán 429. En ese caso,
ejecútelas dentro de la red de Docker o suba temporalmente el límite en
`despliegue/gateway/nginx.conf`.

## 7. Simular fallos a mano

| Qué probar | Comando | Qué debe pasar |
|---|---|---|
| Caída de una réplica | `docker compose kill api1` | La aplicación sigue funcionando; las respuestas salen de `api2` |
| Recuperación | `docker compose start api1` | El gateway vuelve a enviarle tráfico en pocos segundos |
| Caída de Redis | `docker compose stop redis` | Ingresos y salidas siguen; `/api/salud/distribuida` muestra el circuito ABIERTO |
| Caída de RabbitMQ | `docker compose stop rabbitmq` | Ingresos y salidas siguen; `eventosPendientes` crece en el outbox |
| Vuelta de RabbitMQ | `docker compose start rabbitmq` | Los pendientes se publican y `eventosPendientes` vuelve a 0 |
| Caída del primario | `docker compose stop postgres-primario` | La API responde 503 con `Retry-After`; al iniciarlo se recupera sola |
| Promoción de la réplica | `docker compose exec -u postgres postgres-replica pg_ctl promote -D /var/lib/postgresql/data` | La réplica acepta escrituras. Para usarla, cambie `DB_HOST` de `api1` y `api2` a `postgres-replica` y ejecute `docker compose up -d api1 api2` |

## 8. Base de datos existente (sin Docker)

Si la base ya existe (por ejemplo, la de Render), ejecute una vez las
migraciones. Solo agregan tablas y una columna; no cambian datos existentes:

```bash
psql "$DATABASE_URL" -f database/migracion_distribuida.sql   # outbox de eventos
psql "$DATABASE_URL" -f database/migracion_propuesta.sql     # topes tarifarios y autorización de datos
```

Las tarifas de bicicleta de una base creada antes de este cambio ($1.000 la
hora) superan el tope de $600. `GET /api/topes-tarifarios/revision` las
lista; el administrador las corrige desde *Sedes*.

## 9. Detener y limpiar

```bash
docker compose down        # detiene y conserva los datos
docker compose down -v     # detiene y borra los volúmenes (la base vuelve a cargarse al subir)
```

## 10. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `secret jwt_es256: file not found` | Falta la llave. Ejecute `./despliegue/generar-llaves.sh`. |
| El gateway no inicia: `host not found in upstream api1` | El gateway arrancó antes que las réplicas. `docker compose up -d gateway`. |
| `firmaTokens: HS256` en `/api/salud/distribuida` | La llave no se montó. Revise que `despliegue/secretos/jwt_es256.pem` exista y sea legible. |
| La réplica reinicia en bucle | El primario no había terminado de cargar. `docker compose restart postgres-replica`. Si persiste: `docker compose down -v` y subir de nuevo. |
| Puerto 8080 ocupado | Cambie `"8080:80"` por otro puerto en `docker-compose.yml`. |
