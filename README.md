# Parkway

En la mayoría de parqueaderos el conductor llega sin saber si hay cupo. El
personal lleva el control de entradas y salidas en planillas o de memoria, lo
que genera filas en la entrada, espacios asignados dos veces y una cifra de
disponibilidad que nadie sabe con certeza.

ParkFlow centraliza ese control. La base de datos impide que un espacio se
ocupe dos veces y los cambios se reflejan de inmediato en las pantallas de
consulta y en el panel del administrador.

## Características

- Consulta de cupos libres por parqueadero y por tipo de espacio.
- Registro de entrada con asignación automática de espacio.
- Registro de salida con cálculo de permanencia y tarifa.
- Actualización de la disponibilidad por WebSocket, sin recargar la página.
- Control de acceso por rol: consulta para usuarios, gestión para administradores.
- Soporte para varias sedes desde el mismo sistema.
- Reportes de ocupación por franja horaria, rotación por espacio e ingresos por periodo.

## Tecnología

| Elemento | Valor |
|---|---|
| Frontend | React / TypeScript |
| Backend | Node.js |
| Base de datos | PostgreSQL |
| Arquitectura | Cliente – Servidor – Nodos distribuidos |

