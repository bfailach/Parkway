-- =====================================================================
-- Parkway (STGP) - Sistema Transaccional para la Gestión de Parqueaderos
-- Script de creación de base de datos y estructura de tablas
-- Basado en el modelo relacional definido en la Fase 2 del proyecto.
-- Motor objetivo: PostgreSQL 14+
-- =====================================================================

-- Ejecutar como superusuario o un rol con permiso CREATEDB.
-- Ejemplo de uso:
--   createdb parkway
--   psql -d parkway -f schema.sql

-- ---------------------------------------------------------------------
-- Extensiones necesarias
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- soporte para hash de contraseñas si se requiere en backend

-- ---------------------------------------------------------------------
-- Limpieza (solo para entornos de desarrollo / recreación del esquema)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS comprobante CASCADE;
DROP TABLE IF EXISTS pago CASCADE;
DROP TABLE IF EXISTS registro_estacionamiento CASCADE;
DROP TABLE IF EXISTS reserva CASCADE;
DROP TABLE IF EXISTS tarifa CASCADE;
DROP TABLE IF EXISTS espacio CASCADE;
DROP TABLE IF EXISTS vehiculo CASCADE;
DROP TABLE IF EXISTS parqueadero CASCADE;
DROP TABLE IF EXISTS tipo_vehiculo CASCADE;
DROP TABLE IF EXISTS transaccion CASCADE;
DROP TABLE IF EXISTS usuario CASCADE;

-- =====================================================================
-- Tabla: usuario
-- Implementa la jerarquía Usuario/Cliente/Operador/Administrador con la
-- estrategia de tabla única (rol como discriminador; turno solo aplica
-- a operadores y administradores).
-- =====================================================================
CREATE TABLE usuario (
    id_usuario         SERIAL PRIMARY KEY,
    nombre             VARCHAR(100)  NOT NULL,
    documento          VARCHAR(20)   UNIQUE,
    correo             VARCHAR(120)  UNIQUE NOT NULL,
    telefono           VARCHAR(20),
    contrasena_hash    VARCHAR(255)  NOT NULL,
    rol                VARCHAR(15)   NOT NULL
        CHECK (rol IN ('CLIENTE', 'OPERADOR', 'ADMINISTRADOR')),
    turno              VARCHAR(20)   NULL,
    estado             VARCHAR(10)   NOT NULL DEFAULT 'ACTIVO'
        CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO')),
    fecha_creacion     TIMESTAMP     NOT NULL DEFAULT now()
);

-- =====================================================================
-- Tabla: tipo_vehiculo (catálogo)
-- =====================================================================
CREATE TABLE tipo_vehiculo (
    id_tipo    SMALLSERIAL PRIMARY KEY,
    nombre     VARCHAR(30) NOT NULL UNIQUE
);

-- =====================================================================
-- Tabla: parqueadero (sede)
-- =====================================================================
CREATE TABLE parqueadero (
    id_parqueadero    SERIAL PRIMARY KEY,
    nombre            VARCHAR(80)  NOT NULL,
    direccion         VARCHAR(150),
    capacidad_total   INT NOT NULL CHECK (capacidad_total > 0)
);

-- =====================================================================
-- Tabla: vehiculo
-- =====================================================================
CREATE TABLE vehiculo (
    placa       VARCHAR(10) PRIMARY KEY,
    id_tipo     SMALLINT NOT NULL REFERENCES tipo_vehiculo (id_tipo),
    id_cliente  INT NULL REFERENCES usuario (id_usuario),
    marca       VARCHAR(40),
    color       VARCHAR(20)
);

CREATE INDEX idx_vehiculo_cliente ON vehiculo (id_cliente);

-- =====================================================================
-- Tabla: espacio
-- version: columna para control optimista en operaciones administrativas
-- =====================================================================
CREATE TABLE espacio (
    id_espacio      SERIAL PRIMARY KEY,
    id_parqueadero  INT NOT NULL REFERENCES parqueadero (id_parqueadero) ON DELETE CASCADE,
    id_tipo         SMALLINT NOT NULL REFERENCES tipo_vehiculo (id_tipo),
    codigo          VARCHAR(10) NOT NULL,
    estado          VARCHAR(18) NOT NULL DEFAULT 'LIBRE'
        CHECK (estado IN ('LIBRE', 'RESERVADO', 'OCUPADO', 'FUERA_DE_SERVICIO')),
    version         INT NOT NULL DEFAULT 0,
    UNIQUE (id_parqueadero, codigo)
);

CREATE INDEX idx_espacio_parqueadero_estado ON espacio (id_parqueadero, estado);

-- =====================================================================
-- Tabla: tarifa
-- Restricción: una sola tarifa activa por tipo de vehículo
-- =====================================================================
CREATE TABLE tarifa (
    id_tarifa       SERIAL PRIMARY KEY,
    id_tipo         SMALLINT NOT NULL REFERENCES tipo_vehiculo (id_tipo),
    valor_hora      NUMERIC(10, 2) NOT NULL CHECK (valor_hora >= 0),
    valor_fraccion  NUMERIC(10, 2) NOT NULL CHECK (valor_fraccion >= 0),
    valor_dia       NUMERIC(10, 2) NOT NULL CHECK (valor_dia >= 0),
    vigente_desde   DATE NOT NULL DEFAULT CURRENT_DATE,
    activa          BOOLEAN NOT NULL DEFAULT true
);

-- Índice único parcial: solo una tarifa activa por tipo de vehículo
CREATE UNIQUE INDEX ux_tarifa_activa_por_tipo
    ON tarifa (id_tipo)
    WHERE activa = true;

-- =====================================================================
-- Tabla: reserva
-- =====================================================================
CREATE TABLE reserva (
    id_reserva    SERIAL PRIMARY KEY,
    id_cliente    INT NOT NULL REFERENCES usuario (id_usuario),
    id_espacio    INT NOT NULL REFERENCES espacio (id_espacio),
    placa         VARCHAR(10) NOT NULL REFERENCES vehiculo (placa),
    fecha_inicio  TIMESTAMP NOT NULL,
    fecha_fin     TIMESTAMP NOT NULL,
    estado        VARCHAR(12) NOT NULL DEFAULT 'ACTIVA'
        CHECK (estado IN ('ACTIVA', 'CUMPLIDA', 'CANCELADA', 'EXPIRADA')),
    CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX idx_reserva_espacio_estado ON reserva (id_espacio, estado);
CREATE INDEX idx_reserva_cliente ON reserva (id_cliente);

-- =====================================================================
-- Tabla: registro_estacionamiento
-- Índices únicos parciales: solo un registro ABIERTO por placa y por
-- espacio (impiden doble ocupación / doble ingreso).
-- =====================================================================
CREATE TABLE registro_estacionamiento (
    id_registro           SERIAL PRIMARY KEY,
    placa                 VARCHAR(10) NOT NULL REFERENCES vehiculo (placa),
    id_espacio            INT NOT NULL REFERENCES espacio (id_espacio),
    id_tarifa             INT NULL REFERENCES tarifa (id_tarifa),
    id_reserva            INT NULL UNIQUE REFERENCES reserva (id_reserva),
    id_operador_ingreso   INT NOT NULL REFERENCES usuario (id_usuario),
    id_operador_salida    INT NULL REFERENCES usuario (id_usuario),
    fecha_ingreso         TIMESTAMP NOT NULL DEFAULT now(),
    fecha_salida          TIMESTAMP NULL,
    minutos               INT NULL,
    valor_calculado       NUMERIC(10, 2) NULL,
    estado                VARCHAR(12) NOT NULL DEFAULT 'ABIERTO'
        CHECK (estado IN ('ABIERTO', 'CERRADO')),
    CHECK (fecha_salida IS NULL OR fecha_salida > fecha_ingreso)
);

-- Un solo registro ABIERTO por placa
CREATE UNIQUE INDEX ux_registro_abierto_por_placa
    ON registro_estacionamiento (placa)
    WHERE estado = 'ABIERTO';

-- Un solo registro ABIERTO por espacio
CREATE UNIQUE INDEX ux_registro_abierto_por_espacio
    ON registro_estacionamiento (id_espacio)
    WHERE estado = 'ABIERTO';

CREATE INDEX idx_registro_placa ON registro_estacionamiento (placa);

-- =====================================================================
-- Tabla: pago
-- referencia_externa: única, sirve como clave de idempotencia frente a
-- la pasarela de pagos.
-- =====================================================================
CREATE TABLE pago (
    id_pago             SERIAL PRIMARY KEY,
    id_registro         INT NOT NULL REFERENCES registro_estacionamiento (id_registro),
    id_operador         INT NOT NULL REFERENCES usuario (id_usuario),
    monto               NUMERIC(10, 2) NOT NULL CHECK (monto > 0),
    metodo              VARCHAR(15) NOT NULL
        CHECK (metodo IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA')),
    referencia_externa  VARCHAR(60) UNIQUE,
    estado              VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO')),
    fecha_pago          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_pago_registro ON pago (id_registro);

-- =====================================================================
-- Tabla: comprobante
-- =====================================================================
CREATE TABLE comprobante (
    id_comprobante  SERIAL PRIMARY KEY,
    id_pago         INT NOT NULL UNIQUE REFERENCES pago (id_pago),
    numero          VARCHAR(20) NOT NULL UNIQUE,
    fecha_emision   TIMESTAMP NOT NULL DEFAULT now(),
    total           NUMERIC(10, 2) NOT NULL CHECK (total > 0)
);

-- =====================================================================
-- Tabla: transaccion (bitácora del Gestor de Transacciones)
-- =====================================================================
CREATE TABLE transaccion (
    id_transaccion   BIGSERIAL PRIMARY KEY,
    id_usuario       INT NOT NULL REFERENCES usuario (id_usuario),
    tipo_operacion   VARCHAR(30) NOT NULL,
    entidad          VARCHAR(40) NOT NULL,
    id_entidad       VARCHAR(20),
    estado           VARCHAR(12) NOT NULL
        CHECK (estado IN ('INICIADA', 'CONFIRMADA', 'REVERTIDA')),
    fecha_inicio     TIMESTAMP NOT NULL DEFAULT now(),
    fecha_fin        TIMESTAMP NULL,
    detalle          JSONB
);

CREATE INDEX idx_transaccion_usuario ON transaccion (id_usuario);
CREATE INDEX idx_transaccion_entidad ON transaccion (entidad, id_entidad);

-- =====================================================================
-- Fin del script de estructura
-- =====================================================================
