-- =====================================================================
-- Migración: arquitectura distribuida (Sistemas Distribuidos)
-- Agrega la tabla de salida de eventos (patrón outbox). No modifica
-- ninguna tabla existente. Es segura de ejecutar varias veces.
--
--   psql $DB -f database/migracion_distribuida.sql
-- =====================================================================

-- Evento de dominio pendiente de publicar en RabbitMQ.
-- Se inserta en la MISMA transacción que la operación de negocio
-- (ingreso, salida, pago, reserva...). Si la transacción se revierte, el
-- evento tampoco existe; si se confirma, el evento queda guardado aunque
-- RabbitMQ esté caído, y el publicador lo envía cuando vuelva.
CREATE TABLE IF NOT EXISTS evento_outbox (
    id_evento          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo               VARCHAR(40)  NOT NULL,             -- INGRESO, SALIDA, RESERVA...
    entidad            VARCHAR(50)  NOT NULL,             -- tabla afectada
    id_entidad         VARCHAR(50),
    id_parqueadero     INTEGER,                           -- sede, cuando aplica
    datos              JSONB,
    nodo_origen        VARCHAR(80)  NOT NULL,             -- réplica que confirmó la transacción
    fecha_creacion     TIMESTAMP    NOT NULL DEFAULT now(),
    fecha_publicacion  TIMESTAMP,                         -- NULL = pendiente
    intentos           SMALLINT     NOT NULL DEFAULT 0 CHECK (intentos >= 0),
    ultimo_error       VARCHAR(300)
);

-- El publicador solo recorre los pendientes.
CREATE INDEX IF NOT EXISTS ix_evento_outbox_pendiente
    ON evento_outbox (fecha_creacion) WHERE fecha_publicacion IS NULL;

COMMENT ON TABLE evento_outbox IS
  'Patrón outbox: eventos de dominio guardados en la transacción de negocio y publicados después en RabbitMQ.';
