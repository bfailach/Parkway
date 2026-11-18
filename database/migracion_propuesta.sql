-- =====================================================================
-- Migración: funciones de la propuesta de Sistemas Distribuidos
--   1. Topes tarifarios del Decreto Distrital 026 de 2026 (Bogotá).
--   2. Autorización de tratamiento de datos (Ley 1581 de 2012).
--   (La entrada con QR no necesita tablas: el QR es un token firmado.)
-- Solo agrega. No modifica datos existentes. Se puede ejecutar varias veces.
--
--   psql $DB -f database/migracion_propuesta.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Topes tarifarios
-- El Decreto 026 de 2026 modificó los artículos 199 y 200 del Decreto 652
-- de 2025 (Único del Sector Movilidad). Fija la tarifa MÁXIMA por minuto,
-- con IVA incluido, de los parqueaderos fuera de vía. Los parqueaderos con
-- certificación "Sello Oro" tienen un tope distinto.
-- ---------------------------------------------------------------------

-- Certificación de calidad de la sede (cambia el tope aplicable).
ALTER TABLE parqueadero ADD COLUMN IF NOT EXISTS sello_oro BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS tope_tarifario (
    id_tipo        SMALLINT      NOT NULL REFERENCES tipo_vehiculo (id_tipo),
    sello_oro      BOOLEAN       NOT NULL,
    valor_minuto   NUMERIC(10,2) NOT NULL CHECK (valor_minuto >= 0),
    norma          VARCHAR(120)  NOT NULL,
    vigente_desde  DATE          NOT NULL,
    PRIMARY KEY (id_tipo, sello_oro, vigente_desde)
);

COMMENT ON TABLE tope_tarifario IS
  'Tarifa máxima por minuto (IVA incluido) por tipo de vehículo, según la norma distrital vigente.';

-- Valores del Decreto 026 de 2026, vigente desde el 29 de enero de 2026.
-- Tipos: 1 = automóvil (incluye camperos, camionetas y pesados), 2 = motocicleta, 3 = bicicleta.
INSERT INTO tope_tarifario (id_tipo, sello_oro, valor_minuto, norma, vigente_desde) VALUES
    (1, false, 230, 'Decreto Distrital 026 de 2026', DATE '2026-01-29'),
    (1, true,  253, 'Decreto Distrital 026 de 2026', DATE '2026-01-29'),
    (2, false, 161, 'Decreto Distrital 026 de 2026', DATE '2026-01-29'),
    (2, true,  177, 'Decreto Distrital 026 de 2026', DATE '2026-01-29'),
    (3, false,  10, 'Decreto Distrital 026 de 2026', DATE '2026-01-29'),
    (3, true,    0, 'Decreto Distrital 026 de 2026', DATE '2026-01-29')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Autorización de tratamiento de datos personales
-- Ley 1581 de 2012 y Decreto 1377 de 2013: la autorización debe ser previa,
-- expresa e informada, y el responsable debe poder demostrarla. Cada fila
-- es una decisión del titular (otorga o revoca) y no se borra: el estado
-- vigente de una finalidad es su fila más reciente.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consentimiento_datos (
    id_consentimiento  SERIAL       PRIMARY KEY,
    id_usuario         INT          NOT NULL REFERENCES usuario (id_usuario) ON DELETE CASCADE,
    finalidad          VARCHAR(30)  NOT NULL CHECK (finalidad IN ('SERVICIO', 'COMUNICACIONES')),
    otorgado           BOOLEAN      NOT NULL,
    version_politica   VARCHAR(10)  NOT NULL,
    origen             VARCHAR(20)  NOT NULL CHECK (origen IN ('REGISTRO', 'PANEL')),
    fecha              TIMESTAMP    NOT NULL DEFAULT now(),
    -- La finalidad SERVICIO es necesaria para usar la plataforma: no se revoca desde el panel.
    CONSTRAINT ck_servicio_no_revocable CHECK (finalidad <> 'SERVICIO' OR otorgado)
);

CREATE INDEX IF NOT EXISTS ix_consentimiento_usuario
    ON consentimiento_datos (id_usuario, finalidad, fecha DESC);

COMMENT ON TABLE consentimiento_datos IS
  'Historial de autorizaciones de tratamiento de datos (Ley 1581 de 2012). La fila más reciente por finalidad es la vigente.';
