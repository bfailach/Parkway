-- Los scripts están en UTF-8. En Windows, psql usa por defecto la
-- codificación de la consola (WIN1252) y dañaría las tildes ("BogotÃ¡").
SET client_encoding = 'UTF8';
-- Las fechas se guardan en hora de Bogotá, la misma que usa el backend.
SET TIME ZONE 'America/Bogota';

-- =====================================================================
-- Parkway - Datos de demostración (opcional)
-- Ejecutar después de schema.sql y seed.sql para ver el parqueadero con
-- vehículos dentro y 12 semanas de historia:
--   psql -d parkway -f demo.sql
--
-- - Ocupa cerca del 60 % de los espacios con ingresos abiertos de las
--   últimas 4 horas y registra salidas cerradas durante el día.
-- - Simula 12 semanas de operación hasta ayer, con el patrón de cada sede,
--   para los reportes, el historial y el pronóstico de Prophet.
-- - Crea dos reservas activas que vencen a los 18 minutos.
-- Se puede ejecutar varias veces: primero limpia los movimientos. Tarda
-- unos segundos.
-- =====================================================================

BEGIN;

DELETE FROM comprobante;
DELETE FROM pago;
DELETE FROM registro_estacionamiento;
DELETE FROM reserva;
DELETE FROM transaccion;
DELETE FROM vehiculo WHERE id_cliente IS NULL AND placa NOT IN ('JKL456');
UPDATE espacio SET estado = 'LIBRE', version = version + 1 WHERE estado IN ('OCUPADO', 'RESERVADO');

-- Placas de prueba con el formato de cada tipo de vehículo
CREATE TEMP TABLE demo_vehiculo AS
SELECT
    CASE t.nombre
        WHEN 'AUTOMOVIL'   THEN chr(65 + (g * 7) % 26) || chr(65 + (g * 11) % 26) || chr(65 + (g * 5) % 26) || lpad(((g * 137) % 1000)::text, 3, '0')
        WHEN 'MOTOCICLETA' THEN chr(65 + (g * 3) % 26) || chr(65 + (g * 13) % 26) || chr(65 + (g * 17) % 26) || lpad(((g * 41) % 100)::text, 2, '0') || chr(65 + (g * 19) % 26)
        ELSE 'BICI' || lpad(nextval('seq_bicicleta')::text, 3, '0')
    END AS placa,
    t.id_tipo,
    CASE t.nombre
        WHEN 'BICICLETA'   THEN NULL
        WHEN 'MOTOCICLETA' THEN (ARRAY['Yamaha', 'Honda', 'Suzuki', 'Bajaj', 'AKT', 'Kawasaki'])[1 + g % 6]
        ELSE (ARRAY['Mazda', 'Renault', 'Chevrolet', 'Kia', 'Toyota', 'Nissan', 'Volkswagen', 'Hyundai'])[1 + g % 8]
    END AS marca,
    (ARRAY['Blanco', 'Gris', 'Negro', 'Rojo', 'Azul', 'Plata'])[1 + g % 6] AS color,
    g
FROM generate_series(1, 120) AS g
CROSS JOIN LATERAL (
    SELECT * FROM tipo_vehiculo
    WHERE nombre = CASE WHEN g % 10 < 7 THEN 'AUTOMOVIL' WHEN g % 10 < 9 THEN 'MOTOCICLETA' ELSE 'BICICLETA' END
) t;

INSERT INTO vehiculo (placa, id_tipo, marca, color)
SELECT DISTINCT ON (placa) placa, id_tipo, marca, color FROM demo_vehiculo
ON CONFLICT (placa) DO NOTHING;

-- Ingresos abiertos: cerca del 60 % de los espacios libres de cada tipo
WITH candidatos AS (
    SELECT e.id_espacio, e.id_tipo, e.id_parqueadero,
           row_number() OVER (PARTITION BY e.id_tipo ORDER BY md5(e.id_espacio::text)) AS n_espacio,
           count(*) OVER (PARTITION BY e.id_tipo) AS total
      FROM espacio e
     WHERE e.estado = 'LIBRE'
),
elegidos AS (
    SELECT * FROM candidatos WHERE n_espacio <= ceil(total * 0.6)
),
placas AS (
    SELECT v.placa, v.id_tipo,
           row_number() OVER (PARTITION BY v.id_tipo ORDER BY v.placa) AS n_placa
      FROM vehiculo v
     WHERE v.placa IN (SELECT placa FROM demo_vehiculo)
)
INSERT INTO registro_estacionamiento (placa, id_espacio, id_tarifa, id_operador_ingreso, fecha_ingreso)
SELECT p.placa, el.id_espacio, ta.id_tarifa,
       (SELECT id_usuario FROM usuario WHERE correo = 'operador1@parkway.test'),
       now() - ((10 + (el.n_espacio * 37) % 230) * interval '1 minute')
  FROM elegidos el
  JOIN placas p ON p.id_tipo = el.id_tipo AND p.n_placa = el.n_espacio
  JOIN tarifa ta ON ta.id_tipo = el.id_tipo AND ta.id_parqueadero = el.id_parqueadero AND ta.activa;

UPDATE espacio SET estado = 'OCUPADO', version = version + 1
 WHERE id_espacio IN (SELECT id_espacio FROM registro_estacionamiento WHERE estado = 'ABIERTO');

-- Salidas del día, con valor calculado según la tarifa (horas + fracciones de 15 min, tope por día)
WITH libres AS (
    SELECT e.id_espacio, e.id_tipo, e.id_parqueadero, row_number() OVER (PARTITION BY e.id_tipo ORDER BY e.piso, e.codigo) AS n
      FROM espacio e WHERE e.estado = 'LIBRE'
),
placas AS (
    SELECT v.placa, v.id_tipo, row_number() OVER (PARTITION BY v.id_tipo ORDER BY v.placa DESC) AS n
      FROM vehiculo v
     WHERE v.placa IN (SELECT placa FROM demo_vehiculo)
       AND v.placa NOT IN (SELECT placa FROM registro_estacionamiento WHERE estado = 'ABIERTO')
),
salidas AS (
    SELECT p.placa, l.id_espacio, ta.id_tarifa, ta.valor_hora, ta.valor_fraccion, ta.valor_dia,
           20 + (l.n * 53) % 200 AS minutos,
           now() - ((5 + (l.n * 29) % 120) * interval '1 minute') AS salida
      FROM libres l
      JOIN placas p ON p.id_tipo = l.id_tipo AND p.n = l.n
      JOIN tarifa ta ON ta.id_tipo = l.id_tipo AND ta.id_parqueadero = l.id_parqueadero AND ta.activa
     WHERE l.n <= 6
)
INSERT INTO registro_estacionamiento
    (placa, id_espacio, id_tarifa, id_operador_ingreso, id_operador_salida,
     fecha_ingreso, fecha_salida, minutos, valor_calculado, estado)
SELECT s.placa, s.id_espacio, s.id_tarifa,
       (SELECT id_usuario FROM usuario WHERE correo = 'operador1@parkway.test'),
       (SELECT id_usuario FROM usuario WHERE correo = 'operador2@parkway.test'),
       s.salida - s.minutos * interval '1 minute', s.salida, s.minutos,
       LEAST((s.minutos / 60) * s.valor_hora + ceil((s.minutos % 60) / 15.0) * s.valor_fraccion, s.valor_dia),
       'CERRADO'
  FROM salidas s;

-- ---------------------------------------------------------------------
-- Historia de 12 semanas (hasta ayer a la medianoche)
--
-- Simula la operación de cada sede hora por hora para que los reportes,
-- el historial y el pronóstico de Prophet tengan datos con sentido:
-- - Sede Chapinero es de oficinas: llegan de 6 a 9 a. m. y se quedan el
--   día; los fines de semana y festivos hay poco movimiento.
-- - Sede Zona T es comercial y de rumba: almuerzo, tarde y noche, con más
--   movimiento los viernes por la noche, fines de semana y festivos.
-- - Las demás sedes que cree el administrador siguen el patrón de oficinas.
-- Cada vehículo ocupa el primer espacio libre de su tipo (piso 1 primero),
-- como en el ingreso real; si la sede está llena, el vehículo no entra.
-- Un mismo vehículo nunca está en dos lugares a la vez. Los festivos de
-- Colombia se calculan con la Ley Emiliani. Con setseed el resultado es
-- el mismo cada vez que se carga en el mismo día.
-- ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.pascua(a int) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
BEGIN
    b := a / 100; c := a % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
    h := (19 * (a % 19) + b - d - g + 15) % 30; i := c / 4; k := c % 4;
    l := (32 + 2 * e + 2 * i - h - k) % 7; m := ((a % 19) + 11 * h + 22 * l) / 451;
    RETURN make_date(a, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
END $f$;

-- Ley Emiliani: el festivo pasa al lunes siguiente.
CREATE FUNCTION pg_temp.al_lunes(f date) RETURNS date LANGUAGE sql IMMUTABLE AS
$f$ SELECT f + ((8 - EXTRACT(ISODOW FROM f)::int) % 7) $f$;

CREATE FUNCTION pg_temp.es_festivo(d date) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE a int := EXTRACT(YEAR FROM d); p date := pg_temp.pascua(EXTRACT(YEAR FROM d)::int);
BEGIN
    RETURN d IN (make_date(a, 1, 1), make_date(a, 5, 1), make_date(a, 7, 20), make_date(a, 8, 7), make_date(a, 12, 8), make_date(a, 12, 25),
                 pg_temp.al_lunes(make_date(a, 1, 6)), pg_temp.al_lunes(make_date(a, 3, 19)), pg_temp.al_lunes(make_date(a, 6, 29)),
                 pg_temp.al_lunes(make_date(a, 8, 15)), pg_temp.al_lunes(make_date(a, 10, 12)), pg_temp.al_lunes(make_date(a, 11, 1)),
                 pg_temp.al_lunes(make_date(a, 11, 11)), p - 3, p - 2,
                 pg_temp.al_lunes(p + 39), pg_temp.al_lunes(p + 60), pg_temp.al_lunes(p + 68));
END $f$;

-- Parte de la capacidad que llega en cada hora, según el perfil de la sede.
CREATE FUNCTION pg_temp.tasa_llegada(perfil text, libre boolean, dia_semana int, h int) RETURNS numeric LANGUAGE sql IMMUTABLE AS $f$
SELECT CASE
    WHEN perfil = 'OFICINAS' AND NOT libre THEN
        (ARRAY[0,0,0,0,0,.01,.08,.22,.25,.12,.06,.07,.10,.10,.07,.05,.04,.03,.03,.02,.01,0,0,0])[h + 1]
    WHEN perfil = 'OFICINAS' THEN
        (ARRAY[0,0,0,0,0,0,0,0,.03,.05,.07,.08,.08,.07,.06,.05,.04,.03,.02,.01,0,0,0,0])[h + 1]
    WHEN NOT libre THEN
        (ARRAY[0,0,0,0,0,0,0,.06,.08,.06,.06,.09,.13,.12,.08,.07,.07,.09,.12,.13,.10,.06,.03,0])[h + 1]
        * CASE WHEN dia_semana = 5 AND h >= 18 THEN 1.5 ELSE 1 END
    ELSE
        (ARRAY[0,0,0,0,0,0,0,0,0,0,.08,.12,.14,.13,.11,.10,.10,.11,.13,.16,.16,.12,.08,.04])[h + 1]
END::numeric $f$;

-- Minutos de permanencia según el perfil y la hora de llegada.
CREATE FUNCTION pg_temp.permanencia(perfil text, libre boolean, h int) RETURNS int LANGUAGE sql VOLATILE AS $f$
SELECT (CASE
    WHEN perfil = 'OFICINAS' AND NOT libre AND h <= 9 THEN 420 + random() * 240
    WHEN perfil = 'OFICINAS' AND NOT libre THEN 40 + random() * 150
    WHEN perfil = 'OFICINAS' THEN 60 + random() * 180
    WHEN NOT libre AND h <= 9 THEN 420 + random() * 180
    WHEN h >= 18 THEN 90 + random() * 210
    ELSE 45 + random() * 135
END)::int $f$;

-- Vehículos de la historia: unos frecuentes (vienen casi a diario) y muchos ocasionales.
CREATE TEMP TABLE demo_flota (
    placa      VARCHAR(10) PRIMARY KEY,
    id_tipo    SMALLINT NOT NULL,
    frecuente  BOOLEAN NOT NULL,
    hasta      TIMESTAMP NOT NULL DEFAULT '-infinity'
);
INSERT INTO demo_flota (placa, id_tipo, frecuente)
SELECT chr(65 + (g / 676) % 26) || chr(65 + (g / 26) % 26) || chr(65 + g % 26) || lpad(((g * 389) % 1000)::text, 3, '0'),
       (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'AUTOMOVIL'), g % 5 = 0
  FROM generate_series(1000, 1899) AS g
UNION ALL
SELECT chr(65 + (g / 676) % 26) || chr(65 + (g / 26) % 26) || chr(65 + g % 26) || lpad((g % 100)::text, 2, '0') || chr(65 + (g * 7) % 26),
       (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'MOTOCICLETA'), g % 5 = 0
  FROM generate_series(3000, 3299) AS g
UNION ALL
SELECT 'BICI' || lpad(nextval('seq_bicicleta')::text, 3, '0'),
       (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'BICICLETA'), g % 3 = 0
  FROM generate_series(1, 90) AS g
ON CONFLICT (placa) DO NOTHING;
-- Los vehículos de los clientes de prueba también tienen visitas.
INSERT INTO demo_flota (placa, id_tipo, frecuente)
SELECT placa, id_tipo, true FROM vehiculo WHERE placa IN ('ABC123', 'XYZ78D')
ON CONFLICT (placa) DO NOTHING;

INSERT INTO vehiculo (placa, id_tipo, marca, color)
SELECT f.placa, f.id_tipo,
       CASE t.nombre
           WHEN 'BICICLETA'   THEN NULL
           WHEN 'MOTOCICLETA' THEN (ARRAY['Yamaha', 'Honda', 'Suzuki', 'Bajaj', 'AKT', 'Kawasaki'])[1 + abs(hashtext(f.placa)) % 6]
           ELSE (ARRAY['Mazda', 'Renault', 'Chevrolet', 'Kia', 'Toyota', 'Nissan', 'Volkswagen', 'Hyundai'])[1 + abs(hashtext(f.placa)) % 8]
       END,
       (ARRAY['Blanco', 'Gris', 'Negro', 'Rojo', 'Azul', 'Plata'])[1 + abs(hashtext(f.placa || 'c')) % 6]
  FROM demo_flota f JOIN tipo_vehiculo t USING (id_tipo)
ON CONFLICT (placa) DO NOTHING;

DO $simulacion$
DECLARE
    sede        record;
    tipo        record;
    tar         record;
    perfil      text;
    dia         date;
    libre       boolean;
    h           int;
    n           int;
    i           int;
    idx         int;
    cap         int;
    ids         int[];
    libres_en   timestamp[];
    llegada     timestamp;
    salida      timestamp;
    minutos     int;
    vehiculo    text;
    factor      numeric;
    tasa        numeric;
    hoy         date := current_date;
    inicio      date := current_date - 84;
    op_dia      int := (SELECT id_usuario FROM usuario WHERE correo = 'operador1@parkway.test');
    op_noche    int := (SELECT id_usuario FROM usuario WHERE correo = 'operador2@parkway.test');
    admin       int := (SELECT id_usuario FROM usuario WHERE rol = 'ADMINISTRADOR' ORDER BY id_usuario LIMIT 1);
    turno_noche boolean;
BEGIN
    PERFORM setseed(0.42);
    FOR sede IN SELECT id_parqueadero, nombre FROM parqueadero ORDER BY id_parqueadero LOOP
        perfil := CASE WHEN sede.nombre ILIKE '%zona t%' THEN 'COMERCIAL' ELSE 'OFICINAS' END;
        -- Si la operadora de la noche trabaja en la sede, atiende desde las 2:00 p. m.
        turno_noche := EXISTS (SELECT 1 FROM operador_parqueadero WHERE id_usuario = op_noche AND id_parqueadero = sede.id_parqueadero);
        FOR tipo IN SELECT id_tipo, nombre FROM tipo_vehiculo ORDER BY id_tipo LOOP
            SELECT array_agg(e.id_espacio ORDER BY e.piso, e.codigo) INTO ids
              FROM espacio e WHERE e.id_parqueadero = sede.id_parqueadero AND e.id_tipo = tipo.id_tipo;
            CONTINUE WHEN ids IS NULL;
            SELECT * INTO tar FROM tarifa
             WHERE id_parqueadero = sede.id_parqueadero AND id_tipo = tipo.id_tipo AND activa;
            CONTINUE WHEN NOT FOUND;
            cap := array_length(ids, 1);
            libres_en := array_fill('-infinity'::timestamp, ARRAY[cap]);

            FOR dia IN SELECT generate_series(inicio, hoy - 1, interval '1 day')::date LOOP
                libre := EXTRACT(ISODOW FROM dia) >= 6 OR pg_temp.es_festivo(dia);
                -- Días más o menos movidos y una demanda que crece un poco con las semanas.
                factor := (0.85 + random() * 0.3) * (0.9 + 0.15 * (dia - inicio) / 84.0);
                FOR h IN 5..23 LOOP
                    tasa := pg_temp.tasa_llegada(perfil, libre, EXTRACT(ISODOW FROM dia)::int, h)
                            * CASE tipo.nombre WHEN 'MOTOCICLETA' THEN 0.9 WHEN 'BICICLETA' THEN (CASE WHEN libre THEN 0.35 ELSE 0.6 END) ELSE 1 END;
                    n := floor(cap * tasa * factor + random())::int;
                    CONTINUE WHEN n = 0;
                    FOR llegada IN
                        SELECT dia + make_interval(hours => h, mins => m) FROM (
                            SELECT floor(random() * 60)::int AS m FROM generate_series(1, n)) x ORDER BY m
                    LOOP
                        minutos := pg_temp.permanencia(perfil, libre, h);
                        salida := llegada + make_interval(mins => minutos);
                        CONTINUE WHEN salida >= hoy;  -- la historia termina ayer
                        idx := NULL;
                        FOR i IN 1..cap LOOP
                            IF libres_en[i] <= llegada THEN idx := i; EXIT; END IF;
                        END LOOP;
                        CONTINUE WHEN idx IS NULL;  -- sede llena: el vehículo sigue de largo
                        -- La mitad de las veces llega un cliente frecuente.
                        SELECT placa INTO vehiculo FROM demo_flota
                         WHERE id_tipo = tipo.id_tipo AND hasta <= llegada AND (frecuente OR random() < 0.5)
                         ORDER BY random() LIMIT 1;
                        CONTINUE WHEN vehiculo IS NULL;
                        UPDATE demo_flota SET hasta = salida WHERE placa = vehiculo;
                        libres_en[idx] := salida;
                        INSERT INTO registro_estacionamiento
                            (placa, id_espacio, id_tarifa, id_operador_ingreso, id_operador_salida,
                             fecha_ingreso, fecha_salida, minutos, valor_calculado, estado)
                        VALUES (vehiculo, ids[idx], tar.id_tarifa,
                                CASE WHEN turno_noche AND h >= 14 THEN op_noche ELSE op_dia END,
                                CASE WHEN random() < 0.05 THEN admin
                                     WHEN turno_noche AND EXTRACT(HOUR FROM salida) >= 14 THEN op_noche ELSE op_dia END,
                                llegada, salida, minutos,
                                LEAST((minutos / 60) * tar.valor_hora + ceil((minutos % 60) / 15.0) * tar.valor_fraccion, tar.valor_dia),
                                'CERRADO');
                    END LOOP;
                END LOOP;
            END LOOP;
        END LOOP;
    END LOOP;
END
$simulacion$;

-- Reservas de ejemplo: dos activas (clientes de seed.sql) y dos terminadas hoy
WITH libre_auto AS (
    SELECT id_espacio FROM espacio e JOIN parqueadero p USING (id_parqueadero)
     WHERE p.nombre = 'Sede Chapinero' AND e.estado = 'LIBRE'
       AND e.id_tipo = (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'AUTOMOVIL')
     ORDER BY e.piso, e.codigo LIMIT 1
),
libre_moto AS (
    SELECT id_espacio FROM espacio e JOIN parqueadero p USING (id_parqueadero)
     WHERE p.nombre = 'Sede Chapinero' AND e.estado = 'LIBRE'
       AND e.id_tipo = (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'MOTOCICLETA')
     ORDER BY e.piso, e.codigo LIMIT 1
),
nuevas AS (
    INSERT INTO reserva (id_cliente, id_espacio, placa, fecha_inicio, fecha_fin, estado)
    SELECT u.id_usuario, x.id_espacio, x.placa, now() - interval '12 minutes', now() + interval '18 minutes', 'ACTIVA'
      FROM (SELECT id_espacio, 'ABC123' AS placa, 'cliente1@parkway.test' AS correo FROM libre_auto
            UNION ALL
            SELECT id_espacio, 'XYZ78D', 'cliente2@parkway.test' FROM libre_moto) x
      JOIN usuario u ON u.correo = x.correo
    RETURNING id_espacio
)
UPDATE espacio SET estado = 'RESERVADO', version = version + 1
 WHERE id_espacio IN (SELECT id_espacio FROM nuevas);

INSERT INTO reserva (id_cliente, id_espacio, placa, fecha_inicio, fecha_fin, estado)
SELECT u.id_usuario, e.id_espacio, 'ABC123', now() - interval '3 hours', now() - interval '150 minutes', 'EXPIRADA'
  FROM usuario u, espacio e JOIN parqueadero p USING (id_parqueadero)
 WHERE u.correo = 'cliente1@parkway.test' AND p.nombre = 'Sede Chapinero' AND e.codigo = 'A-02'
   AND now() - interval '3 hours' >= CURRENT_DATE
UNION ALL
SELECT u.id_usuario, e.id_espacio, 'XYZ78D', now() - interval '2 hours', now() - interval '90 minutes', 'CANCELADA'
  FROM usuario u, espacio e JOIN parqueadero p USING (id_parqueadero)
 WHERE u.correo = 'cliente2@parkway.test' AND p.nombre = 'Sede Chapinero' AND e.codigo = 'M-02'
   AND now() - interval '2 hours' >= CURRENT_DATE;


-- Bitácora de los movimientos de demostración
INSERT INTO transaccion (id_usuario, tipo_operacion, entidad, id_entidad, estado, fecha_inicio, fecha_fin, detalle)
SELECT r.id_operador_ingreso, 'INGRESO', 'registro_estacionamiento', r.id_registro::text, 'CONFIRMADA',
       r.fecha_ingreso, r.fecha_ingreso, jsonb_build_object('placa', r.placa, 'espacio', e.codigo)
  FROM registro_estacionamiento r JOIN espacio e USING (id_espacio)
UNION ALL
SELECT r.id_operador_salida, 'SALIDA', 'registro_estacionamiento', r.id_registro::text, 'CONFIRMADA',
       r.fecha_salida, r.fecha_salida, jsonb_build_object('placa', r.placa, 'minutos', r.minutos, 'valor', r.valor_calculado)
  FROM registro_estacionamiento r WHERE r.estado = 'CERRADO'
UNION ALL
SELECT r.id_cliente, 'RESERVA', 'reserva', r.id_reserva::text, 'CONFIRMADA',
       r.fecha_inicio, r.fecha_inicio, jsonb_build_object('placa', r.placa, 'espacio', e.codigo)
  FROM reserva r JOIN espacio e USING (id_espacio)
ORDER BY 6;

DROP TABLE demo_vehiculo;

COMMIT;

SELECT p.nombre AS sede, e.estado, count(*) AS espacios
  FROM espacio e JOIN parqueadero p USING (id_parqueadero)
 GROUP BY 1, 2 ORDER BY 1, 2;
