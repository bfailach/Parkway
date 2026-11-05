-- Agrega la tabla de predicciones a una base creada antes de la red neuronal.
-- No borra datos. Uso: psql -U postgres -d parkway -f database/migracion_prediccion.sql
SET TIME ZONE 'America/Bogota';

-- Predicciones de ocupación (sección 13 y 14 del documento maestro).
-- modelo = 'MLP' (red neuronal, próxima hora) o 'PROPHET' (curva de 24 horas).
CREATE TABLE IF NOT EXISTS prediccion_ocupacion (
    id_prediccion       BIGSERIAL PRIMARY KEY,
    id_parqueadero      INT NOT NULL REFERENCES parqueadero (id_parqueadero) ON DELETE CASCADE,
    id_tipo             SMALLINT NULL REFERENCES tipo_vehiculo (id_tipo),
    fecha_hora          TIMESTAMP NOT NULL,
    ocupacion_estimada  NUMERIC(5, 4) NOT NULL CHECK (ocupacion_estimada BETWEEN 0 AND 1),
    ocupacion_actual    NUMERIC(5, 4) NULL,
    limite_inferior     NUMERIC(5, 4) NULL,
    limite_superior     NUMERIC(5, 4) NULL,
    modelo              VARCHAR(10) NOT NULL CHECK (modelo IN ('MLP', 'PROPHET')),
    creada              TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prediccion
    ON prediccion_ocupacion (id_parqueadero, (COALESCE(id_tipo, 0)), fecha_hora, modelo);
