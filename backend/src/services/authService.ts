import bcrypt from "bcryptjs";
import { SignOptions } from "jsonwebtoken";
import { firmarToken } from "../distribuido/llaves";
import { pool } from "../db/pool";
import { leerAutorizacion, registrarAlCrearCuenta } from "./consentimientoService";
import * as usuarioRepository from "../repositories/usuarioRepository";
import { badRequest, unauthorized, forbidden } from "../errors/AppError";
import { JWT_SECRET, UsuarioToken } from "../middlewares/auth";
import { validarCuenta } from "../validators/clienteValidator";
import * as google from "./googleService";

/** CU01 / RF01 - Iniciar sesión. */
export async function iniciarSesion(correo: unknown, contrasena: unknown) {
  const errores: Record<string, string> = {};
  const c = String(correo ?? "").trim();
  const p = String(contrasena ?? "");
  if (!c) errores.correo = "El correo es obligatorio";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) errores.correo = "Correo inválido";
  if (!p) errores.contrasena = "La contraseña es obligatoria";
  if (Object.keys(errores).length) throw badRequest("Revise los campos del formulario", errores);

  const usuario = await usuarioRepository.buscarPorCorreo(c);
  // Mismo mensaje si el correo no existe o la contraseña falla, para no
  // revelar qué correos están registrados.
  if (!usuario || !(await bcrypt.compare(p, usuario.contrasena_hash))) {
    throw unauthorized("Correo o contraseña incorrectos");
  }
  if (usuario.estado !== "ACTIVO") throw forbidden("El usuario está inactivo o bloqueado");

  return emitirSesion(usuario);
}

function emitirSesion(usuario: { id_usuario: number; nombre: string; rol: UsuarioToken["rol"]; correo: string; turno: string | null }) {
  const payload: UsuarioToken = { id_usuario: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.rol };
  const token = firmarToken(payload, JWT_SECRET(), (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"]);
  return { token, usuario: { ...payload, correo: usuario.correo, turno: usuario.turno } };
}

/** Creación de cuenta de cliente. Inicia la sesión al terminar. */
export async function registrarCliente(body: Record<string, unknown>) {
  const v = validarCuenta(body);
  if (!v.valido) {
    const errores = { ...v.errores };
    if (body.aceptaTratamiento !== true) errores.aceptaTratamiento = "Debe autorizar el tratamiento de sus datos para crear la cuenta";
    throw badRequest("Revise los campos del formulario", errores);
  }
  // Ley 1581 de 2012: sin autorización expresa no se crea la cuenta.
  const autorizacion = leerAutorizacion(body);
  const hash = await bcrypt.hash(v.datos.contrasena, 10);
  // La cuenta y la autorización se guardan en una sola transacción.
  const client = await pool.connect();
  let usuario;
  try {
    await client.query("BEGIN");
    usuario = await usuarioRepository.crearCliente({ ...v.datos, hash }, client);
    await registrarAlCrearCuenta(client, usuario.id_usuario, autorizacion);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  return emitirSesion(usuario);
}

/** Inicio de sesión o creación de cuenta con Google (ver googleService). */
export function ingresarConGoogle(body: Record<string, unknown>) {
  return google.ingresarConGoogle(body, emitirSesion) as Promise<ReturnType<typeof emitirSesion>>;
}

/** Client ID público para el botón de Google; null si no está configurado. */
export const configuracionGoogle = () => ({ clientId: google.clienteGoogle() });
