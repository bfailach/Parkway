-- Los scripts están en UTF-8. En Windows, psql usa por defecto la
-- codificación de la consola (WIN1252) y dañaría las tildes ("BogotÃ¡").
SET client_encoding = 'UTF8';
-- Las fechas se guardan en hora de Bogotá, la misma que usa el backend.
SET TIME ZONE 'America/Bogota';

-- =====================================================================
-- Parkway - Datos de demostración (opcional)
-- Ejecutar después de schema.sql y seed.sql para ver el parqueadero con
-- vehículos dentro y un historial del día:
--   psql -d parkway -f demo.sql
--
-- Ocupa cerca del 60 % de los espacios con ingresos abiertos de las
-- últimas 4 horas y registra salidas cerradas durante el día.
-- Se puede ejecutar varias veces: primero limpia los movimientos.
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

-- Visitas de los últimos 7 días, para probar los filtros del historial.
-- Incluye algunas del carro del cliente de prueba (ABC123).
WITH visitas AS (
    SELECT s.n AS g,
           CASE WHEN s.n % 9 = 0 THEN 'ABC123' ELSE dv.placa END AS placa,
           CASE WHEN s.n % 9 = 0 THEN 1 ELSE dv.id_tipo END AS id_tipo,
           1 + s.n % 2 AS id_parqueadero,
           15 + (s.n * 47) % 420 AS minutos,
           date_trunc('day', now()) - ((1 + s.n % 7) * interval '1 day')
             + ((6 * 60 + (s.n * 71) % (14 * 60)) * interval '1 minute') AS ingreso
      FROM generate_series(1, 90) AS s (n)
      JOIN demo_vehiculo dv ON dv.g = 1 + (s.n * 13) % 120
),
con_espacio AS (
    SELECT v.*, (SELECT e.id_espacio FROM espacio e
                  WHERE e.id_parqueadero = v.id_parqueadero AND e.id_tipo = v.id_tipo
                  ORDER BY md5(e.id_espacio::text || v.g) LIMIT 1) AS id_espacio
      FROM visitas v
)
INSERT INTO registro_estacionamiento
    (placa, id_espacio, id_tarifa, id_operador_ingreso, id_operador_salida,
     fecha_ingreso, fecha_salida, minutos, valor_calculado, estado)
SELECT c.placa, c.id_espacio, ta.id_tarifa,
       (SELECT id_usuario FROM usuario WHERE correo = 'operador1@parkway.test'),
       (SELECT id_usuario FROM usuario WHERE correo = 'operador2@parkway.test'),
       c.ingreso, c.ingreso + c.minutos * interval '1 minute', c.minutos,
       LEAST((c.minutos / 60) * ta.valor_hora + ceil((c.minutos % 60) / 15.0) * ta.valor_fraccion, ta.valor_dia),
       'CERRADO'
  FROM con_espacio c
  JOIN tarifa ta ON ta.id_tipo = c.id_tipo AND ta.id_parqueadero = c.id_parqueadero AND ta.activa
 WHERE c.id_espacio IS NOT NULL;

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
