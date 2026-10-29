# Frontend de Parkway

Aplicación web en React 18 con TypeScript y Vite. Tiene modo oscuro y claro,
con el azul de la señal de parqueadero como color de acción; el amarillo se
reserva para las placas. Una escena 3D hecha con Three.js dibuja la sede
como una maqueta flotante, con sus pisos, su rampa en espiral y cada plaza
con su estado real en la base de datos. Los vehículos entran y salen
animados cuando el operador registra cada movimiento.

## Contenido

- [Portada pública](#portada-pública)
- [Ingreso y creación de cuenta](#ingreso-y-creación-de-cuenta)
- [Pantallas del cliente](#pantallas-del-cliente)
- [Pantallas del operador](#pantallas-del-operador)
- [Pantallas del administrador](#pantallas-del-administrador)
- [Modo claro y accesibilidad](#modo-claro-y-accesibilidad)
- [En el celular](#en-el-celular)
- [Cómo está hecha la escena 3D](#cómo-está-hecha-la-escena-3d)
- [Organización del código](#organización-del-código)
- [Diseño y accesibilidad](#diseño-y-accesibilidad)

## Portada pública

La primera pantalla muestra la maqueta de la sede girando despacio y un
contador con los cupos libres en ese momento.

![Portada](capturas/01_portada.jpg)

**Cómo funciona.** Al hacer scroll, la cámara sigue a un carro de prueba
(placa PKW 026) por el flujo real: llega a la sede, la placa abre la barrera,
el sistema le asigna el primer espacio libre que existe en la base de datos en
ese momento y, al final, aparece el tiquete con el cobro.

| La placa abre la barrera | El sistema asigna el espacio | Sales y pagas lo justo |
| --- | --- | --- |
| ![Barrera](capturas/02_historia_barrera.jpg) | ![Plaza](capturas/03_historia_plaza.jpg) | ![Cobro](capturas/04_historia_cobro.jpg) |

**Cupos libres ahora** muestra los cupos por tipo de vehículo en cada sede
sobre la vista aérea del parqueadero. **Calcula cuánto pagas** usa las
tarifas vigentes y la misma regla de cobro del backend. El cierre invita al
personal a entrar al panel y a los clientes a crear su cuenta.

| Cupos libres ahora | Calculadora de tarifa | Cierre |
| --- | --- | --- |
| ![Cupos](capturas/05_cupos_en_vivo.jpg) | ![Tarifas](capturas/06_tarifas.jpg) | ![Cierre](capturas/07_cierre.jpg) |

## Ingreso y creación de cuenta

El ingreso es el mismo para todos los roles; después de iniciar sesión cada
uno ve solo sus pestañas. El cliente nuevo crea su cuenta con nombre,
documento, correo, teléfono y contraseña; cada campo se valida antes de
enviar y otra vez en el backend.

| Ingreso | Crear cuenta, con validación |
| --- | --- |
| ![Login](capturas/08_login.jpg) | ![Crear cuenta](capturas/09_crear_cuenta.jpg) |

## Pantallas del cliente

Pestañas: Mi parqueo, Mis vehículos, Cupos por sede, Mi historial y
Notificaciones.

- **Mi parqueo.** Si tiene una reserva, muestra el espacio, la cuenta
  regresiva de 30 minutos y el plano 3D con su plaza parpadeando en azul. Si
  su vehículo está dentro, muestra el espacio, el tiempo y el valor
  acumulado, que se actualiza cada segundo. Si no tiene nada activo, muestra
  el formulario para reservar con el horario de la sede. Si la sede está
  cerrada o cierra antes de que venza la reserva, el botón se desactiva y el
  backend también rechaza la reserva.
- **Mis vehículos.** Agrega placas con la validación por tipo. Marca y color
  se eligen de una lista con la opción "Otro" al final; las marcas cambian
  según sea carro o moto. Las bicicletas no tienen placa ni marca: al
  agregarlas, el sistema les da un código único (BICI001, BICI002...) que el
  cliente le dice al operador al llegar.
- **Cupos por sede.** El plano 3D de cada sede, sin placas de otros clientes.
- **Mi historial.** Visitas con su valor y reservas con su estado.
- **Notificaciones.** El cliente elige cada cuánto ver el tiempo y el valor
  acumulado de su vehículo, un tope de dinero para recibir un aviso, cuántos
  minutos antes avisar que vence la reserva y si quiere avisos de entrada y
  salida. Se guardan en su cuenta. Los avisos aparecen en la página y,
  si el cliente lo permite, también como notificaciones del navegador.

| Reserva activa | Mis vehículos | Cupos por sede |
| --- | --- | --- |
| ![Reserva](capturas/10_cliente_reserva.jpg) | ![Vehículos](capturas/11_cliente_vehiculos.jpg) | ![Cupos](capturas/12_cliente_cupos.jpg) |

| Bicicleta con su código | Notificaciones |
| --- | --- |
| ![Bicicleta](capturas/29_cliente_bicicleta.jpg) | ![Notificaciones](capturas/30_notificaciones.jpg) |

## Pantallas del operador

Pestañas: Disponibilidad, Registrar ingreso, En el parqueadero, Reservas e
Historial. El selector de sede muestra solo las sedes asignadas al operador.

**Registrar ingreso.** El campo de placa tiene la forma de una placa de
Bogotá y valida el formato según el tipo de vehículo. Al registrar, el
sistema asigna el espacio y "imprime" el tiquete.

| Validación de placa | Ingreso registrado |
| --- | --- |
| ![Validación](capturas/13_validacion_placa.jpg) | ![Ingreso](capturas/14_ingreso.jpg) |

Si la placa ya existe, el formulario dice de quién es el vehículo y llena la
marca y el color guardados; el operador puede cambiarlos. Para bicicletas, el
operador busca el código que dio el cliente; la lista muestra el color, el
dueño y si ya está dentro. Si la bicicleta llega sin registro, se le genera un
código al registrar el ingreso.

| Datos guardados del vehículo | Búsqueda de bicicleta |
| --- | --- |
| ![Datos guardados](capturas/25_ingreso_datos_guardados.jpg) | ![Bicicleta](capturas/26_ingreso_bicicleta.jpg) |

**Reservas.** Lista a los clientes que vienen en camino, con su teléfono, el
espacio apartado y el tiempo que les queda. El botón "Registrar ingreso" abre
el formulario con la placa y el tipo ya escritos, y el formulario avisa que
esa placa tiene reserva. Al registrar, el vehículo entra a su espacio
reservado y el tiquete lo indica.

| Reservas de la sede | Aviso de reserva | Ingreso con reserva |
| --- | --- | --- |
| ![Reservas](capturas/15_operador_reservas.jpg) | ![Aviso](capturas/16_aviso_reserva.jpg) | ![Ingreso con reserva](capturas/17_ingreso_con_reserva.jpg) |

**Disponibilidad.** Cupos por tipo, movimiento del día y el plano 3D, que se
gira con el mouse. En una sede de varios pisos, el filtro "Todos, Piso 1,
Piso 2..." deja ver un solo piso: los demás quedan translúcidos y la cámara
baja a la altura del piso elegido. El mismo filtro aplica al plano 2D, que
agrupa las plazas por piso. Al pasar sobre una plaza muestra su código y la placa; un
clic abre el detalle de la plaza, desde donde se registra la salida. La vista "Plano" muestra
en cada plaza la placa o el código de bicicleta del vehículo; al hacer clic se
abre el detalle con el vehículo, el dueño, la hora de ingreso, el valor hasta
ahora y el botón para registrar la salida.

| Disponibilidad | Salida desde el plano 3D | Salida registrada |
| --- | --- | --- |
| ![Disponibilidad](capturas/18_disponibilidad.jpg) | ![Salida 3D](capturas/19_salida_desde_3d.jpg) | ![Salida](capturas/20_salida.jpg) |

![Plano 2D con el detalle de una plaza](capturas/27_plano_detalle.jpg)

**Animación en tiempo real.** Cuando se registra un ingreso, el vehículo
aparece en el borde de la maqueta, espera a que se levante la talanquera,
sube por la rampa si su plaza está en otro piso y entra de frente a su
plaza. Cuando se registra la salida, sale de reversa, baja por la rampa y se
va por la talanquera de salida. Lo ve cualquier pantalla que tenga abierto
el plano, porque el plano se consulta cada 5 segundos.

| Solo el piso 1 | Un ingreso al piso 2, en cuatro momentos |
| --- | --- |
| ![Filtro de piso](capturas/37_filtro_piso.jpg) | ![Animación de ingreso](capturas/38_animacion_ingreso.jpg) |

**En el parqueadero** lista los vehículos dentro con su tiempo y valor
acumulado, y permite registrar la salida. **Historial** muestra las salidas
con filtros por placa o código, tipo de vehículo, marca, color, fechas, horas
de permanencia y valor pagado, y se puede ordenar por fecha, valor o tiempo.
La vista "Por vehículo" suma las visitas, el tiempo y el dinero de cada
vehículo.

| En el parqueadero | Historial |
| --- | --- |
| ![Activos](capturas/21_en_el_parqueadero.jpg) | ![Historial con filtros](capturas/28_historial_filtros.jpg) |

## Pantallas del administrador

Tiene las mismas pestañas del operador, en todas las sedes, más **Sedes** y
**Bitácora**.

**Sedes.** El administrador crea o edita cada sede con:

- nombre, dirección, ciudad y coordenadas;
- cantidad de pisos (de 1 a 6) y espacios de cada tipo de vehículo en cada
  piso; en los pisos 2 en adelante los códigos llevan el número del piso
  (2A-01 es el automóvil 01 del piso 2);
- tarifa (hora, fracción de 15 minutos y día) por tipo de vehículo;
- horario de atención por día de la semana, con atajos para 24 horas o lunes
  a sábado;
- los operadores que tienen acceso a la sede.

Mientras edita, la vista previa 3D se arma con los pisos y espacios del
formulario, con el mismo filtro de pisos.
En una sede existente, un clic sobre un espacio libre lo marca fuera de
servicio o lo habilita de nuevo.

| Lista de sedes | Editar una sede | Horario y operadores |
| --- | --- | --- |
| ![Sedes](capturas/31_sedes.jpg) | ![Editar](capturas/32_editar_sede.jpg) | ![Horario](capturas/33_horario_operadores.jpg) |

![Nueva sede de tres pisos](capturas/39_editor_pisos.jpg)

**Bitácora:** todas las
operaciones del sistema con su usuario, resultado y detalle, filtrables por
operación, resultado y fechas. Las operaciones revertidas muestran el motivo
del error.

![Bitácora](capturas/23_bitacora.jpg)

## Modo claro y accesibilidad

El botón de la luna cambia entre modo oscuro y claro; la escena 3D cambia
con él. El botón de accesibilidad abre un panel con tamaño del texto, alto
contraste, movimiento reducido, letra de lectura fácil, símbolos de estado en
el plano (para no depender solo del color) y plano 2D en lugar del 3D. Las
opciones se guardan en el navegador.

| Modo claro | Cliente en modo claro | Accesibilidad |
| --- | --- | --- |
| ![Modo claro](capturas/35_modo_claro.jpg) | ![Cliente claro](capturas/36_cliente_claro.jpg) | ![Accesibilidad](capturas/34_accesibilidad.jpg) |

## En el celular

La interfaz se adapta desde 360 px de ancho. En el teléfono, la cámara de la
portada se aleja para mostrar la maqueta completa y los textos pasan a una
sola columna.

![Celular](capturas/24_celular.jpg)

## Cómo está hecha la escena 3D

La escena no usa modelos descargados ni imágenes: todo se dibuja con código a
partir de los datos de la base. El estilo es el de una maqueta flotante
sobre un fondo liso, sin árboles, edificios ni paisaje: una base con bordes
redondeados, losas de concreto, asfalto gris, líneas amarillas, columnas con
franjas de peligro, barandas de concreto, una rampa en espiral y un núcleo
blanco de escaleras. La luz es de estudio, con sombras suaves y oclusión
ambiental para que las piezas se vean como objetos de una maqueta.

**La sede.** `three/layout.ts` convierte la lista de espacios en posiciones.
Cada piso se arma con carriles paralelos y una fila de plazas a cada lado,
con medidas por tipo de vehículo (carro 2,7 × 5,2 m). Al oeste corre la vía
de circulación, que une los carriles con la entrada al sur. Todos los pisos
comparten la huella del piso más largo; si la sede tiene más de un piso, la
rampa en espiral se ubica al suroeste y cada vuelta sube un piso. Si se
agregan espacios o pisos en la base, la maqueta crece sola.

**Los recorridos.** `three/rutas.ts` calcula el camino de cada vehículo como
una curva suave: desde el borde de la maqueta, por la talanquera, la vía de
circulación, la espiral (si hace falta) y el carril, hasta la plaza. La
salida empieza con un tramo en reversa. Los vehículos aceleran, frenan ante
la talanquera, se inclinan en la rampa y avisan su posición para que la
talanquera se levante cuando se acercan.

**Vehículos por marca.** Cada carro se construye extruyendo una silueta
lateral simplificada, al estilo de los íconos de carros de las apps de
transporte. `three/modelos.ts` asigna a cada marca la forma de su modelo más
conocido (por ejemplo, Renault con un compacto alto tipo Renault 4, Ford con
un fastback, Suzuki con un todoterreno pequeño) y toma el color guardado del
vehículo. Las motos también cambian de forma según la marca.

**Librerías.** Three.js dibuja en el navegador con WebGL. React Three Fiber
permite escribir la escena como componentes de React. Drei aporta el control
de cámara, las piezas redondeadas y las etiquetas sobre las plazas.
Postprocessing agrega la oclusión ambiental (N8AO) y, en modo oscuro, el
brillo de las luces.

**Datos.** La página consulta el estado de cada espacio cada 5 segundos
(`/api/estacionamiento/plano`, o `/espacios` para el personal, que incluye
placas). Cada espacio trae su piso.

| Archivo | Qué dibuja o calcula |
| --- | --- |
| `three/layout.ts` | Posición de cada plaza por piso, vía de circulación, rampa y base |
| `three/Estructura.tsx` | Base, acceso con talanqueras y caseta, losas, columnas, barandas, rampa en espiral y núcleo |
| `three/Plazas.tsx` | Líneas, testigo de estado (verde libre, rojo ocupado, azul reservado), conos fuera de servicio y vehículos |
| `three/rutas.ts` | Recorridos de entrada y salida y el movimiento de los vehículos |
| `three/Vehiculo.tsx` | Carros extruidos desde la silueta, motos y bicicletas; versión translúcida para los pisos atenuados |
| `three/modelos.ts` | Siluetas por marca y colores por nombre |
| `three/materiales.ts` | Materiales compartidos y su versión translúcida para el filtro de pisos |
| `three/tema.ts` | Paletas clara y oscura de la maqueta |
| `three/texturas.ts` | Placas y sombra difusa dibujadas en un canvas |
| `three/Escena.tsx` | Cámara, luces, fondo y efectos |
| `three/control.ts` | Estado compartido con la página, sin Three.js |

**Cámara.** Tiene cuatro modos: portada (vuelo lento con paralaje del mouse),
historia (sigue el scroll; si la plaza está bajo otro piso, la cámara baja y
sigue al carro entre losas), vivo (vista aérea) y panel (el usuario la gira y
selecciona plazas).

**Rendimiento.** La escena se descarga en un archivo aparte de unos 1,2 MB,
así que la página aparece primero. Si el equipo no soporta WebGL se muestra el
plano 2D, y si el sistema tiene activada la opción de reducir movimiento la
cámara no se mueve sola.

## Organización del código

```
frontend/src/
├── App.tsx                 # Rutas, sesión y pestañas por rol
├── pages/
│   ├── Portada.tsx         # Portada pública
│   ├── Login.tsx           # Ingreso y creación de cuenta
│   ├── Disponibilidad.tsx  # Cupos y plano 3D/2D
│   ├── Ingreso.tsx         # Registrar ingreso
│   ├── Activos.tsx         # Vehículos dentro y salida
│   ├── Reservas.tsx        # Reservas de la sede (personal)
│   ├── Historial.tsx       # Salidas registradas
│   ├── Bitacora.tsx        # Bitácora (administrador)
│   ├── admin/              # Sedes: crear y editar
│   └── cliente/            # Mi parqueo, Mis vehículos, Mi historial, Notificaciones
├── components/             # Placa, Tiquete, Selector, CampoOpciones, FiltroPisos, Apariencia, Notificador, diálogos
├── three/                  # Escena 3D
├── lib/
│   ├── api.ts              # Cliente HTTP y tipos de la API
│   ├── useConsulta.ts      # Consultas que se repiten cada N segundos
│   ├── tarifa.ts           # Regla de cobro (igual a la del backend)
│   ├── formato.ts          # Pesos, horas, duraciones y formatos de placa
│   ├── apariencia.ts       # Tema y opciones de accesibilidad
│   └── ruta.ts             # Rutas por hash (#/, #/ingresar, #/panel)
└── styles.css              # Estilos y variables de color
```

## Diseño y accesibilidad

- **Temas:** oscuro (por defecto) y claro, con un botón en el encabezado.
- **Colores:** fondo negro, azul `#2f7bea` para botones, enlaces y foco, y
  amarillo `#f5c518` solo para placas. En los planos, verde es libre, rojo
  ocupado y azul reservado.
- **Tipografía:** Big Shoulders Display para títulos, inspirada en los rótulos
  de parqueadero, y Barlow para el texto. Las dos se incluyen en el proyecto,
  así que la interfaz funciona sin internet.
- **Listas de selección propias** que siempre se abren hacia abajo y se
  manejan con teclado (flechas, Enter, Escape y letra inicial).
- **Accesibilidad:** foco visible, etiquetas en todos los campos, mensajes de
  error junto al campo, roles ARIA en listas y diálogos, y respeto por la
  opción de reducir movimiento.
- **Validación:** cada formulario valida antes de enviar y muestra los errores
  que devuelve el backend en el campo correspondiente.
