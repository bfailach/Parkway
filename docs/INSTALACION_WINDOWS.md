# Instalación en Windows

Guía paso a paso para ejecutar Parkway en Windows con PowerShell.

## 1. Requisitos

- **Node.js 18 o superior:** <https://nodejs.org>. Comprueba con `node -v`.
- **PostgreSQL 14 o superior:** <https://www.postgresql.org/download/windows/>
  (instalador de EDB). Durante la instalación elige una contraseña para el
  usuario `postgres`, anótala y deja el puerto 5432.
- **Git:** <https://git-scm.com>.

## 2. Descargar el proyecto

```powershell
cd C:\Users\<tu usuario>
git clone https://github.com/bfailach/Parkway.git
cd Parkway
```

Para traer cambios más adelante: `git pull`.

## 3. Crear la base de datos

PowerShell no encuentra `psql` ni `createdb` hasta que se agrega su carpeta al
PATH. Revisa qué versión tienes:

```powershell
dir "C:\Program Files\PostgreSQL"
```

Usa el número que aparezca (por ejemplo `18`) en esta línea. Se debe correr en
cada terminal nueva:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
```

Luego, **desde la carpeta principal `Parkway`** (no desde `backend`):

```powershell
createdb -U postgres parkway
psql -U postgres -d parkway -f database/schema.sql
psql -U postgres -d parkway -f database/seed.sql
psql -U postgres -d parkway -f database/demo.sql
```

Cada comando pide la contraseña de `postgres`. No se ve nada mientras la
escribes; es normal. Los mensajes `NOTICE: ... does not exist, skipping` de
`schema.sql` también son normales.

## 4. Backend

En una terminal:

```powershell
cd C:\Users\<tu usuario>\Parkway\backend
copy .env.example .env
notepad .env
```

En el Bloc de notas cambia `DB_PASSWORD=postgres` por tu contraseña, guarda y
cierra. Luego:

```powershell
npm install
npm run dev
```

Debe aparecer `Parkway backend escuchando en el puerto 3000`. Para comprobar
que se conecta a la base, abre
<http://localhost:3000/api/estacionamiento/resumen?idParqueadero=1> en el
navegador.

## 5. Frontend

En **otra** terminal, sin cerrar la del backend:

```powershell
cd C:\Users\<tu usuario>\Parkway\frontend
npm install
npm run dev
```

Abre <http://localhost:5173>. Para detener cualquiera de los dos servidores,
presiona Ctrl+C en su terminal. Las veces siguientes basta con `npm run dev`
en cada carpeta; `npm install` solo se repite si cambian las dependencias.

## Problemas frecuentes

| Mensaje o síntoma | Causa y solución |
| --- | --- |
| `createdb` o `psql` no se reconoce | Falta la carpeta de PostgreSQL en el PATH. Corre la línea `$env:Path += ...` del paso 3. |
| `password authentication failed for user "postgres"` | La contraseña no coincide. Si no la recuerdas, mira la sección siguiente. |
| `database/schema.sql: No such file or directory` | Estás en `backend` o `frontend`. Vuelve a la carpeta principal con `cd ..`. |
| El backend muestra `column ... does not exist` o `relation ... does not exist` | La base tiene la estructura de una versión anterior. Después de cada `git pull` que cambie `database/`, vuelve a ejecutar los tres scripts del paso 3 (borran y recrean las tablas con los datos de ejemplo). |
| Aparece "BogotÃ¡" en lugar de "Bogotá" | La base se creó con una versión anterior de los scripts. Vuelve a ejecutar los tres scripts del paso 3; ahora fijan la codificación UTF-8. |
| La página carga pero no muestra datos | El backend no está corriendo, o `DB_PASSWORD` en `backend\.env` es incorrecta. Revisa la terminal del backend. |
| `port 3000 is already in use` o `port 5173` | El servidor ya está abierto en otra terminal. Ciérrala o presiona Ctrl+C en ella. |
| No aparecen las reservas de ejemplo | Vencen 18 minutos después de cargar `demo.sql`. Vuelve a ejecutarlo. |
| El 3D va lento | El equipo no tiene aceleración gráfica. Usa la vista "Plano" en Disponibilidad. |

## Si olvidaste la contraseña de `postgres`

Abre PowerShell **como administrador** y:

1. Edita los permisos:
   ```powershell
   notepad "C:\Program Files\PostgreSQL\18\data\pg_hba.conf"
   ```
   En las líneas `host` del final, cambia `scram-sha-256` por `trust`. Guarda.
2. Reinicia el servicio: `Restart-Service postgresql-x64-18`
3. Pon una contraseña nueva:
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
   ```
4. Vuelve a poner `scram-sha-256` en `pg_hba.conf` y reinicia el servicio.

Si el servicio tiene otro nombre, búscalo con `Get-Service *postgres*`.
