import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import * as usuarioRepository from "../repositories/usuarioRepository";
import { badRequest, unauthorized, forbidden } from "../errors/AppError";
import { JWT_SECRET, UsuarioToken } from "../middlewares/auth";
import { validarCuenta } from "../validators/clienteValidator";

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
  const token = jwt.sign(payload, JWT_SECRET(), {
    expiresIn: (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"],
  });
  return { token, usuario: { ...payload, correo: usuario.correo, turno: usuario.turno } };
}

/** Creación de cuenta de cliente. Inicia la sesión al terminar. */
export async function registrarCliente(body: Record<string, unknown>) {
  const v = validarCuenta(body);
  if (!v.valido) throw badRequest("Revise los campos del formulario", v.errores);
  const hash = await bcrypt.hash(v.datos.contrasena, 10);
  const usuario = await usuarioRepository.crearCliente({ ...v.datos, hash });
  return emitirSesion(usuario);
}
