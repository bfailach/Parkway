-- =====================================================================
-- Parkway (STGP) - Datos iniciales de prueba
-- Ejecutar después de schema.sql:
--   psql -d parkway -f seed.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Usuarios (contraseña de ejemplo ya "hasheada" con un valor de prueba;
-- en el backend real se debe generar con bcrypt u otro algoritmo seguro)
-- ---------------------------------------------------------------------
INSERT INTO usuario (nombre, documento, correo, telefono, contrasena_hash, rol, turno, estado)
VALUES
    ('Admin General',      '1000000001', 'admin@parkway.test',    '3000000001', 'hash_demo_admin',    'ADMINISTRADOR', 'DIA',   'ACTIVO'),
    ('Carlos Operador',    '1000000002', 'operador1@parkway.test','3000000002', 'hash_demo_operador1','OPERADOR',      'DIA',   'ACTIVO'),
    ('Laura Operadora',    '1000000003', 'operador2@parkway.test','3000000003', 'hash_demo_operador2','OPERADOR',      'NOCHE', 'ACTIVO'),
    ('Juan Cliente',       '1000000004', 'cliente1@parkway.test', '3000000004', 'hash_demo_cliente1', 'CLIENTE',       NULL,    'ACTIVO'),
    ('Maria Cliente',      '1000000005', 'cliente2@parkway.test', '3000000005', 'hash_demo_cliente2', 'CLIENTE',       NULL,    'ACTIVO');

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
    ('XYZ789', (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'MOTOCICLETA'),
        (SELECT id_usuario FROM usuario WHERE correo = 'cliente2@parkway.test'), 'Yamaha', 'Negro'),
    ('JKL456', (SELECT id_tipo FROM tipo_vehiculo WHERE nombre = 'AUTOMOVIL'),
        NULL, 'Renault', 'Blanco'); -- vehículo de visitante, sin cliente registrado

-- ---------------------------------------------------------------------
-- Espacios (algunos por sede y tipo)
-- ---------------------------------------------------------------------
INSERT INTO espacio (id_parqueadero, id_tipo, codigo, estado)
SELECT p.id_parqueadero, t.id_tipo, codigo, 'LIBRE'
FROM (
    VALUES
        ('Sede Chapinero', 'AUTOMOVIL',   'A-01'),
        ('Sede Chapinero', 'AUTOMOVIL',   'A-02'),
        ('Sede Chapinero', 'MOTOCICLETA', 'M-01'),
        ('Sede Zona T',    'AUTOMOVIL',   'A-01'),
        ('Sede Zona T',    'BICICLETA',   'B-01')
) AS datos (nombre_sede, nombre_tipo, codigo)
JOIN parqueadero p ON p.nombre = datos.nombre_sede
JOIN tipo_vehiculo t ON t.nombre = datos.nombre_tipo;

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
