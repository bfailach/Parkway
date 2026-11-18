import crypto, { KeyObject } from "crypto";
import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { pool } from "../db/pool";
import { AppError, badRequest, forbidden, unauthorized } from "../errors/AppError";
import { leerAutorizacion, registrarAlCrearCuenta } from "./consentimientoService";
import * as usuarioRepository from "../repositories/usuarioRepository";

/**
 * Inicio de sesión con Google (Google Identity Services).
 *
 * 1. El navegador muestra el botón de Google y recibe un ID token (JWT RS256
 *    firmado por Google) con el correo, el nombre y el identificador "sub".
 * 2. El servidor verifica el token con las llaves públicas de Google (JWKS):
 *    firma, emisor (accounts.google.com), audiencia (nuestro Client ID),
 *    vencimiento y correo verificado. No se usa ningún secreto de Google.
 * 3. Si la cuenta existe (por "sub" o por correo) inicia la sesión con su rol.
 *    Si no existe, crea una cuenta de cliente, siempre con la autorización de
 *    datos de la Ley 1581 de 2012.
 * 4. Desde ahí la sesión es la de Parkway (JWT ES256), igual que con contraseña.
 *
 * Se activa con la variable GOOGLE_CLIENT_ID; sin ella el botón no aparece.
 */
export const clienteGoogle = () => process.env.GOOGLE_CLIENT_ID?.trim() || null;

const JWKS_GOOGLE = "https://www.googleapis.com/oauth2/v3/certs";
const EMISORES = ["accounts.google.com", "https://accounts.google.com"];

// Llaves públicas de Google en memoria, renovadas según su Cache-Control.
let llaves: { porKid: Map<string, KeyObject>; vence: number } | null = null;

async function llavesGoogle(): Promise<Map<string, KeyObject>> {
  if (llaves && llaves.vence > Date.now()) return llaves.porKid;
  const res = await fetch(JWKS_GOOGLE);
  if (!res.ok) throw new AppError(503, "No se pudo contactar a Google. Intente de nuevo.");
  const { keys } = (await res.json()) as { keys: (crypto.JsonWebKey & { kid: string })[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  const porKid = new Map(keys.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: "jwk" })]));
  llaves = { porKid, vence: Date.now() + maxAge * 1000 };
  return porKid;
}

/** Solo para pruebas: reemplaza las llaves de Google por unas propias. */
export function usarLlavesDePrueba(porKid: Map<string, KeyObject>) {
  llaves = { porKid, vence: Number.MAX_SAFE_INTEGER };
}

export interface IdentidadGoogle {
  sub: string;
  correo: string;
  nombre: string;
}

export async function verificarCredencial(credencial: unknown): Promise<IdentidadGoogle> {
  const clientId = clienteGoogle();
  if (!clientId) throw new AppError(404, "El inicio de sesión con Google no está habilitado");
  if (typeof credencial !== "string" || credencial.split(".").length !== 3) throw badRequest("Credencial de Google inválida");
  const kid = (jwt.decode(credencial, { complete: true })?.header as { kid?: string } | undefined)?.kid;
  const llave = kid ? (await llavesGoogle()).get(kid) : undefined;
  if (!llave) throw unauthorized("No se pudo verificar la cuenta de Google");
  let p: JwtPayload;
  try {
    p = jwt.verify(credencial, llave, { algorithms: ["RS256"], audience: clientId, issuer: EMISORES as [string, ...string[]] }) as JwtPayload;
  } catch {
    throw unauthorized("La sesión de Google venció o no es válida. Intente de nuevo.");
  }
  if (!p.sub || !p.email || p.email_verified !== true) throw unauthorized("La cuenta de Google no tiene un correo verificado");
  return { sub: String(p.sub), correo: String(p.email).toLowerCase(), nombre: String(p.name ?? p.email).slice(0, 100) };
}

/**
 * Inicia sesión o crea la cuenta de cliente. Para una cuenta nueva sin la
 * autorización de datos responde 409 con requiereAutorizacion: la pantalla
 * muestra las casillas y vuelve a enviar la misma credencial.
 */
export async function ingresarConGoogle(
  body: Record<string, unknown>,
  emitirSesion: (u: { id_usuario: number; nombre: string; rol: "CLIENTE" | "OPERADOR" | "ADMINISTRADOR"; correo: string; turno: string | null }) => unknown
) {
  const g = await verificarCredencial(body.credencial);
  const { rows } = await pool.query(
    `SELECT id_usuario, nombre, correo, rol, turno, estado, google_sub
       FROM usuario WHERE google_sub = $1 OR lower(correo) = $2
      ORDER BY (google_sub = $1) DESC LIMIT 1`,
    [g.sub, g.correo]
  );
  const existente = rows[0];
  if (existente) {
    if (existente.google_sub && existente.google_sub !== g.sub) throw unauthorized("Ese correo está vinculado a otra cuenta de Google");
    if (existente.estado !== "ACTIVO") throw forbidden("El usuario está inactivo o bloqueado");
    // Primer inicio con Google de una cuenta con contraseña: se vincula (el correo lo verificó Google).
    if (!existente.google_sub) await pool.query(`UPDATE usuario SET google_sub = $2 WHERE id_usuario = $1`, [existente.id_usuario, g.sub]);
    return emitirSesion(existente);
  }

  // Cuenta nueva: Ley 1581 de 2012, sin autorización expresa no se crea.
  if (body.aceptaTratamiento !== true) {
    throw new AppError(409, "Para crear tu cuenta con Google autoriza el tratamiento de tus datos", {
      aceptaTratamiento: "Debe autorizar el tratamiento de sus datos para crear la cuenta",
      nombre: g.nombre,
      correo: g.correo,
    });
  }
  const autorizacion = leerAutorizacion(body);
  // La cuenta no tiene contraseña propia: se guarda un hash aleatorio que no sirve para entrar.
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const nuevo = await usuarioRepository.crearCliente({ nombre: g.nombre, documento: null as unknown as string, correo: g.correo, hash }, client);
    await client.query(`UPDATE usuario SET google_sub = $2 WHERE id_usuario = $1`, [nuevo.id_usuario, g.sub]);
    await registrarAlCrearCuenta(client, nuevo.id_usuario, autorizacion);
    await client.query("COMMIT");
    return emitirSesion(nuevo);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
