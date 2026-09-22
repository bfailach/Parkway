# Parkway

En la mayoría de parqueaderos el conductor llega sin saber si hay cupo. El
personal lleva el control de entradas y salidas en planillas o de memoria, lo
que genera filas en la entrada, espacios asignados dos veces y una cifra de
disponibilidad que nadie sabe con certeza.

ParkFlow centraliza ese control. La base de datos impide que un espacio se
ocupe dos veces y los cambios se reflejan de inmediato en las pantallas de
consulta y en el panel del administrador.

## Características

- Consulta de cupos libres por parqueadero y por tipo de espacio.
- Registro de entrada con asignación automática de espacio.
- Registro de salida con cálculo de permanencia y tarifa.
- Actualización de la disponibilidad por WebSocket, sin recargar la página.
- Control de acceso por rol: consulta para usuarios, gestión para administradores.
- Soporte para varias sedes desde el mismo sistema.
- Reportes de ocupación por franja horaria, rotación por espacio e ingresos por periodo.

## Tecnologías

| Elemento      | Valor                                   |
| ------------- | ---------------------------------------- |
| Frontend      | React / TypeScript                       |
| Backend       | Node.js / TypeScript (Express)           |
| Base de datos | PostgreSQL                               |
| Arquitectura  | Tres capas (presentación, negocio, datos) con Gestor de transacciones |

## Estructura del repositorio


Parkway/
├── database/
│   ├── schema.sql      # Creación de la base de datos: tablas, PK, FK, restricciones
│   └── seed.sql        # Datos iniciales de prueba
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── db/pool.ts              # Pool de conexiones a PostgreSQL
│   │   ├── transactions/           # Gestor de transacciones (BEGIN/COMMIT/ROLLBACK + bitácora)
│   │   ├── repositories/           # Acceso a datos (patrón Repository)
│   │   ├── services/               # Reglas de negocio
│   │   ├── controllers/            # Controladores REST
│   │   ├── routes/                 # Definición de rutas Express
│   │   ├── middlewares/            # Autenticación JWT, etc.
│   │   └── index.ts                # Punto de entrada de la API
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
└── README.md


Esta estructura corresponde a la arquitectura en tres capas definida en la
documentación de la Fase 1 (`Propuesta_fase_1`), y las tablas de
`database/schema.sql` corresponden al modelo relacional definido en la
Fase 2.

## Requisitos previos

- Node.js 18 o superior
- PostgreSQL 14 o superior
- npm

## 1. Crear y poblar la base de datos

bash
# Crear la base de datos vacía
createdb parkway

# Crear tablas, claves y restricciones
psql -d parkway -f database/schema.sql

# Cargar datos iniciales de prueba (opcional, recomendado para desarrollo)
psql -d parkway -f database/seed.sql


Si PostgreSQL requiere usuario/host explícitos:

bash
psql -h localhost -U postgres -d parkway -f database/schema.sql


## 2. Configurar y ejecutar el backend

bash
cd backend
cp .env.example .env
# Editar .env con las credenciales locales de PostgreSQL

npm install
npm run dev


El servidor queda disponible en `http://localhost:3000`. Endpoints
disponibles en esta fase:

- `GET /api/health` — verificación de que el servicio está activo.
- `GET /api/estacionamiento/disponibilidad?idParqueadero=1&idTipo=1` —
  consulta de espacios libres (ejemplo funcional de extremo a extremo:
  controlador → servicio → repositorio → base de datos).

## Alcance de esta entrega

Esta versión establece la base técnica del sistema:

- Base de datos inicial con tablas, claves primarias y foráneas,
  restricciones de integridad y datos de prueba, en correspondencia con
  el modelo relacional de la Fase 2.
- Estructura inicial del backend en Node.js + TypeScript, organizada por
  capas (rutas, controladores, servicios, repositorios) con un Gestor de
  transacciones inicial que demarca unidades de trabajo y registra la
  bitácora.

Quedan para fases posteriores: el desarrollo completo de las operaciones
CRUD y transaccionales (registrar ingreso, registrar salida, procesar
pago, anular pago, gestión de reservas), la autenticación completa
(login/roles) y la interfaz de usuario.
