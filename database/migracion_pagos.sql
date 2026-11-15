-- Agrega lo necesario para pagos, comprobantes y anulaciones (RF08 y RF09)
-- a una base creada antes de esta versión. No borra datos y se puede
-- ejecutar varias veces.
-- Uso: psql -U postgres -d parkway -f database/migracion_pagos.sql
SET client_encoding = 'UTF8';

ALTER TABLE pago ADD COLUMN IF NOT EXISTS recibido NUMERIC(10, 2) NULL;
ALTER TABLE pago ADD COLUMN IF NOT EXISTS cambio NUMERIC(10, 2) NULL;
ALTER TABLE pago ADD COLUMN IF NOT EXISTS motivo_anulacion VARCHAR(300) NULL;
ALTER TABLE pago ADD COLUMN IF NOT EXISTS id_anulado_por INT NULL REFERENCES usuario (id_usuario);
ALTER TABLE pago ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMP NULL;

-- La referencia es única por medio de pago (antes era única en general).
ALTER TABLE pago DROP CONSTRAINT IF EXISTS pago_referencia_externa_key;
ALTER TABLE pago DROP CONSTRAINT IF EXISTS uq_pago_referencia;
ALTER TABLE pago ADD CONSTRAINT uq_pago_referencia UNIQUE (metodo, referencia_externa);

CREATE INDEX IF NOT EXISTS idx_pago_fecha ON pago (fecha_pago);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pago_aprobado_por_registro ON pago (id_registro) WHERE estado = 'APROBADO';
CREATE SEQUENCE IF NOT EXISTS seq_comprobante START 1;
