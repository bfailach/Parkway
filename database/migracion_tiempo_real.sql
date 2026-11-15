-- Agrega el aviso de cambios en tiempo real (RF12) a una base creada antes
-- de esta versión. No borra datos y se puede ejecutar varias veces.
-- Uso: psql -U postgres -d parkway -f database/migracion_tiempo_real.sql

-- =====================================================================
-- Actualización en tiempo real (RF12)
-- Cada cambio de estado de un espacio, y cada espacio que se crea o se
-- quita, avisa por el canal parkway_espacios con el número de la sede.
-- PostgreSQL entrega el aviso solo cuando la transacción hace COMMIT; si
-- se revierte, no se envía nada. Dentro de una transacción junta los
-- avisos iguales, así que crear una sede de 800 espacios envía uno solo.
-- El backend escucha el canal (LISTEN) y lo reenvía por WebSocket.
-- =====================================================================
CREATE OR REPLACE FUNCTION notificar_cambio_espacio() RETURNS trigger AS $$
DECLARE
    sede INT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
        RETURN NULL;
    END IF;
    sede := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_parqueadero ELSE NEW.id_parqueadero END;
    PERFORM pg_notify('parkway_espacios', json_build_object('sede', sede)::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_espacio_tiempo_real ON espacio;
CREATE TRIGGER tr_espacio_tiempo_real
    AFTER INSERT OR DELETE OR UPDATE OF estado ON espacio
    FOR EACH ROW EXECUTE FUNCTION notificar_cambio_espacio();
