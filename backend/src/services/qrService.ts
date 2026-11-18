import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { badRequest, conflict, forbidden, notFound } from "../errors/AppError";
import { pool } from "../db/pool";
import { JWT_SECRET, UsuarioToken } from "../middlewares/auth";
import * as catalogoRepository from "../repositories/catalogoRepository";
import * as vehiculoRepository from "../repositories/vehiculoRepository";
import { verificarAcceso } from "./accesoService";
import { registrarIngreso } from "./estacionamientoService";
import { normalizarPlaca } from "../validators/ingresoValidator";

/**
 * Entrada con QR (autoservicio del cliente).
 *
 * El operador o el administrador genera el QR de su sede y lo muestra en la
 * portería. El QR lleva un enlace con un token firmado (HMAC-SHA256) que
 * dice a qué sede pertenece y hasta cuándo vale. El cliente lo escanea con
 * la cámara del celular, inicia sesión, elige uno de sus vehículos y el
 * sistema registra el ingreso con la misma transacción que usa el operador
 * (bloqueo por placa, asignación del espacio o de su reserva, bitácora y
 * evento de dominio).
 *
 * El token del QR se firma con una llave distinta a la de las sesiones, así
 * que no sirve como token de sesión ni al revés.
 *
 * Seguridad: el QR vale solo 2 minutos (QR_MINUTOS) y la pantalla del
 * operador lo renueva sola. Así una foto del código no sirve para registrar
 * el ingreso desde otro lugar más tarde. Al escanearlo a tiempo, el cliente
 * recibe un "pase" de 5 minutos, ligado a su cuenta y a la sede, para elegir
 * el vehículo y confirmar sin apuro.
 */
const TIPO = "QR_INGRESO";
const TIPO_PASE = "QR_PASE";
export const minutosQr = () => Math.min(Math.max(Number(process.env.QR_MINUTOS) || 2, 1), 60);
const MINUTOS_PASE = 5;
const llave = () => createHash("sha256").update(`parkway-qr:${process.env.QR_SECRET || JWT_SECRET()}`).digest();

export interface SedeQr {
  sede: number;
  exp: number;
}

export function firmarQr(idParqueadero: number): string {
  return jwt.sign({ tipo: TIPO, sede: idParqueadero }, llave(), { algorithm: "HS256", expiresIn: `${minutosQr()}m` });
}

/** Verifica el token del QR. Lanza 400 si es inválido o venció. */
export function verificarQr(token: string): SedeQr {
  try {
    const p = jwt.verify(String(token), llave(), { algorithms: ["HS256"] }) as { tipo?: string; sede?: number; exp: number };
    if (p.tipo !== TIPO || !Number.isInteger(p.sede)) throw new Error("tipo");
    return { sede: p.sede as number, exp: p.exp };
  } catch (e) {
    if ((e as Error).name === "TokenExpiredError") throw badRequest("Este código QR ya venció. Vuelva a escanear el código de la portería.");
    throw badRequest("El código QR no es válido para Parkway");
  }
}

/** Pase de 5 minutos para un cliente que escaneó a tiempo el QR de una sede. */
export function firmarPase(idParqueadero: number, idCliente: number): string {
  return jwt.sign({ tipo: TIPO_PASE, sede: idParqueadero, cli: idCliente }, llave(), { algorithm: "HS256", expiresIn: `${MINUTOS_PASE}m` });
}

/** Verifica el pase y que sea del mismo cliente. Devuelve la sede. */
export function verificarPase(pase: string, idCliente: number): number {
  try {
    const p = jwt.verify(String(pase), llave(), { algorithms: ["HS256"] }) as { tipo?: string; sede?: number; cli?: number };
    if (p.tipo !== TIPO_PASE || !Number.isInteger(p.sede) || p.cli !== idCliente) throw new Error("pase");
    return p.sede as number;
  } catch (e) {
    if ((e as Error).name === "TokenExpiredError") throw badRequest("Pasaron más de 5 minutos desde que escaneó el código. Vuelva a escanearlo.");
    throw badRequest("El código QR no es válido para Parkway");
  }
}

/** QR de una sede para mostrar en la portería (personal con acceso a la sede). */
export async function generar(usuario: UsuarioToken, idParqueadero: number, origen: string) {
  if (!Number.isInteger(idParqueadero) || idParqueadero <= 0) throw badRequest("Seleccione la sede");
  const sedes = await catalogoRepository.listarParqueaderos();
  const sede = sedes.find((s: { id_parqueadero: number }) => s.id_parqueadero === idParqueadero);
  if (!sede) throw notFound("La sede no existe");
  await verificarAcceso(usuario, idParqueadero);
  const token = firmarQr(idParqueadero);
  const url = `${(process.env.PUBLIC_URL || origen).replace(/\/$/, "")}/#/qr/${token}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  return { sede: idParqueadero, nombre: sede.nombre, url, svg, expira: new Date(verificarQr(token).exp * 1000).toISOString() };
}

/** Lo que ve el cliente al abrir el enlace del QR. */
export async function consultar(token: string, idCliente: number) {
  const { sede, exp } = verificarQr(token);
  const sedes = await catalogoRepository.listarParqueaderos();
  const s = sedes.find((x: { id_parqueadero: number }) => x.id_parqueadero === sede);
  if (!s) throw notFound("La sede del código QR ya no existe");
  const vehiculos = await vehiculoRepository.listarDelCliente(idCliente);
  const pase = firmarPase(sede, idCliente);
  return { sede, nombre: s.nombre, direccion: s.direccion ?? null, expira: new Date(exp * 1000).toISOString(), vehiculos, pase };
}

/** Registra el ingreso del cliente con uno de sus vehículos. */
export async function ingresar(cliente: UsuarioToken, body: Record<string, unknown>) {
  // Con el pase que entregó consultar(); si no viene, con el QR (que debe estar vigente).
  const sede = body.pase ? verificarPase(String(body.pase), cliente.id_usuario) : verificarQr(String(body.token ?? "")).sede;
  const placa = normalizarPlaca(String(body.placa ?? ""));
  if (!placa) throw badRequest("Elija el vehículo con el que va a ingresar");
  const propios = await vehiculoRepository.listarDelCliente(cliente.id_usuario);
  const vehiculo = propios.find((v: { placa: string }) => v.placa === placa);
  if (!vehiculo) throw forbidden("Ese vehículo no está registrado en su cuenta. Agréguelo en Mis vehículos.");
  if (vehiculo.dentro) throw conflict(`El vehículo ${placa} ya se encuentra dentro del parqueadero`);
  return registrarIngreso(
    { placa, idTipo: vehiculo.id_tipo, idParqueadero: sede, marca: vehiculo.marca ?? undefined, color: vehiculo.color ?? undefined },
    cliente,
    { origen: "QR" }
  );
}

/**
 * Ingresos con QR recientes de una sede, para avisar al operador.
 * El WebSocket solo dice "hubo un ingreso con QR en la sede N"; los datos
 * (placa, espacio, cliente) salen de aquí, con sesión y acceso a la sede.
 */
export async function ingresosRecientes(usuario: UsuarioToken, idParqueadero: number, desde?: string) {
  if (!Number.isInteger(idParqueadero) || idParqueadero <= 0) throw badRequest("Seleccione la sede");
  await verificarAcceso(usuario, idParqueadero);
  const inicio = desde && !Number.isNaN(Date.parse(desde)) ? new Date(desde) : new Date(Date.now() - 12 * 3_600_000);
  const { rows } = await pool.query(
    `SELECT r.id_registro, r.placa, e.codigo AS codigo_espacio, tv.nombre AS tipo, u.nombre AS cliente,
            r.estado, t.fecha_fin AS fecha
       FROM transaccion t
       JOIN registro_estacionamiento r ON r.id_registro::text = t.id_entidad
       JOIN espacio e ON e.id_espacio = r.id_espacio
       JOIN vehiculo v ON v.placa = r.placa
       JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
       LEFT JOIN usuario u ON u.id_usuario = t.id_usuario
      WHERE t.tipo_operacion = 'INGRESO' AND t.estado = 'CONFIRMADA' AND t.detalle->>'origen' = 'QR'
        AND e.id_parqueadero = $1 AND t.fecha_fin > $2
      ORDER BY t.fecha_fin DESC
      LIMIT 20`,
    [idParqueadero, inicio]
  );
  return rows;
}
