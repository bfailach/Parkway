-- =====================================================================
-- Parkway (STGP) - Datos iniciales de prueba
-- Ejecutar después de schema.sql:
--   psql -d parkway -f seed.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Usuarios
-- Las contraseñas se guardan con bcrypt (pgcrypto: crypt + gen_salt('bf')).
-- El backend las verifica con bcryptjs. Credenciales de prueba:
--   admin@parkway.test      / Admin123*
--   operador1@parkway.test  / Operador123*
--   operador2@parkway.test  / Operador123*
--   cliente1@parkway.test   / Cliente123*
--   cliente2@parkway.test   / Cliente123*
-- ---------------------------------------------------------------------
INSERT INTO usuario (nombre, documento, correo, telefono, contrasena_hash, rol, turno, estado)
VALUES
    ('Admin General',   '1000000001', 'admin@parkway.test',     '3000000001', crypt('Admin123*',    gen_salt('bf', 10)), 'ADMINISTRADOR', 'DIA',   'ACTIVO'),
    ('Carlos Operador', '1000000002', 'operador1@parkway.test', '3000000002', crypt('Operador123*', gen_salt('bf', 10)), 'OPERADOR',      'DIA',   'ACTIVO'),
    ('Laura Operadora', '1000000003', 'operador2@parkway.test', '3000000003', crypt('Operador123*', gen_salt('bf', 10)), 'OPERADOR',      'NOCHE', 'ACTIVO'),
    ('Juan Cliente',    '1000000004', 'cliente1@parkway.test',  '3000000004', crypt('Cliente123*',  gen_salt('bf', 10)), 'CLIENTE',       NULL,    'ACTIVO'),
    ('Maria Cliente',   '1000000005', 'cliente2@parkway.test',  '3000000005', crypt('Cliente123*',  gen_salt('bf', 10)), 'CLIENTE',       NULL,    'ACTIVO');

-- ---------------------------------------------------------------------
-- Tipos de vehículo
-- ---------------------------------------------------------------------
INSERT INTO tipo_vehiculo (nombre) VALUES
    ('AUTOMOVIL'),
    ('MOTOCICLETA'),
    ('BICICLETA');

-- ---------------------------------------------------------------------
-- Parqueaderos (sedes)
-- ---------------------------------------------------------------------
INSERT INTO parqueadero (nombre, direccion, capacidad_total) VALUES
    ('Sede Chapinero', 'Calle 60 # 10-20, Bogotá', 40),
    ('Sede Zona T',    'Carrera 13 # 85-30, Bogotá', 25);

-- ---------------------------------------------------------------------
-- Vehículos
-- ---------------------------------------------------------------------
INSERT INTO vehiculo (placa, id_tipo, id_cliente, marca, color) VALUES
    ('ABC123', (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'AUTOMOVIL'),
        (SELECT id_usuario FROM usuario WHERE correo = 'cliente1@parkway.test'), 'Mazda',  'Gris'),
    ('XYZ78D', (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'MOTOCICLETA'),
        (SELECT id_usuario FROM usuario WHERE correo = 'cliente2@parkway.test'), 'Yamaha', 'Negro'),
    ('JKL456', (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'AUTOMOVIL'),
        NULL, 'Renault', 'Blanco'); -- vehículo de visitante, sin cliente registrado

-- ---------------------------------------------------------------------
-- Espacios
-- Se generan según la capacidad de cada sede:
--   Sede Chapinero (40): A-01..A-30 automóviles, M-01..M-10 motocicletas
--   Sede Zona T    (25): A-01..A-18 automóviles, M-01..M-04 motos, B-01..B-03 bicicletas
-- ---------------------------------------------------------------------
INSERT INTO espacio (id_parqueadero, id_tipo, codigo, estado)
SELECT p.id_parqueadero, t.id_tipo, d.prefijo || '-' || lpad(n::text, 2, '0'), 'LIBRE'
FROM (
    VALUES
        ('Sede Chapinero', 'AUTOMOVIL',   'A', 30),
        ('Sede Chapinero', 'MOTOCICLETA', 'M', 10),
        ('Sede Zona T',    'AUTOMOVIL',   'A', 18),
        ('Sede Zona T',    'MOTOCICLETA', 'M', 4),
        ('Sede Zona T',    'BICICLETA',   'B', 3)
) AS d (nombre_sede, nombre_tipo, prefijo, cantidad)
JOIN parqueadero p ON p.nombre = d.nombre_sede
JOIN tipo_vehiculo t ON t.nombre = d.nombre_tipo
CROSS JOIN LATERAL generate_series(1, d.cantidad) AS n;

-- Un espacio en mantenimiento para mostrar el estado FUERA_DE_SERVICIO
UPDATE espacio SET estado = 'FUERA_DE_SERVICIO'
WHERE codigo = 'A-30'
  AND id_parqueadero = (SELECT id_parqueadero FROM parqueadero WHERE nombre = 'Sede Chapinero');

-- ---------------------------------------------------------------------
-- Tarifas vigentes
-- ---------------------------------------------------------------------
INSERT INTO tarifa (id_tipo, valor_hora, valor_fraccion, valor_dia, vigente_desde, activa)
SELECT id_tipo, valor_hora, valor_fraccion, valor_dia, CURRENT_DATE, true
FROM (
    VALUES
        ('AUTOMOVIL',   4000, 1500, 30000),
        ('MOTOCICLETA', 2000, 800,  15000),
        ('BICICLETA',   1000, 400,  6000)
) AS datos (nombre_tipo, valor_hora, valor_fraccion, valor_dia)
JOIN tipo_vehiculo t ON t.nombre = datos.nombre_tipo;
