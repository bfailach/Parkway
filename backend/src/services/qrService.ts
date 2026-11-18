import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { badRequest, conflict, forbidden, notFound } from "../errors/AppError";
import { JWT_SECRET, UsuarioToken } from "../middlewares/auth";
import * as catalogoRepository from "../repositories/catalogoRepository";
import * as vehiculoRepository from "../repositories/vehiculoRepository";
import { verificarAcceso } from "./accesoService";
import { registrarIngreso } from "./estacionamientoService";
import { normalizarPlaca } from "../validators/ingresoValidator";
import { transactionManager } from "../transactions/transactionManager";
import * as espacioRepository from "../repositories/espacioRepository";

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
 * Verificación del ingreso con QR en portería.
 *
 * El operador compara el vehículo que llegó con el que el cliente registró
 * (placa, tipo, marca y color):
 *  - coincide = true: el ingreso queda verificado (VERIFICAR_QR).
 *  - coincide = false: el ingreso se anula (ANULAR_INGRESO). El registro queda
 *    ANULADO, sin cobro, y el espacio se libera, todo en una transacción.
 */
export async function verificarIngreso(usuario: UsuarioToken, idRegistro: number, body: Record<string, unknown>) {
  if (!Number.isInteger(idRegistro) || idRegistro <= 0) throw badRequest("Registro inválido");
  if (typeof body.coincide !== "boolean") throw badRequest("Indique si el vehículo coincide", { coincide: "Debe ser true o false" });
  const coincide = body.coincide;
  const motivo = String(body.motivo ?? "").trim().slice(0, 200);
  if (!coincide && motivo.length < 5) {
    throw badRequest("Revise los campos del formulario", { motivo: "Escriba qué no coincide (por ejemplo, otra placa o color)" });
  }
  return transactionManager.ejecutar(
    usuario.id_usuario,
    coincide ? "VERIFICAR_QR" : "ANULAR_INGRESO",
    "registro_estacionamiento",
    async (client) => {
      const { rows } = await client.query(
        `SELECT r.id_registro, r.placa, r.estado, r.id_espacio, e.codigo AS codigo_espacio, e.id_parqueadero,
                u.rol AS rol_ingreso, (to_jsonb(r)->>'verificado_por') IS NOT NULL AS verificado
           FROM registro_estacionamiento r
           JOIN espacio e ON e.id_espacio = r.id_espacio
           JOIN usuario u ON u.id_usuario = r.id_operador_ingreso
          WHERE r.id_registro = $1
          FOR UPDATE OF r`,
        [idRegistro]
      );
      const r = rows[0];
      if (!r) throw notFound("El registro no existe");
      await verificarAcceso(usuario, r.id_parqueadero, client);
      if (r.rol_ingreso !== "CLIENTE") throw conflict("Solo se verifican los ingresos registrados con QR");
      if (r.estado !== "ABIERTO") throw conflict(`El vehículo ${r.placa} ya no está dentro del parqueadero`);
      if (r.verificado) throw conflict(`El ingreso de ${r.placa} ya fue verificado`);
      if (coincide) {
        await client.query(
          `UPDATE registro_estacionamiento SET verificado_por = $2, fecha_verificacion = now() WHERE id_registro = $1`,
          [idRegistro, usuario.id_usuario]
        );
      } else {
        await client.query(
          `UPDATE registro_estacionamiento
              SET estado = 'ANULADO', fecha_salida = now(), minutos = 0, valor_calculado = 0, id_operador_salida = $2
            WHERE id_registro = $1`,
          [idRegistro, usuario.id_usuario]
        );
        await espacioRepository.actualizarEstado(client, r.id_espacio, "LIBRE");
      }
      return { id_registro: r.id_registro, placa: r.placa, codigo_espacio: r.codigo_espacio, coincide };
    },
    {
      idEntidad: (x) => x.id_registro,
      detalle: (x) => ({ placa: x.placa, espacio: x.codigo_espacio, origen: "QR", ...(coincide ? {} : { motivo }) }),
    }
  );
}

