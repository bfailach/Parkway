-- Agrega las tablas del pronóstico de 24 horas (RF15) a una base existente.
-- No borra datos y se puede ejecutar varias veces. El script
-- ia/pronostico_prophet.py la ejecuta solo antes de guardar el pronóstico.
-- Uso: psql -U postgres -d parkway -f database/migracion_pronostico.sql
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

-- Último entrenamiento de Prophet por sede (sección 13 del documento
-- maestro). El script ia/pronostico_prophet.py la actualiza cada noche; la
-- API la usa para decir de cuándo es el pronóstico y qué tan preciso es.
-- fuente = REAL si hubo ocho semanas de registros, SIMULADA si no.
CREATE TABLE IF NOT EXISTS modelo_pronostico (
    id_parqueadero  INT PRIMARY KEY REFERENCES parqueadero (id_parqueadero) ON DELETE CASCADE,
    modelo          VARCHAR(10)  NOT NULL DEFAULT 'PROPHET',
    entrenado       TIMESTAMP    NOT NULL,
    fuente          VARCHAR(10)  NOT NULL CHECK (fuente IN ('REAL', 'SIMULADA')),
    semanas         SMALLINT     NOT NULL,
    mape            NUMERIC(6, 2),
    mae_pp          NUMERIC(6, 2),
    cobertura       NUMERIC(5, 2),
    intervalo       NUMERIC(3, 2) NOT NULL
);
