# Despliegue en Render

Parkway se publica como **un solo servicio web**. El backend compila el
frontend y lo entrega junto con la API, así que no hay que configurar CORS ni
una URL aparte para la API. La base de datos es un PostgreSQL de Render. Los
dos están definidos en `render.yaml`.

## 1. Crear los servicios

1. Entra a <https://render.com> e inicia sesión con tu cuenta de GitHub.
2. **New > Blueprint** y elige el repositorio `bfailach/Parkway`.
3. Render lee `render.yaml` y propone dos recursos: el servicio web `parkway`
   y la base `parkway-db`. Pulsa **Deploy Blueprint**.

La primera compilación tarda unos 5 minutos. Render configura solo
`DATABASE_URL` y genera un `JWT_SECRET` aleatorio.

## 2. Cargar las tablas y los datos

La base se crea vacía, así que hay que cargarla una vez. La forma más simple
es desde GitHub, sin instalar nada:

1. En Render, abre `parkway-db` y en **Connections** copia la
   **External Database URL** (no la Internal).
2. En GitHub, abre el repositorio y ve a **Settings > Secrets and variables >
   Actions > New repository secret**. Nombre: `DATABASE_URL`. Valor: la URL.
   Es el mismo secreto que usa el pronóstico de cada noche.
3. En la pestaña **Actions**, abre **Base de datos** y pulsa **Run workflow**.
   Elige el modo **completa**, escribe `BORRAR` en la confirmación y pulsa el
   botón verde. En unos dos minutos crea las tablas, carga `seed.sql` y
   `demo.sql` y calcula el pronóstico. El paso **Resumen** muestra cuántas
   sedes, usuarios, registros y pagos quedaron.

Antes de la sustentación, el mismo flujo en modo **demo** vuelve a cargar los
datos de demostración (las reservas de ejemplo vencen a los 18 minutos)
sin tocar las tablas.

**Con psql desde tu computador.** También sirve, si tienes PostgreSQL en el
PATH (ver [INSTALACION_WINDOWS.md](INSTALACION_WINDOWS.md)). Primero trae la
última versión del repositorio con `git pull`; luego, en PowerShell, desde la
carpeta `Parkway`:

```powershell
$env:DB = "pega-aquí-la-External-Database-URL"
psql $env:DB -f database/schema.sql
psql $env:DB -f database/seed.sql
psql $env:DB -f database/demo.sql
```

Si la base ya existía, no hace falta recrearla. Ejecuta las migraciones de
lo que se agregó después:

```powershell
psql $env:DB -f database/migracion_tiempo_real.sql   # tiempo real (RF12)
psql $env:DB -f database/migracion_pagos.sql         # pagos y anulaciones (RF08, RF09)
```

Render admite WebSocket sin configuración adicional; el aviso llega por
`wss://` al mismo dominio del servicio.

## Pronóstico de cada noche (RF15)

El pronóstico de las próximas 24 horas lo calcula Prophet en GitHub Actions,
porque el servicio de Render solo corre Node.js. Se configura una vez:

1. Configura el secreto `DATABASE_URL` como en el paso 2 (si ya cargaste la
   base con el flujo **Base de datos**, ya está y el pronóstico ya se calculó).
2. Para recalcularlo a mano, en la pestaña **Actions**, abre **Pronóstico de
   ocupación** y pulsa
   **Run workflow** para calcularlo la primera vez. Si cargaste `demo.sql`, el pronóstico
   usa sus 12 semanas de historia. Debe terminar en verde y
   mostrar el MAPE de cada sede.

Desde ahí corre solo cada noche a las 2:17 a. m. Si falta el secreto, el
flujo termina con un aviso y la aplicación muestra que el pronóstico no está
listo; nada más se afecta. GitHub pausa los flujos programados de un
repositorio sin actividad durante 60 días: si eso pasa, actívalo de nuevo
desde la misma pestaña.

También se puede calcular desde tu computador con
`$env:DATABASE_URL = "..."; python ia/pronostico_prophet.py`.

## Instalar la app en el celular

La aplicación se instala desde la URL de Render, que ya usa HTTPS (requisito
para instalarla):

1. En el celular Android, abre la URL en **Chrome**.
2. Toca **Instalar la app** en la portada, o en el menú de Chrome elige
   **Instalar aplicación**.
3. Parkway queda en la pantalla de inicio y se abre a pantalla completa.

En iPhone se abre en **Safari** y se usa Compartir, Agregar a inicio. Para la
sustentación conviene instalarla antes, con la aplicación ya despierta: el
plan gratuito de Render tarda unos 30 segundos en responder la primera vez.

## 3. Probar

Abre la URL del servicio, por ejemplo `https://parkway.onrender.com`, y entra
con `operador1@parkway.test` / `Operador123*`. Para comprobar solo la API:
`https://parkway.onrender.com/api/health`.

Cada `git push` a `main` vuelve a desplegar la aplicación automáticamente.

## Antes de presentar

- **El plan gratuito se apaga** tras 15 minutos sin visitas, y la primera
  visita después tarda cerca de un minuto en responder. Abre la página unos
  minutos antes de la presentación.
- **Las reservas de ejemplo** vencen 18 minutos después de cargar `demo.sql`.
  Justo antes de presentar, corre el flujo **Base de datos** en modo **demo**
  desde la pestaña Actions de GitHub.
- **La base gratuita de Render vence a los 30 días.** Después hay 14 días para
  pasarla a un plan pago; si no, Render la borra. Para un proyecto más largo
  puedes usar una base gratuita de Neon (<https://neon.tech>): crea el
  proyecto, copia su cadena de conexión, ponla en la variable `DATABASE_URL`
  del servicio `parkway` en Render y ejecuta los mismos tres scripts contra
  ella.

## Variables de entorno

| Variable | Valor | Quién la define |
| --- | --- | --- |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL | Render, desde `parkway-db` |
| `JWT_SECRET` | Texto aleatorio | Render la genera |
| `JWT_EXPIRES_IN` | `8h` | `render.yaml` |
| `RESERVA_MINUTOS` | `30` | `render.yaml` |
| `DB_SSL` | `true` solo si la base exige SSL y la URL no lo indica | Opcional |

## Otro proveedor

En cualquier servidor con Node.js 18 o superior:

```bash
npm run build     # instala y compila backend y frontend
npm start         # sirve todo en el puerto de la variable PORT (3000 por defecto)
```

con `DATABASE_URL` y `JWT_SECRET` definidas en el entorno.
