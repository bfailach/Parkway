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

export interface Parqueadero {
  id_parqueadero: number;
  nombre: string;
  direccion: string;
  capacidad_total: number;
}

export interface TipoVehiculo {
  id_tipo: number;
  nombre: string;
  valor_hora: number | null;
  valor_fraccion: number | null;
  valor_dia: number | null;
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
  estado: "LIBRE" | "RESERVADO" | "OCUPADO" | "FUERA_DE_SERVICIO";
  id_tipo: number;
  tipo: string;
  id_registro: number | null;
  placa: string | null;
  fecha_ingreso: string | null;
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
  minutos_transcurridos?: number;
  valor_estimado?: number | null;
  id_reserva?: number | null;
  sede?: string;
}

export interface VehiculoCliente {
  placa: string;
  id_tipo: number;
  tipo: string;
  marca: string | null;
  color: string | null;
  dentro: boolean;
  con_reserva: boolean;
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

export interface DatosCuenta {
  nombre: string;
  documento: string;
  correo: string;
  telefono?: string;
  contrasena: string;
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

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") p.set(k, String(v));
  });
  return p.toString();
};

export const api = {
  login: (correo: string, contrasena: string) =>
    request<{ token: string; usuario: Usuario }>("POST", "/auth/login", { correo, contrasena }),
  me: () => request<Usuario>("GET", "/auth/me"),
  registro: (datos: DatosCuenta) => request<{ token: string; usuario: Usuario }>("POST", "/auth/registro", datos),
  cliente: {
    estado: () => request<EstadoCliente>("GET", "/cliente/estado"),
    historial: () => request<(Registro & { sede: string })[]>("GET", "/cliente/historial"),
    vehiculos: () => request<VehiculoCliente[]>("GET", "/cliente/vehiculos"),
    agregarVehiculo: (v: { placa: string; idTipo: number; marca?: string; color?: string }) =>
      request<VehiculoCliente>("POST", "/cliente/vehiculos", v),
    quitarVehiculo: (placa: string) => request<void>("DELETE", `/cliente/vehiculos/${encodeURIComponent(placa)}`),
    reservas: () => request<Reserva[]>("GET", "/cliente/reservas"),
    reservar: (placa: string, idParqueadero: number) => request<Reserva>("POST", "/cliente/reservas", { placa, idParqueadero }),
    cancelarReserva: (id: number) => request<Reserva>("POST", `/cliente/reservas/${id}/cancelar`),
  },
  parqueaderos: () => request<Parqueadero[]>("GET", "/catalogos/parqueaderos"),
  tiposVehiculo: () => request<TipoVehiculo[]>("GET", "/catalogos/tipos-vehiculo"),
  resumen: (idParqueadero: number) => request<Resumen>("GET", `/estacionamiento/resumen?${qs({ idParqueadero })}`),
  plano: (idParqueadero: number) => request<EspacioMapa[]>("GET", `/estacionamiento/plano?${qs({ idParqueadero })}`),
  espacios: (idParqueadero: number) => request<EspacioMapa[]>("GET", `/estacionamiento/espacios?${qs({ idParqueadero })}`),
  totalesDia: (idParqueadero: number) => request<TotalesDia>("GET", `/estacionamiento/totales-dia?${qs({ idParqueadero })}`),
  activos: (idParqueadero: number, placa?: string) =>
    request<Registro[]>("GET", `/estacionamiento/activos?${qs({ idParqueadero, placa })}`),
  historial: (f: { idParqueadero: number; placa?: string; desde?: string; hasta?: string }) =>
    request<Registro[]>("GET", `/estacionamiento/historial?${qs(f)}`),
  ingreso: (datos: { placa: string; idTipo: number; idParqueadero: number; idEspacio?: number; marca?: string; color?: string }) =>
    request<Registro>("POST", "/estacionamiento/ingreso", datos),
  salida: (idRegistro: number) => request<Registro>("POST", `/estacionamiento/salida/${idRegistro}`),
};
