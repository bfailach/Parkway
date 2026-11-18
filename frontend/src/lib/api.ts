/**
 * Cliente HTTP de la API de Parkway.
 * Adjunta el token de sesión y convierte las respuestas de error en
 * ApiError con el mensaje y los errores por campo que envía el backend.
 */
export type Rol = "CLIENTE" | "OPERADOR" | "ADMINISTRADOR";

export interface Usuario {
  id_usuario: number;
  nombre: string;
  rol: Rol;
  correo?: string;
  turno?: string | null;
}

export interface Horario {
  /** 1 = lunes ... 7 = domingo */
  dia: number;
  abre: string;
  cierra: string;
}

export interface TarifaSede {
  id_parqueadero?: number;
  id_tipo: number;
  valor_hora: number;
  valor_fraccion: number;
  valor_dia: number;
}

export interface Parqueadero {
  id_parqueadero: number;
  nombre: string;
  direccion: string;
  ciudad?: string;
  latitud?: number | null;
  longitud?: number | null;
  capacidad_total: number;
  horarios?: Horario[];
  abierto?: boolean;
  estado_horario?: string;
  tarifas?: TarifaSede[];
}

export interface EstadoHorario {
  abierto: boolean;
  minutosParaCerrar: number | null;
  mensaje: string;
  horarios: Horario[];
}

export interface VehiculoRegistrado {
  placa: string;
  id_tipo: number;
  tipo: string;
  marca: string | null;
  color: string | null;
  cliente: string | null;
  telefono: string | null;
  dentro: boolean;
}

export interface FiltrosHistorial {
  idParqueadero: number;
  placa?: string;
  idTipo?: number;
  marca?: string;
  color?: string;
  desde?: string;
  hasta?: string;
  minutosMin?: number;
  minutosMax?: number;
  valorMin?: number;
  valorMax?: number;
  orden?: "fecha" | "valor" | "tiempo";
}

export interface HistorialVehiculo {
  placa: string;
  id_tipo: number;
  tipo: string;
  marca: string | null;
  color: string | null;
  cliente: string | null;
  visitas: number;
  minutos_total: number;
  valor_total: number;
  ultima_salida: string;
}

export interface PreferenciasNotificacion {
  activas: boolean;
  navegador: boolean;
  cadaMinutos: number;
  montoAviso: number | null;
  minutosAntesReserva: number;
  alEntrarSalir: boolean;
}

export interface Operador {
  id_usuario: number;
  nombre: string;
  correo: string;
  turno: string | null;
  estado: string;
  sedes: number[];
}

export type EstadoUsuario = "ACTIVO" | "INACTIVO" | "BLOQUEADO";

/** Usuario tal como lo ve el administrador (RF02). */
export interface UsuarioAdmin {
  id_usuario: number;
  nombre: string;
  documento: string | null;
  correo: string;
  telefono: string | null;
  rol: Rol;
  turno: "DIA" | "NOCHE" | null;
  estado: EstadoUsuario;
  fecha_creacion: string;
  /** Sedes asignadas (solo operadores). */
  sedes: number[];
}

export interface DatosUsuario {
  nombre: string;
  documento: string;
  correo: string;
  telefono?: string;
  rol: Rol;
  turno?: string;
  estado: EstadoUsuario;
  /** Obligatoria al crear; al editar solo si se cambia. */
  contrasena?: string;
  sedes?: number[];
}

export interface SedeAdmin extends Parqueadero {
  pisos: number;
  espacios: Record<string, number>;
  /** Espacios por tipo en cada piso: [0] es el piso 1. */
  espacios_por_piso: Record<string, number>[];
  fuera_de_servicio: number;
  ocupados: number;
  horarios: Horario[];
  tarifas: TarifaSede[];
  /** Certificación Sello Oro (cambia el tope tarifario del Decreto 026 de 2026). */
  sello_oro?: boolean;
  operadores: number[];
  lista_espacios?: { id_espacio: number; codigo: string; piso?: number; estado: EspacioMapa["estado"]; id_tipo: number; tipo: string }[];
}

export interface DatosSede {
  nombre: string;
  direccion: string;
  ciudad: string;
  latitud: number | null;
  longitud: number | null;
  pisos: number;
  espaciosPorPiso: Record<number, number>[];
  tarifas: { idTipo: number; valor_hora: number; valor_fraccion: number; valor_dia: number }[];
  horarios: Horario[];
  operadores: number[];
  selloOro?: boolean;
}

/** Tope del Decreto 026 de 2026 por tipo de vehículo y certificación. */
export interface TopeTarifario {
  id_tipo: number;
  tipo: string;
  sello_oro: boolean;
  valor_minuto: number;
  norma: string;
  maximos: { valor_hora: number; valor_fraccion: number; valor_dia: number };
}

export interface TarifaFueraDeTope {
  id_parqueadero: number;
  sede: string;
  id_tipo: number;
  problema: string;
}

export interface TipoVehiculo {
  id_tipo: number;
  nombre: string;
  valor_hora: number | null;
  valor_fraccion: number | null;
  valor_dia: number | null;
  /** Tope legal por minuto (Decreto 026 de 2026), cuando se pidió con la sede. */
  tope_minuto?: number | null;
}

export interface ResumenTipo {
  id_tipo: number;
  tipo: string;
  total: number;
  libres: number;
  ocupados: number;
  reservados: number;
  fuera_de_servicio: number;
}

export interface Resumen {
  idParqueadero: number;
  actualizado: string;
  totales: { total: number; libres: number; ocupados: number; fuera_de_servicio: number };
  porTipo: ResumenTipo[];
}

export interface EspacioMapa {
  id_espacio: number;
  codigo: string;
  /** Piso del espacio (1 en las sedes de un solo piso). */
  piso?: number;
  estado: "LIBRE" | "RESERVADO" | "OCUPADO" | "FUERA_DE_SERVICIO";
  id_tipo: number;
  tipo: string;
  id_registro: number | null;
  placa: string | null;
  fecha_ingreso: string | null;
  id_reserva?: number | null;
  reserva_vence?: string | null;
  marca?: string | null;
  color?: string | null;
  cliente?: string | null;
}

export interface Registro {
  id_registro: number;
  placa: string;
  fecha_ingreso: string;
  fecha_salida: string | null;
  minutos: number | null;
  valor_calculado: number | null;
  estado: "ABIERTO" | "CERRADO";
  codigo_espacio: string;
  id_tipo: number;
  tipo: string;
  marca: string | null;
  color: string | null;
  operador_ingreso: string;
  operador_salida: string | null;
  valor_hora: number;
  valor_fraccion: number;
  valor_dia: number;
  /** Tope legal por minuto: el cobro nunca lo supera (Decreto 026 de 2026). */
  tope_minuto?: number | null;
  /** Ingreso registrado por el cliente con QR, y si el operador ya lo verificó. */
  por_qr?: boolean;
  qr_verificado?: boolean;
  /** Dueño del vehículo, si tiene cuenta. */
  cliente?: string | null;
  minutos_transcurridos?: number;
  valor_estimado?: number | null;
  id_reserva?: number | null;
  sede?: string;
  // RF08: pago vigente del registro (el aprobado o, si no hay, el último)
  id_pago?: number | null;
  comprobante?: string | null;
  metodo_pago?: MetodoPago | null;
  estado_pago?: EstadoPago | null;
  recibido?: number | null;
  cambio?: number | null;
  referencia?: string | null;
}

export type MetodoPago = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA";
export type EstadoPago = "PENDIENTE" | "APROBADO" | "RECHAZADO" | "ANULADO";

export interface DatosPago {
  metodo: MetodoPago;
  recibido?: number;
  referencia?: string;
}

/** Pago con su comprobante, como lo ve el administrador (RF08 y RF09). */
export interface Pago {
  id_pago: number;
  id_registro: number;
  metodo: MetodoPago;
  monto: number;
  referencia: string | null;
  recibido: number | null;
  cambio: number | null;
  estado: EstadoPago;
  fecha_pago: string;
  motivo_anulacion: string | null;
  fecha_anulacion: string | null;
  anulado_por: string | null;
  comprobante: string | null;
  placa: string;
  fecha_ingreso: string;
  fecha_salida: string | null;
  minutos: number | null;
  valor_calculado: number;
  codigo_espacio: string;
  id_parqueadero: number;
  sede: string;
  tipo: string;
  operador: string;
  /** true si el registro no tiene ningún pago aprobado (se puede cobrar de nuevo). */
  sin_pago_vigente: boolean;
}

export interface TotalesPagos {
  porMetodo: { metodo: MetodoPago; pagos: number; total: number; anulados: number; total_anulado: number }[];
  total: number;
  pagos: number;
  anulados: number;
  totalAnulado: number;
}

export interface VehiculoCliente {
  placa: string;
  id_tipo: number;
  tipo: string;
  marca: string | null;
  color: string | null;
  dentro: boolean;
  con_reserva: boolean;
  /** Dónde está: sede, espacio y piso del ingreso abierto o de la reserva. */
  sede: string | null;
  espacio: string | null;
  piso: number | null;
  fecha_ingreso: string | null;
  reserva_vence: string | null;
}

export interface Reserva {
  id_reserva: number;
  placa: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "ACTIVA" | "CUMPLIDA" | "CANCELADA" | "EXPIRADA";
  id_espacio: number;
  codigo_espacio: string;
  id_parqueadero: number;
  sede: string;
  tipo: string;
}

export interface EstadoCliente {
  ahora: string;
  minutosReserva: number;
  dentro: (Registro & { sede: string })[];
  reservas: Reserva[];
}

export interface ReservaSede {
  id_reserva: number;
  placa: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: Reserva["estado"];
  id_espacio: number;
  codigo_espacio: string;
  id_tipo: number;
  tipo: string;
  cliente: string;
  telefono: string | null;
  marca: string | null;
  color: string | null;
}

export interface FilaBitacora {
  id_transaccion: number;
  tipo_operacion: string;
  entidad: string;
  id_entidad: string | null;
  estado: "INICIADA" | "CONFIRMADA" | "REVERTIDA";
  fecha_inicio: string;
  fecha_fin: string | null;
  detalle: Record<string, unknown> | null;
  id_usuario: number;
  usuario: string;
  rol: Rol;
}

export interface DatosCuenta {
  nombre: string;
  documento: string;
  correo: string;
  telefono?: string;
  contrasena: string;
  /** Ley 1581 de 2012: autorización obligatoria para crear la cuenta. */
  aceptaTratamiento?: boolean;
  /** Finalidad opcional: comunicaciones sobre sedes y novedades. */
  aceptaComunicaciones?: boolean;
}

export interface PoliticaDatos {
  version: string;
  vigenteDesde: string;
  responsable: string;
  contacto: string;
  datosQueSeRecogen: string[];
  datosSensibles: string;
  finalidades: { codigo: string; obligatoria: boolean; descripcion: string }[];
  usoEstadistico: string;
  derechos: string[];
  plazos: string;
}

export interface Consentimientos {
  versionPolitica: string;
  vigentes: { finalidad: string; obligatoria: boolean; descripcion: string; otorgado: boolean | null; fecha: string | null }[];
  historial: { finalidad: string; otorgado: boolean; version_politica: string; origen: string; fecha: string }[];
  /** false si la base aún no tiene la migración de autorizaciones. */
  registroDisponible?: boolean;
}

export interface QrSede {
  sede: number;
  nombre: string;
  url: string;
  svg: string;
  expira: string;
}

/** Entrada o salida de un vehículo, para el historial de movimientos. */
export interface Movimiento {
  id_registro: number;
  movimiento: "ENTRADA" | "SALIDA";
  fecha: string;
  placa: string;
  codigo_espacio: string;
  tipo: string;
  marca: string | null;
  color: string | null;
  registrado_por: string | null;
  valor: number | null;
  minutos: number | null;
  estado: string;
}

/** Movimiento de una sede para los avisos del personal. */
export interface ActividadPersonal {
  id: number;
  operacion: string;
  fecha: string;
  /** Registro, reserva, pago o espacio afectado. */
  id_entidad: string | null;
  placa: string | null;
  tipo: string | null;
  marca: string | null;
  color: string | null;
  /** Ingreso con QR ya verificado por el operador. */
  verificado: boolean;
  estado_registro: string | null;
  espacio: string | null;
  actor: string | null;
  rol_actor: string | null;
  origen: string | null;
  valor: number | null;
  estado_espacio: string | null;
  motivo: string | null;
  /** Corrección de ingreso o de cobro: lo que estaba registrado antes. */
  placa_anterior?: string | null;
  tipo_anterior?: string | null;
  devolucion?: number | null;
}

/** Lo que otros hicieron sobre los vehículos y reservas del cliente. */
export interface ActividadCliente {
  id: number;
  operacion: "EXPIRACION" | "ANULAR_PAGO" | "COBRO_NUEVO" | "ANULAR_INGRESO" | "CORREGIR_INGRESO" | "CORREGIR_COBRO" | "RESPONDER_RECLAMO";
  id_entidad: string | null;
  fecha: string;
  placa: string | null;
  espacio: string | null;
  sede: string | null;
  motivo: string | null;
  placa_anterior?: string | null;
  tipo?: string | null;
  tipo_anterior?: string | null;
  valor_hora?: number | null;
  valor?: number | null;
  devolucion?: number | null;
  /** Respuesta a un reclamo: RESUELTO o RECHAZADO. */
  resultado?: "RESUELTO" | "RECHAZADO" | null;
  respuesta?: string | null;
}

/** Placa y tipo correctos de un vehículo mal registrado. */
export interface DatosCorreccion {
  placa: string;
  idTipo: number;
  marca?: string;
  color?: string;
  motivo: string;
}

export interface Reclamo {
  id_reclamo: number;
  id_registro: number;
  motivo: string;
  estado: "PENDIENTE" | "RESUELTO" | "RECHAZADO";
  respuesta: string | null;
  fecha_creacion: string;
  fecha_respuesta: string | null;
  placa: string;
  id_tipo: number;
  tipo: string;
  minutos: number | null;
  valor: number | null;
  fecha_ingreso: string;
  fecha_salida: string | null;
  sede: string;
  id_parqueadero: number;
  cliente: string;
  administrador: string | null;
}

export interface SimulacionCobro {
  minutos: number;
  valor_anterior: number;
  valor: number;
  devolucion: number;
  permitido: boolean;
}

export interface CorreccionCobro {
  placa: string;
  placa_anterior: string;
  tipo: string;
  tipo_anterior: string;
  valor_anterior: number;
  valor: number;
  devolucion: number;
  metodo: MetodoPago | null;
  comprobante: string | null;
}

export interface InfoQr {
  sede: number;
  nombre: string;
  direccion: string | null;
  expira: string;
  vehiculos: VehiculoCliente[];
  /** Pase de 5 minutos para confirmar el ingreso (el QR solo vale 2 minutos). */
  pase: string;
}

export interface TotalesDia {
  ingresos_hoy: number;
  salidas_hoy: number;
  recaudo_hoy: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public campos: Record<string, string> = {}) {
    super(message);
  }
}

const TOKEN_KEY = "parkway.token";

export const sesion = {
  token: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  guardar: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* almacenamiento no disponible */
    }
  },
  borrar: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

let alExpirar: () => void = () => {};
export const onSesionExpirada = (fn: () => void) => {
  alExpirar = fn;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = sesion.token();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor. Verifique que el backend esté en ejecución.");
  }

  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) alExpirar();
    throw new ApiError(res.status, data.error || `Error ${res.status}`, data.detalles || {});
  }
  return data as T;
}

/**
 * Descarga un archivo de la API (por ejemplo, un reporte en CSV) con el
 * token de la sesión y lo guarda con el nombre que manda el servidor.
 */
async function descargar(path: string, nombrePorDefecto: string): Promise<void> {
  const token = sesion.token();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) alExpirar();
    throw new ApiError(res.status, data.error || `Error ${res.status}`, data.detalles || {});
  }
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? nombrePorDefecto;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") p.set(k, String(v));
  });
  return p.toString();
};

export interface EntradasRed {
  hora: number;
  dia: number;
  festivo: boolean;
  ocupacionActual: number;
  ocupacionSemanaAnterior: number;
  reservas: number;
}

export interface Prediccion {
  idParqueadero: number;
  idTipo: number | null;
  capacidad: number;
  ocupacionActual: number;
  ocupacionEstimada: number;
  nivel: "NORMAL" | "ALTA" | "CRITICA";
  alerta: boolean;
  horaObjetivo: string;
  entradas: EntradasRed & { vector: number[]; sinHistorico: boolean };
  modelo: { nombre: string; maeValidacion: number };
  alternativa?: { idParqueadero: number; nombre: string; ocupacionEstimada: number } | null;
}

/** Ocupación esperada en cada una de las próximas 24 horas (RF15, Prophet). */
export interface HoraPronostico {
  fecha: string;
  hora: string;
  estimada: number;
  prophet?: number;
  inferior: number;
  superior: number;
  abierta: boolean;
}

export interface Pronostico {
  idParqueadero: number;
  disponible: boolean;
  mensaje?: string;
  horas: HoraPronostico[];
  resumen: {
    mejorHora: { hora: string; estimada: number } | null;
    pico: { hora: string; estimada: number } | null;
    horasCriticas: number;
  } | null;
  ocupacionActual: number | null;
  redProximaHora: { hora: string; estimada: number } | null;
  corregida: boolean;
  modelo: {
    nombre: string;
    entrenado: string;
    fuente: "REAL" | "SIMULADA";
    mape: number | null;
    maePp: number | null;
    cobertura: number | null;
    intervalo: number;
    desactualizado: boolean;
  } | null;
}

// Reportes (RF13)
export type TipoReporte = "ocupacion" | "rotacion" | "ingresos";
export interface FiltrosReporte {
  idParqueadero?: number;
  idTipo?: number;
  desde: string;
  hasta: string;
  agrupacion?: "dia" | "semana" | "mes";
}

export interface FranjaHoraria {
  hora: number;
  promedio: number;
  promedioLaboral: number | null;
  promedioLibre: number | null;
  maximo: number;
  llegadasPromedio: number;
  dias: number;
}
export interface ReporteOcupacion {
  capacidad: number;
  filas: FranjaHoraria[];
  resumen: {
    ocupacionPromedio: number;
    horaPico: { hora: number; promedio: number } | null;
    maximo: { fecha: string; hora: number; ocupacion: number } | null;
    llegadas: number;
    horasAnalizadas: number;
  };
}

export interface RotacionEspacio {
  id_espacio: number;
  codigo: string;
  sede: string;
  tipo: string;
  piso: number;
  estado: string;
  usos: number;
  minutos_ocupado: number;
  ingresos: number;
  porcentajeOcupado: number;
  rotacionDiaria: number;
}
export interface ReporteRotacion {
  filas: RotacionEspacio[];
  resumen: {
    espacios: number;
    usos: number;
    rotacionPromedio: number;
    masUsado: { codigo: string; sede: string; usos: number } | null;
    sinUso: number;
    ocupadoPromedio: number;
    dias: number;
  };
}

export interface FilaIngresos {
  periodo: string;
  nombre: string;
  id_parqueadero: number;
  sede: string;
  salidas: number;
  valor: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  minutos_promedio: number | null;
}
export interface ReporteIngresos {
  filas: FilaIngresos[];
  resumen: {
    valor: number;
    salidas: number;
    ticketPromedio: number | null;
    permanenciaPromedio: number | null;
    mejorPeriodo: { nombre: string; valor: number } | null;
    porSede: { sede: string; salidas: number; valor: number }[];
    porMetodo: { efectivo: number; tarjeta: number; transferencia: number };
    dias: number;
  };
}

export interface RedNeuronal {
  modelo: string;
  W1: number[][];
  b1: number[];
  w2: number[];
  b2: number;
  umbralAlerta: number;
  datos: string;
  entrenado: string;
  metricas: {
    mae_pp: number;
    mae_ingenuo_pp: number;
    mae_persistencia_pp: number;
    parametros: number;
    filas_entrenamiento: number;
    filas_validacion: number;
  };
}

export const api = {
  login: (correo: string, contrasena: string) =>
    request<{ token: string; usuario: Usuario }>("POST", "/auth/login", { correo, contrasena }),
  me: () => request<Usuario>("GET", "/auth/me"),
  registro: (datos: DatosCuenta) => request<{ token: string; usuario: Usuario }>("POST", "/auth/registro", datos),
  // Inicio de sesión con Google: el Client ID es público y viene del servidor (GOOGLE_CLIENT_ID).
  configuracionGoogle: () => request<{ clientId: string | null }>("GET", "/auth/google/configuracion"),
  google: (d: { credencial: string; aceptaTratamiento?: boolean; aceptaComunicaciones?: boolean }) =>
    request<{ token: string; usuario: Usuario }>("POST", "/auth/google", d),
  // Ley 1581 de 2012: aviso de privacidad y autorizaciones del usuario
  politicaDatos: () => request<PoliticaDatos>("GET", "/politica-datos"),
  consentimientos: () => request<Consentimientos>("GET", "/usuarios/me/consentimientos"),
  cambiarConsentimiento: (finalidad: string, otorgado: boolean) =>
    request<Consentimientos>("POST", "/usuarios/me/consentimientos", { finalidad, otorgado }),
  // Entrada con QR: código de la sede para la portería
  qrIngreso: (idParqueadero: number) => request<QrSede>("GET", `/estacionamiento/qr-ingreso?idParqueadero=${idParqueadero}`),
  verificarQr: (idRegistro: number, coincide: boolean, motivo?: string) =>
    request<{ id_registro: number; placa: string; codigo_espacio: string; coincide: boolean }>("POST", `/estacionamiento/qr/${idRegistro}/verificar`, { coincide, motivo }),
  corregirIngreso: (idRegistro: number, d: DatosCorreccion) => request<Registro>("POST", `/estacionamiento/registros/${idRegistro}/corregir`, d),
  actividad: (idParqueadero: number, desde: string) =>
    request<ActividadPersonal[]>("GET", `/estacionamiento/actividad?idParqueadero=${idParqueadero}&desde=${encodeURIComponent(desde)}`),
  cliente: {
    actividad: (desde: string) => request<ActividadCliente[]>("GET", `/cliente/actividad?desde=${encodeURIComponent(desde)}`),
    infoQr: (token: string) => request<InfoQr>("GET", `/cliente/ingreso-qr/${encodeURIComponent(token)}`),
    ingresoQr: (pase: string, placa: string) => request<Registro>("POST", "/cliente/ingreso-qr", { pase, placa }),
    estado: () => request<EstadoCliente>("GET", "/cliente/estado"),
    historial: () => request<(Registro & { sede: string })[]>("GET", "/cliente/historial"),
    vehiculos: () => request<VehiculoCliente[]>("GET", "/cliente/vehiculos"),
    agregarVehiculo: (v: { placa?: string; idTipo: number; marca?: string; color?: string }) =>
      request<VehiculoCliente>("POST", "/cliente/vehiculos", v),
    quitarVehiculo: (placa: string) => request<void>("DELETE", `/cliente/vehiculos/${encodeURIComponent(placa)}`),
    reservas: () => request<Reserva[]>("GET", "/cliente/reservas"),
    reservar: (placa: string, idParqueadero: number) => request<Reserva>("POST", "/cliente/reservas", { placa, idParqueadero }),
    cancelarReserva: (id: number) => request<Reserva>("POST", `/cliente/reservas/${id}/cancelar`),
    preferencias: () => request<PreferenciasNotificacion>("GET", "/cliente/preferencias"),
    guardarPreferencias: (p: PreferenciasNotificacion) => request<PreferenciasNotificacion>("PUT", "/cliente/preferencias", p),
    reclamos: () => request<Reclamo[]>("GET", "/cliente/reclamos"),
    reclamar: (d: { idRegistro?: number; comprobante?: string; motivo: string }) => request<{ id_reclamo: number }>("POST", "/cliente/reclamos", d),
  },
  topes: () => request<TopeTarifario[]>("GET", "/topes-tarifarios"),
  admin: {
    revisionTopes: () => request<TarifaFueraDeTope[]>("GET", "/topes-tarifarios/revision"),
    sedes: () => request<SedeAdmin[]>("GET", "/admin/parqueaderos"),
    sede: (id: number) => request<SedeAdmin>("GET", `/admin/parqueaderos/${id}`),
    crearSede: (d: DatosSede) => request<SedeAdmin>("POST", "/admin/parqueaderos", d),
    editarSede: (id: number, d: DatosSede) => request<SedeAdmin>("PUT", `/admin/parqueaderos/${id}`, d),
    estadoEspacio: (id: number, estado: "LIBRE" | "FUERA_DE_SERVICIO") => request<void>("PATCH", `/admin/espacios/${id}`, { estado }),
    operadores: () => request<Operador[]>("GET", "/admin/operadores"),
    usuarios: (f: { q?: string; rol?: string; estado?: string }) => request<UsuarioAdmin[]>("GET", `/admin/usuarios?${qs(f)}`),
    crearUsuario: (d: DatosUsuario) => request<UsuarioAdmin>("POST", "/admin/usuarios", d),
    editarUsuario: (id: number, d: DatosUsuario) => request<UsuarioAdmin>("PUT", `/admin/usuarios/${id}`, d),
    pagos: (f: { desde: string; hasta: string; idParqueadero?: number; metodo?: string; estado?: string; q?: string }) =>
      request<{ pagos: Pago[]; totales: TotalesPagos }>("GET", `/admin/pagos?${qs(f as Record<string, string | number | undefined>)}`),
    anularPago: (id: number, motivo: string) => request<Pago>("POST", `/admin/pagos/${id}/anular`, { motivo }),
    cobrarDeNuevo: (idRegistro: number, pago: DatosPago) => request<Pago>("POST", `/admin/registros/${idRegistro}/pago`, pago),
    simularCobro: (idRegistro: number, idTipo: number) => request<SimulacionCobro>("GET", `/admin/registros/${idRegistro}/simular-cobro?idTipo=${idTipo}`),
    corregirCobro: (idRegistro: number, d: DatosCorreccion & { idReclamo?: number }) =>
      request<CorreccionCobro>("POST", `/admin/registros/${idRegistro}/corregir-cobro`, d),
    reclamos: (estado?: string) => request<Reclamo[]>("GET", `/admin/reclamos${estado ? `?estado=${estado}` : ""}`),
    responderReclamo: (id: number, estado: "RESUELTO" | "RECHAZADO", respuesta: string) =>
      request<unknown>("POST", `/admin/reclamos/${id}/responder`, { estado, respuesta }),
    reporte: <T,>(tipo: TipoReporte, f: FiltrosReporte) =>
      request<T>("GET", `/admin/reportes/${tipo}?${qs(f as unknown as Record<string, string | number | undefined>)}`),
    descargarReporte: (tipo: TipoReporte, f: FiltrosReporte) =>
      descargar(`/admin/reportes/${tipo}?${qs({ ...(f as unknown as Record<string, string | number | undefined>), formato: "csv" })}`, `parkway_${tipo}.csv`),
    estadoUsuario: (id: number, estado: EstadoUsuario) => request<UsuarioAdmin>("PATCH", `/admin/usuarios/${id}/estado`, { estado }),
  },
  parqueaderos: () => request<Parqueadero[]>("GET", "/catalogos/parqueaderos"),
  misSedes: () => request<Parqueadero[]>("GET", "/estacionamiento/mis-sedes"),
  horario: (id: number) => request<EstadoHorario>("GET", `/catalogos/parqueaderos/${id}/horario`),
  prediccion: (id: number, idTipo?: number) =>
    request<Prediccion>("GET", `/catalogos/parqueaderos/${id}/prediccion?${qs({ idTipo })}`),
  pronostico: (id: number) => request<Pronostico>("GET", `/catalogos/parqueaderos/${id}/pronostico`),
  redNeuronal: () => request<RedNeuronal>("GET", "/catalogos/red-neuronal"),
  tiposVehiculo: (idParqueadero?: number) => request<TipoVehiculo[]>("GET", `/catalogos/tipos-vehiculo?${qs({ idParqueadero })}`),
  buscarVehiculos: (q: string, idTipo?: number) => request<VehiculoRegistrado[]>("GET", `/estacionamiento/vehiculos?${qs({ q, idTipo })}`),
  vehiculo: (placa: string) => request<VehiculoRegistrado>("GET", `/estacionamiento/vehiculos/${encodeURIComponent(placa)}`),
  resumen: (idParqueadero: number) => request<Resumen>("GET", `/estacionamiento/resumen?${qs({ idParqueadero })}`),
  plano: (idParqueadero: number) => request<EspacioMapa[]>("GET", `/estacionamiento/plano?${qs({ idParqueadero })}`),
  espacios: (idParqueadero: number) => request<EspacioMapa[]>("GET", `/estacionamiento/espacios?${qs({ idParqueadero })}`),
  totalesDia: (idParqueadero: number) => request<TotalesDia>("GET", `/estacionamiento/totales-dia?${qs({ idParqueadero })}`),
  activos: (idParqueadero: number, placa?: string) =>
    request<Registro[]>("GET", `/estacionamiento/activos?${qs({ idParqueadero, placa })}`),
  historial: (f: FiltrosHistorial) =>
    request<Registro[]>("GET", `/estacionamiento/historial?${qs(f as unknown as Record<string, string | number | undefined>)}`),
  historialPorVehiculo: (f: FiltrosHistorial) =>
    request<HistorialVehiculo[]>("GET", `/estacionamiento/historial?${qs({ ...(f as unknown as Record<string, string | number | undefined>), agrupar: "vehiculo" })}`),
  movimientos: (f: FiltrosHistorial) =>
    request<Movimiento[]>("GET", `/estacionamiento/historial?${qs({ ...(f as unknown as Record<string, string | number | undefined>), agrupar: "movimientos" })}`),
  reservasSede: (idParqueadero: number) => request<ReservaSede[]>("GET", `/estacionamiento/reservas?${qs({ idParqueadero })}`),
  bitacora: (f: { idUsuario?: string; tipo?: string; entidad?: string; idEntidad?: string; estado?: string; desde?: string; hasta?: string }) =>
    request<{ filas: FilaBitacora[]; tipos: string[]; entidades: string[]; usuarios: { id_usuario: number; nombre: string; rol: Rol }[] }>(
      "GET",
      `/admin/bitacora?${qs(f)}`
    ),
  ingreso: (datos: { placa?: string; idTipo: number; idParqueadero: number; idEspacio?: number; marca?: string; color?: string; generarCodigo?: boolean }) =>
    request<Registro>("POST", "/estacionamiento/ingreso", datos),
  salida: (idRegistro: number, pago: DatosPago) => request<Registro>("POST", `/estacionamiento/salida/${idRegistro}`, pago),
};
