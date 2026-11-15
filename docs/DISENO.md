# Revisión de diseño (accesibilidad y uso en celular)

Revisión del 15 de noviembre de 2026 sobre las 18 pantallas de Parkway
(portada, ingreso, 5 del cliente y 11 del administrador), en escritorio
(1440 × 900) y en celular (360 × 780), con tema oscuro y claro: 72
combinaciones en total.

## Qué se revisó

| Criterio | Herramienta | Norma |
|---|---|---|
| Contraste de texto (4,5:1; 3:1 en texto grande) | axe-core 4.10 | WCAG 2.2 AA, 1.4.3 |
| Roles y atributos ARIA válidos | axe-core | WCAG 4.1.2 |
| Regiones con desplazamiento operables con teclado | axe-core | WCAG 2.1.1 |
| Estructura de listas de datos (`dl`) | axe-core | WCAG 1.3.1 |
| Nada se sale del ancho de la pantalla (sin barra lateral) | Medición en el navegador | WCAG 1.4.10 (reflow) |
| Objetivos táctiles de al menos 44 px | Medición en el navegador | WCAG 2.5.5, guías de Android e iOS |
| Texto de al menos 12 px | Medición en el navegador | Buena práctica |
| Errores de JavaScript en consola | Playwright | — |

## Hallazgos y correcciones

1. **Contraste de los botones azules (tema oscuro).** El texto blanco sobre
   `#2f7bea` daba 4,08:1. Se separó el azul de relleno (`--relleno`,
   `#2266cc`, 5,5:1) del azul de acento usado en bordes y barras.
2. **Texto tenue.** `--tinta-3` daba 3,2–4,0:1 en el tema oscuro y 3,7–4,2:1
   en el claro. Ahora es `#86909b` (oscuro) y `#565e68` (claro), por encima
   de 4,5:1 en todas las superficies.
3. **Filtro de pisos.** Los botones con `role="radio"` tenían
   `aria-selected`, que no corresponde a ese rol; se dejó `aria-checked`.
4. **Tablas con desplazamiento horizontal.** Ahora se pueden enfocar con el
   teclado y muestran una sombra en el borde cuando hay más columnas.
5. **Listas de datos en Pagos y Reportes.** Las notas eran `span` dentro de
   `dl`; ahora son `dd`.
6. **Celular: objetivos táctiles.** Botones de la barra, pestañas,
   segmentos, botones de tabla, enlaces y campos miden al menos 44 px de
   alto en pantallas táctiles; los campos usan letra de 16 px para que el
   celular no haga zoom al escribir.
7. **Celular: pestañas de secciones.** Un desvanecido en los bordes indica
   que la fila se puede deslizar.
8. **Celular: portada.** Un velo más fuerte detrás del texto de la primera
   pantalla asegura que se lea sobre la escena 3D en ambos temas.
9. **Celular: filtros.** Los campos ocupan el ancho disponible, de a dos por
   fila, igual en todas las pantallas.
10. **Celular: diagrama de la red neuronal.** Conserva un tamaño legible y se
    desliza en lugar de reducirse.
11. **Foco en los campos.** Además del cambio de borde, un anillo de 2 px.

## Resultado

Después de las correcciones, en las 72 combinaciones: 0 infracciones de
axe-core (WCAG 2.2 AA y buenas prácticas), 0 desbordes horizontales, 0
objetivos táctiles de menos de 40 px en celular y 0 errores en consola.

Quedan dos excepciones intencionales: la ciudad de la placa (11 px, imita
la placa real y no es información nueva) y algunas etiquetas secundarias
de las gráficas SVG (10–11 px en la escala del dibujo, con su valor también
en la tabla o el texto de al lado).
