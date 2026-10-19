import { FORMATO_PLACA, normalizarPlaca } from "./ingresoValidator";

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

  const placa = normalizarPlaca(body.placa);
  if (!placa) errores.placa = "La placa es obligatoria";
  else if (formato && !formato.regex.test(placa)) errores.placa = `Formato inválido. Ejemplo: ${formato.ejemplo}`;

  const marca = texto(body.marca);
  const color = texto(body.color);
  if (marca.length > 40) errores.marca = "Máximo 40 caracteres";
  if (color.length > 20) errores.color = "Máximo 20 caracteres";

  if (Object.keys(errores).length) return { valido: false, errores };
  return { valido: true, errores: {}, datos: { placa, idTipo, marca: marca || undefined, color: color || undefined } };
}
