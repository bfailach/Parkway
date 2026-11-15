# Pruebas de los requerimientos no funcionales

Resultados de las pruebas de concurrencia (RNF03), carga (RNF02) y
cobertura (RNF07), con los criterios de aceptación del documento maestro.
Se ejecutaron el 15 de noviembre de 2026 sobre el backend compilado
(`npm run build && npm start`), con PostgreSQL 16 en el mismo equipo
(2 núcleos Intel Xeon de 2,1 GHz y 8 GB de RAM) y la base cargada con
`schema.sql`, `seed.sql` y `demo.sql` (12 semanas de historia, unos 6.400
registros y pagos).

| Requerimiento | Criterio | Resultado | Estado |
| --- | --- | --- | --- |
| RNF03 Concurrencia | 50 ingresos simultáneos sobre 10 espacios: 10 aceptados, 40 rechazados, sin espacios duplicados | 10 aceptados, 40 rechazados con 409, 10 espacios distintos, bitácora con 10 confirmados y 40 revertidos | Cumple |
| RNF02 Rendimiento | Con 100 usuarios concurrentes, p95 de consultas < 2 s y de ingresos < 3 s | p95 de consultas 11 ms, de ingresos 37 ms, 0 errores en 26.600 solicitudes | Cumple |
| RNF07 Mantenibilidad | Cobertura de pruebas de al menos 60 % en la capa de servicios | 95,6 % de líneas, 84,4 % de ramas y 88,8 % de funciones, con 105 pruebas | Cumple |

## RNF03: concurrencia

```bash
cd backend
npm run prueba:concurrencia            # 50 solicitudes sobre 10 espacios
npm run prueba:concurrencia -- 200 30  # variante más exigente
```

El script crea la "Sede Prueba RNF03" con 10 espacios de automóvil la
primera vez y la deja libre en las siguientes. Luego:

1. Envía 50 ingresos simultáneos de placas distintas.
2. Verifica que se aceptaron 10 y se rechazaron 40 con código 409, que los
   10 aceptados quedaron en espacios distintos y que la bitácora tiene 10
   ingresos confirmados y 40 revertidos.
3. Da salida a los 10 vehículos a la vez, cada uno con su pago, y verifica
   que cada salida recibió su propio comprobante.
4. Envía 20 cobros simultáneos de la misma salida y verifica que solo uno
   se acepta (idempotencia de RF08).

```
Ingresos: 10 aceptados, 40 rechazados, 0 con otro código, en 225 ms
Espacios asignados: A-01, A-02, A-03, A-04, A-05, A-06, A-07, A-08, A-09, A-10
Bitácora: 10 confirmados, 40 revertidos
Salidas con pago: 10; cobros simultáneos aceptados: 1 de 20

CUMPLE     50 ingresos simultáneos sobre 10 espacios: se aceptan 10
CUMPLE     Se rechazan 40 con 409
CUMPLE     Ningún espacio queda con dos vehículos
CUMPLE     La bitácora tiene 10 ingresos confirmados y 40 revertidos
CUMPLE     Las 10 salidas simultáneas se cobran, cada una con su comprobante
CUMPLE     20 cobros simultáneos de la misma salida dejan un solo pago
```

Con 200 ingresos sobre 30 espacios también cumple los seis criterios: 30
aceptados y 170 rechazados en 586 ms.

**Cómo lo garantiza el sistema.** Cada ingreso toma el espacio con
`SELECT ... FOR UPDATE SKIP LOCKED`: el primero bloquea un espacio y los
demás saltan al siguiente libre, sin esperar. Cuando ya no hay espacios, la
transacción se revierte y queda en la bitácora como REVERTIDA. En la salida,
la fila del registro se bloquea con `FOR UPDATE`, y un índice único parcial
(`ux_pago_aprobado_por_registro`) impide dos pagos aprobados para el mismo
registro aunque dos solicitudes lleguen al mismo tiempo.

**Defecto encontrado y corregido.** La primera corrida con salidas
simultáneas falló: algunas salidas tardaban 10 segundos y respondían 500.
Dentro de la transacción de salida, la verificación de acceso del operador
pedía una segunda conexión al pool, que tiene 10. Con 10 salidas a la vez,
cada una retenía su conexión y esperaba otra que nunca llegaba. Ahora la
verificación usa la misma conexión de la transacción
(`accesoService.verificarAcceso(usuario, sede, client)`). Revisamos los demás
servicios y ningún otro pide una conexión nueva dentro de una transacción.

## RNF02: carga

```bash
cd backend
npm run build && npm start             # en una terminal
npm run prueba:carga                   # en otra: 100 usuarios durante 60 s
npm run prueba:carga -- 300 30         # variante: 300 usuarios durante 30 s
```

Simula 100 usuarios a la vez durante un minuto:

- **80 usuarios consultan la disponibilidad** como lo hace la aplicación:
  cupos por tipo, plano de la sede y espacios libres, con una pausa de 0,2 a
  1 segundo. De vez en cuando piden la predicción de la red neuronal (10 %)
  y el pronóstico de 24 horas (5 %).
- **20 operadores trabajan en la portería** de la "Sede Prueba RNF02" (600
  espacios en 4 pisos): registran ingresos y, un momento después, la salida
  con su pago en efectivo o transferencia. Al terminar, el script da salida
  a los vehículos que quedaron dentro.

| Operación | Solicitudes | Errores | p50 | p95 | p99 | Máximo |
| --- | --- | --- | --- | --- | --- | --- |
| Consulta | 25.020 | 0 | 3 ms | 11 ms | 56 ms | 394 ms |
| Ingreso | 820 | 0 | 14 ms | 37 ms | 506 ms | 519 ms |
| Salida con pago | 760 | 0 | 11 ms | 26 ms | 43 ms | 71 ms |

26.600 solicitudes en 62 segundos, unas 430 por segundo.

**Margen.** Con 300 usuarios durante 30 segundos también cumple: p95 de 113
ms en consultas y de 874 ms en ingresos, sin errores, a 1.150 solicitudes
por segundo.

**Limitaciones.** El cliente de la prueba corre en el mismo equipo que el
servidor y la base de datos, así que no incluye la latencia de la red.
Desde Bogotá hasta Render (región de Ohio) hay que sumar unos 80 a 120 ms
por solicitud. Además, el plan gratuito de Render tiene menos CPU que este
equipo y apaga el servicio tras 15 minutos sin uso: la primera solicitud
después de una pausa tarda 30 a 50 segundos. Conviene abrir la aplicación
unos minutos antes de la sustentación.

**No ejecute estas pruebas contra la base de producción**: crean las sedes
"Sede Prueba RNF02" y "Sede Prueba RNF03" con su historial. Están pensadas
para una base local.

## RNF07: cobertura

```bash
cd backend
npm test                    # 66 pruebas unitarias, sin base de datos
npm run test:integracion    # 39 pruebas de integración contra PostgreSQL
npm run cobertura           # las 105 y la cobertura de src/services; falla si baja de 60 %
```

Las **pruebas unitarias** (`tests/*.test.ts`) cubren las funciones puras:
tarifas, placas, validaciones de usuarios, pagos, reportes y filtros, CSV,
horarios, pronóstico, tiempo real y red neuronal.

Las **pruebas de integración** (`tests/integracion/`) llaman a los servicios
reales contra una base de datos de prueba, `parkway_test`, que se reconstruye
desde `schema.sql` y `seed.sql` antes de cada archivo. Por seguridad solo
corren sobre una base cuyo nombre termine en `_test`. Cubren:

- **Portería:** ingreso, primer espacio libre, bicicletas, sede llena, acceso
  por sede, salida con pago en los tres medios, cambio, efectivo
  insuficiente, referencia repetida, anulación, nuevo cobro, cierre de caja
  e historial.
- **Cliente:** registro de la cuenta e inicio de sesión, vehículos, reservas
  (crear, cumplir al llegar, cancelar, expirar), sede cerrada, estado,
  historial con comprobante y preferencias de notificación.
- **Administración:** crear y editar sedes, espacios fuera de servicio,
  usuarios y sus reglas (último administrador, inactivar con reserva), los
  tres reportes cuadrados contra los pagos, horario, predicción con alerta y
  sede alternativa, y pronóstico.

| Servicio | Líneas | Ramas | Funciones |
| --- | --- | --- | --- |
| accesoService | 100,0 % | 88,9 % | 100,0 % |
| authService | 100,0 % | 85,7 % | 100,0 % |
| clienteService | 95,0 % | 87,2 % | 97,5 % |
| estacionamientoService | 95,2 % | 81,7 % | 100,0 % |
| horarioService | 94,7 % | 84,6 % | 89,3 % |
| pagoService | 94,6 % | 88,7 % | 100,0 % |
| parqueaderoService | 92,8 % | 89,0 % | 100,0 % |
| prediccionService | 97,0 % | 77,6 % | 88,1 % |
| reporteService | 97,6 % | 79,1 % | 59,2 % |
| tarifaService | 100,0 % | 87,5 % | 83,3 % |
| usuarioService | 96,2 % | 87,7 % | 100,0 % |
| **Total** | **95,6 %** | **84,4 %** | **88,8 %** |

El porcentaje de funciones de `reporteService` es más bajo porque cada
columna del CSV es una función pequeña, y no todas se ejecutan en las
pruebas.

**En GitHub.** El flujo `.github/workflows/pruebas.yml` compila el backend y
corre las 105 pruebas con su cobertura en cada push a `main`, con un
PostgreSQL 16 propio. Si una prueba falla o la cobertura baja de 60 %, el
flujo queda en rojo.
