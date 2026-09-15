# Parkway

En la mayoría de parqueaderos el conductor llega sin saber si hay cupo, y el personal administrativo lleva el control de entradas y salidas en planillas o de memoria. Esto produce filas innecesarias, espacios asignados dos veces y una disponibilidad que nadie conoce con certeza.

ParkFlow resuelve esto con una fuente única de verdad: la base de datos garantiza que un espacio no pueda ocuparse dos veces, y los cambios se propagan a todos los clientes conectados en el momento en que ocurren.

Características
Disponibilidad en tiempo real — los tableros se actualizan vía WebSocket cuando entra o sale un vehículo, sin recargar ni hacer polling.
Asignación sin duplicados — la exclusividad de cada espacio está garantizada por una restricción en la base de datos, no por lógica de aplicación.
Registro de entradas y salidas — con cálculo automático de permanencia y tarifa.
Roles diferenciados — vista de consulta para usuarios y panel de control para administradores.
Multi-parqueadero — el modelo soporta varias sedes desde el diseño inicial.
Historial y reportes — ocupación por franja horaria, rotación por espacio, ingresos por periodo.

## 1. Tecnología

| Elemento | Valor |
|---|---|
| Frontend | React / TypeScript |
| Backend | Node.js |
| Base de datos | PostgreSQL |
| Arquitectura | Cliente – Servidor – Nodos distribuidos |

