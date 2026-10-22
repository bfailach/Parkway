import { FORMATO_PLACA, normalizarPlaca, TIPOS_VEHICULO } from "./ingresoValidator";

/**
 * Validaciones de los datos que envía el cliente: creación de cuenta
 * (RF01) y registro de vehículos (RF04). Funciones puras, probadas en
 * tests/cliente.test.ts.
 */
type Resultado<T> = { valido: true; datos: T; errores: Record<string, never> } | { valido: false; errores: Record<string, string> };

const texto = (v: unknown) => String(v ?? "").trim();

export interface DatosCuenta {
  nombre: string;
  documento: string;
  correo: string;
  telefono?: string;
  contrasena: string;
}

export function validarCuenta(body: Record<string, unknown>): Resultado<DatosCuenta> {
  const errores: Record<string, string> = {};
  const nombre = texto(body.nombre).replace(/\s+/g, " ");
  const documento = texto(body.documento).replace(/[.\s]/g, "");
  const correo = texto(body.correo).toLowerCase();
  const telefono = texto(body.telefono).replace(/[\s-]/g, "");
  const contrasena = String(body.contrasena ?? "");

  if (nombre.length < 3) errores.nombre = "Escriba su nombre completo";
  else if (nombre.length > 100) errores.nombre = "Máximo 100 caracteres";

  if (!documento) errores.documento = "El documento es obligatorio";
  else if (!/^\d{5,12}$/.test(documento)) errores.documento = "Solo números, entre 5 y 12 dígitos";

  if (!correo) errores.correo = "El correo es obligatorio";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 120) errores.correo = "Correo inválido";

  if (telefono && !/^\+?\d{7,15}$/.test(telefono)) errores.telefono = "Teléfono inválido";

  if (contrasena.length < 8) errores.contrasena = "Mínimo 8 caracteres";
  else if (!/\d/.test(contrasena) || !/[A-Za-z]/.test(contrasena)) errores.contrasena = "Debe tener letras y números";

  if (Object.keys(errores).length) return { valido: false, errores };
  return { valido: true, errores: {}, datos: { nombre, documento, correo, telefono: telefono || undefined, contrasena } };
}

export interface DatosVehiculo {
  /** Vacía para las bicicletas: el código se genera al guardarla. */
  placa: string;
  idTipo: number;
  marca?: string;
  color?: string;
}

export function validarVehiculo(body: Record<string, unknown>): Resultado<DatosVehiculo> {
  const errores: Record<string, string> = {};
  const idTipo = Number(body.idTipo);
  const formato = FORMATO_PLACA[idTipo];
  if (!Number.isInteger(idTipo) || !formato) errores.idTipo = "Seleccione el tipo de vehículo";

  // Las bicicletas no tienen placa: el sistema les asigna un código.
  const esBicicleta = idTipo === TIPOS_VEHICULO.BICICLETA;
  const placa = esBicicleta ? "" : normalizarPlaca(body.placa);
  if (!esBicicleta && !placa) errores.placa = "La placa es obligatoria";
  else if (!esBicicleta && formato && !formato.regex.test(placa)) errores.placa = `Formato inválido. Ejemplo: ${formato.ejemplo}`;

  // Las bicicletas no llevan marca.
  const marca = idTipo === TIPOS_VEHICULO.BICICLETA ? "" : texto(body.marca);
  const color = texto(body.color);
  if (marca.length > 40) errores.marca = "Máximo 40 caracteres";
  if (color.length > 20) errores.color = "Máximo 20 caracteres";

  if (Object.keys(errores).length) return { valido: false, errores };
  return { valido: true, errores: {}, datos: { placa, idTipo, marca: marca || undefined, color: color || undefined } };
}

// ---------------------------------------------------------------------
// Preferencias de notificación del cliente
// ---------------------------------------------------------------------
export interface PreferenciasNotificacion {
  activas: boolean;
  navegador: boolean;
  /** Cada cuántos minutos se avisa el tiempo y el valor (0 = nunca). */
  cadaMinutos: number;
  /** Avisar cuando el valor acumulado pase de este monto (null = nunca). */
  montoAviso: number | null;
  /** Minutos antes del vencimiento de la reserva para avisar (0 = nunca). */
  minutosAntesReserva: number;
  /** Avisar cuando el vehículo entra o sale. */
  alEntrarSalir: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasNotificacion = {
  activas: true,
  navegador: false,
  cadaMinutos: 30,
  montoAviso: null,
  minutosAntesReserva: 10,
  alEntrarSalir: true,
};

const CADA_MINUTOS = [0, 15, 30, 60, 120];
const ANTES_RESERVA = [0, 5, 10, 15];

export function validarPreferencias(body: Record<string, unknown>): Resultado<PreferenciasNotificacion> {
  const errores: Record<string, string> = {};
  const b: Record<string, unknown> = { ...PREFERENCIAS_POR_DEFECTO, ...body };
  if (typeof b.activas !== "boolean") errores.activas = "Valor inválido";
  if (typeof b.navegador !== "boolean") errores.navegador = "Valor inválido";
  if (typeof b.alEntrarSalir !== "boolean") errores.alEntrarSalir = "Valor inválido";
  const cada = Number(b.cadaMinutos);
  if (!CADA_MINUTOS.includes(cada)) errores.cadaMinutos = "Elija una frecuencia de la lista";
  const antes = Number(b.minutosAntesReserva);
  if (!ANTES_RESERVA.includes(antes)) errores.minutosAntesReserva = "Elija una opción de la lista";
  let monto: number | null = null;
  if (b.montoAviso !== null && b.montoAviso !== undefined && b.montoAviso !== "") {
    monto = Number(b.montoAviso);
    if (!Number.isInteger(monto) || monto < 1000 || monto > 1000000) errores.montoAviso = "Entre $1.000 y $1.000.000";
  }
  if (Object.keys(errores).length) return { valido: false, errores };
  return {
    valido: true,
    errores: {},
    datos: {
      activas: b.activas as boolean,
      navegador: b.navegador as boolean,
      cadaMinutos: cada,
      montoAviso: monto,
      minutosAntesReserva: antes,
      alEntrarSalir: b.alEntrarSalir as boolean,
    },
  };
}
