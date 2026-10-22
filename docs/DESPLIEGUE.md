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

La base se crea vacía, así que hay que ejecutar los scripts una vez desde tu
computador.

1. En Render, abre `parkway-db` y en **Connections** copia la
   **External Database URL**.
2. En PowerShell, desde la carpeta principal `Parkway` y con PostgreSQL en el
   PATH (ver [INSTALACION_WINDOWS.md](INSTALACION_WINDOWS.md)):

```powershell
$env:DB = "pega-aquí-la-External-Database-URL"
psql $env:DB -f database/schema.sql
psql $env:DB -f database/seed.sql
psql $env:DB -f database/demo.sql
```

La URL ya incluye la contraseña, así que estos comandos no la piden.

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
  Vuelve a ejecutar `psql $env:DB -f database/demo.sql` justo antes de
  presentar.
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
