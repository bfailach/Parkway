# Parkway

Sistema transaccional para la gestión de parqueaderos. Muestra los cupos
libres de cada sede en tiempo real, registra ingresos y salidas con cálculo
automático del cobro, permite a los clientes reservar un espacio antes de
llegar y deja cada operación en una bitácora.

Proyecto de Sistemas Transaccionales, Universidad Manuela Beltrán.
Grupo 2: Bryan Failach, Alejandro Castellanos y Brayan Bello.

![Portada de Parkway](docs/capturas/01_portada.jpg)

## El problema

En la mayoría de parqueaderos el conductor llega sin saber si hay cupo. El
personal lleva el control de entradas y salidas en planillas o de memoria, lo
que genera filas en la entrada, espacios asignados dos veces y una cifra de
disponibilidad que nadie sabe con certeza.

Parkway centraliza ese control. La base de datos impide que un espacio se
ocupe dos veces y cada cambio aparece en las pantallas de clientes y personal
en pocos segundos.

## Qué puede hacer cada usuario

| Rol | Funciones |
| --- | --- |
| Visitante | Ver los cupos libres por sede, el recorrido de cómo funciona y calcular el cobro. |
| Cliente | Crear su cuenta, registrar sus vehículos, reservar un espacio por 30 minutos, ver su vehículo dentro con el valor acumulado y consultar su historial. |
| Operador | Registrar ingresos (con asignación automática de espacio) y salidas, ver las reservas que vienen en camino, los vehículos dentro, el plano 3D y el historial del día. |
| Administrador | Todo lo del operador, más la bitácora de transacciones. |

El detalle de cada pantalla, con capturas, está en
[docs/FRONTEND.md](docs/FRONTEND.md).

## Estado de los requerimientos

| Funcionalidad | Requerimiento | Estado |
| --- | --- | --- |
| Inicio de sesión con JWT, control de acceso por rol y creación de cuenta de cliente | RF01 | Implementado |
| Estado e historial del cliente (vehículo dentro, valor acumulado, visitas) | RF03 | Implementado |
| Vehículos del cliente: registrar, consultar y quitar | RF04 | Implementado |
| Consulta de cupos libres por sede y tipo, con plano 3D y 2D | RF05 | Implementado |
| Registro de ingreso con asignación automática de espacio | RF06 | Implementado |
| Registro de salida con cálculo de permanencia y tarifa | RF07 | Implementado |
| Reservas: reservar, cancelar, expirar a los 30 minutos, vista del operador | RF10 | Implementado |
| Actualización de la disponibilidad sin recargar la página | RF12 | Consulta cada 5 s. WebSocket en la siguiente fase |
| Historial de salidas y totales del día | RF13 | Implementado |
| Bitácora de transacciones con consulta para el administrador | RF14, RNF08 | Implementado |
| Pagos y comprobantes, anulación, gestión de tarifas y usuarios | RF02, RF08, RF09, RF11 | Siguiente fase |
| Predicción de ocupación con IA | RF15 | Diseñado en el documento maestro (sección 13) |

## Tecnologías

| Elemento | Valor |
| --- | --- |
| Frontend | React 18, TypeScript, Vite |
| 3D | Three.js con React Three Fiber, Drei y postprocesado (bloom) |
| Backend | Node.js, TypeScript, Express |
| Base de datos | PostgreSQL |
| Seguridad | JWT, contraseñas con bcrypt |
| Arquitectura | Tres capas (presentación, negocio, datos) con Gestor de transacciones |

## Cómo ejecutarlo

Requisitos: Node.js 18 o superior y PostgreSQL 14 o superior. En Windows,
sigue la guía paso a paso de [docs/INSTALACION_WINDOWS.md](docs/INSTALACION_WINDOWS.md).

**1. Base de datos** (desde la carpeta principal del proyecto)

```bash
createdb -U postgres parkway
psql -U postgres -d parkway -f database/schema.sql
psql -U postgres -d parkway -f database/seed.sql
psql -U postgres -d parkway -f database/demo.sql   # opcional, recomendado para presentar
```

`demo.sql` ocupa cerca del 60 % de los espacios, registra salidas del día,
crea dos reservas activas que vencen a los 18 minutos y llena la bitácora. Se
puede ejecutar varias veces para reiniciar la demostración.

**2. Backend** (una terminal)

```bash
cd backend
cp .env.example .env      # en Windows: copy .env.example .env. Poner la contraseña de PostgreSQL en DB_PASSWORD
npm install
npm run dev               # http://localhost:3000
```

**3. Frontend** (otra terminal)

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

### Publicarlo en internet

El repositorio incluye `render.yaml` para desplegarlo en Render con un solo
servicio (API y frontend) y una base PostgreSQL. Los pasos están en
[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

### Cuentas de prueba

| Rol | Correo | Contraseña | Datos |
| --- | --- | --- | --- |
| Operador | operador1@parkway.test | Operador123* | |
| Administrador | admin@parkway.test | Admin123* | |
| Cliente | cliente1@parkway.test | Cliente123* | Carro ABC123 |
| Cliente | cliente2@parkway.test | Cliente123* | Moto XYZ78D |

También se puede crear un cliente nuevo desde "Crea una para reservar" en la
pantalla de ingreso.

## Reglas de negocio

**Ingreso (RF06).** El operador digita la placa y elige el tipo de vehículo.
El sistema valida el formato, crea el vehículo si no existe, toma el espacio
reservado o el primer espacio libre del tipo, abre el registro y marca el
espacio como ocupado. Todo ocurre en una sola transacción: si un paso falla,
nada queda a medias.

**Salida (RF07).** El sistema calcula los minutos con la hora de la base de
datos, aplica la tarifa vigente, cierra el registro y libera el espacio.

**Cobro.** Horas completas por el valor de la hora, más cada fracción de 15
minutos iniciada por el valor de la fracción. El cobro de un día nunca supera
el valor día. Ejemplo para automóvil: 1 h 20 min cuesta $4.000 + 2 × $1.500 =
$7.000.

**Reservas (RF10).** El cliente reserva con uno de sus vehículos y el sistema
aparta el primer espacio libre de ese tipo, que queda RESERVADO y no se cuenta
como libre. Tiene 30 minutos para llegar (`RESERVA_MINUTOS` en `backend/.env`).
Al llegar, el operador digita la placa y el vehículo entra a ese espacio,
aunque no queden cupos libres. Si no llega, la reserva expira, el espacio se
libera y la expiración queda en la bitácora. Si el vehículo entra a otra sede,
la reserva se cancela.

**Integridad.**

- Una placa no puede tener dos ingresos abiertos.
- Un espacio no puede quedar asignado a dos vehículos, ni con varios
  operadores registrando ingresos al mismo tiempo (`FOR UPDATE SKIP LOCKED` e
  índices únicos parciales).
- La placa debe coincidir con el formato del tipo: automóvil `ABC123`,
  motocicleta `ABC12D` y bicicleta, un código de 3 a 10 caracteres. Las
  bicicletas no llevan marca.
- Los datos se validan en el formulario y otra vez en el backend.
- Cada operación queda en la tabla `transaccion` con el usuario, el resultado
  y, si falló, el motivo.

## Pruebas

```bash
cd backend
npm test                                   # 16 pruebas unitarias: tarifas, placas, cuentas y vehículos
npx tsx scripts/pruebaConcurrencia.ts 20   # con el backend corriendo
```

La prueba de concurrencia envía 20 ingresos simultáneos de bicicleta a la
Sede Zona T, que tiene 3 espacios. Resultado: 3 aceptados, 17 rechazados con
código 409 y ningún espacio duplicado (RNF03).

## Estructura del repositorio

```
Parkway/
├── database/
│   ├── schema.sql          # Tablas, claves, restricciones e índices
│   ├── seed.sql            # Usuarios, sedes, 65 espacios y tarifas de prueba
│   └── demo.sql            # Vehículos dentro, salidas, reservas y bitácora de ejemplo
├── backend/
│   ├── src/
│   │   ├── routes/         # Rutas Express por módulo (auth, estacionamiento, cliente, admin)
│   │   ├── controllers/    # Reciben la petición y responden
│   │   ├── services/       # Reglas de negocio: ingreso, salida, reservas, tarifas, sesión
│   │   ├── validators/     # Validación de datos de entrada
│   │   ├── repositories/   # Acceso a datos con SQL parametrizado
│   │   ├── transactions/   # Gestor de transacciones (BEGIN/COMMIT/ROLLBACK y bitácora)
│   │   ├── middlewares/    # JWT, roles y manejo de errores
│   │   └── index.ts        # Arranque y expiración periódica de reservas
│   ├── tests/              # Pruebas unitarias
│   └── scripts/            # Prueba de concurrencia
├── frontend/
│   └── src/
│       ├── pages/          # Una pantalla por función (cliente/ para las del cliente)
│       ├── components/     # Placa, Tiquete, Selector, Odometro, diálogos
│       ├── three/          # Escena 3D del parqueadero
│       └── lib/            # Cliente de la API, formatos, rutas y cálculo de tarifa
├── render.yaml             # Despliegue en Render
├── package.json            # Compila y arranca todo desde la raíz
└── docs/
    ├── Proyecto_S8_Parkway.pdf     # Documento maestro
    ├── FRONTEND.md                 # Pantallas, 3D y diseño
    ├── INSTALACION_WINDOWS.md      # Instalación paso a paso en Windows
    ├── DESPLIEGUE.md               # Publicación en Render
    └── capturas/                   # Capturas de la interfaz
```

## API

| Método | Ruta | Acceso | Descripción |
| --- | --- | --- | --- |
| GET | `/api/health` | Público | Estado del servicio |
| POST | `/api/auth/login` | Público | Inicia sesión y devuelve el token |
| POST | `/api/auth/registro` | Público | Crea una cuenta de cliente e inicia la sesión |
| GET | `/api/auth/me` | Sesión | Usuario de la sesión |
| GET | `/api/catalogos/parqueaderos` | Público | Sedes |
| GET | `/api/catalogos/tipos-vehiculo` | Público | Tipos de vehículo con tarifa vigente |
| GET | `/api/estacionamiento/resumen?idParqueadero=1` | Público | Cupos por tipo de vehículo |
| GET | `/api/estacionamiento/disponibilidad?idParqueadero=1&idTipo=1` | Público | Espacios libres |
| GET | `/api/estacionamiento/plano?idParqueadero=1` | Público | Estado de cada espacio, sin placas |
| GET | `/api/estacionamiento/espacios?idParqueadero=1` | Personal | Plazas con la placa del vehículo o de la reserva |
| GET | `/api/estacionamiento/activos?idParqueadero=1&placa=ABC` | Personal | Vehículos dentro y valor acumulado |
| GET | `/api/estacionamiento/historial?idParqueadero=1&desde=…&hasta=…` | Personal | Salidas registradas |
| GET | `/api/estacionamiento/totales-dia?idParqueadero=1` | Personal | Ingresos, salidas y valor del día |
| GET | `/api/estacionamiento/reservas?idParqueadero=1` | Personal | Reservas activas y del día, con el cliente |
| POST | `/api/estacionamiento/ingreso` | Personal | Registra un ingreso |
| POST | `/api/estacionamiento/salida/:idRegistro` | Personal | Registra una salida |
| GET | `/api/cliente/estado` | Cliente | Reserva activa y vehículos dentro con valor acumulado |
| GET | `/api/cliente/historial` | Cliente | Visitas cerradas |
| GET, POST | `/api/cliente/vehiculos` | Cliente | Consultar y registrar vehículos propios |
| DELETE | `/api/cliente/vehiculos/:placa` | Cliente | Quitar un vehículo de la cuenta |
| GET, POST | `/api/cliente/reservas` | Cliente | Consultar y crear reservas |
| POST | `/api/cliente/reservas/:idReserva/cancelar` | Cliente | Cancelar una reserva activa |
| GET | `/api/admin/bitacora?tipo=…&estado=…&desde=…&hasta=…` | Administrador | Bitácora de transacciones |

Errores: 400 si un campo no es válido (con el detalle por campo), 401 sin
sesión, 403 sin permiso, 404 si la sede o el registro no existen y 409 si una
regla de negocio lo impide, por ejemplo cuando no hay espacios libres.

Ejemplo de ingreso:

```bash
curl -X POST http://localhost:3000/api/estacionamiento/ingreso \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"placa":"ABC123","idTipo":1,"idParqueadero":1}'
```

## Siguientes pasos

- Pagos con pasarela, comprobantes y anulación (RF08, RF09).
- Gestión de tarifas y usuarios desde el panel del administrador (RF02, RF11).
- Actualización en tiempo real con WebSocket en lugar de consultas cada 5
  segundos (RF12).
- Predicción de ocupación por hora con Prophet, a partir del historial de
  ingresos (RF15). El diseño está en la sección 13 del documento maestro;
  necesita al menos ocho semanas de datos reales para ser confiable.
