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

-- ---------------------------------------------------------------------
-- 3. Ninguna tarifa activa puede superar el tope, por ninguna vía
-- El backend ya lo revisa al guardar una sede (422); esta regla lo hace
-- cumplir también en la base, aunque la tarifa se escriba por SQL o por otro
-- servicio. Desactivar una tarifa vieja (activa = false) siempre se permite.
-- Además, el cobro de cada visita se limita a tope × minutos en el backend.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tarifa_dentro_del_tope() RETURNS trigger AS $$
DECLARE
    v_tope  NUMERIC;
    v_sello BOOLEAN;
BEGIN
    IF NOT NEW.activa THEN
        RETURN NEW;
    END IF;
    SELECT COALESCE(p.sello_oro, false) INTO v_sello FROM parqueadero p WHERE p.id_parqueadero = NEW.id_parqueadero;
    SELECT t.valor_minuto INTO v_tope
      FROM tope_tarifario t
     WHERE t.id_tipo = NEW.id_tipo AND t.sello_oro = COALESCE(v_sello, false) AND t.vigente_desde <= CURRENT_DATE
     ORDER BY t.vigente_desde DESC
     LIMIT 1;
    IF v_tope IS NOT NULL AND (NEW.valor_hora > v_tope * 60 OR NEW.valor_fraccion > v_tope * 15 OR NEW.valor_dia > v_tope * 1440) THEN
        RAISE EXCEPTION 'La tarifa supera el tope de $% por minuto del Decreto 026 de 2026', v_tope::int
              USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_tarifa_tope ON tarifa;
CREATE TRIGGER tr_tarifa_tope
    BEFORE INSERT OR UPDATE ON tarifa
    FOR EACH ROW EXECUTE FUNCTION fn_tarifa_dentro_del_tope();
