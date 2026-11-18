import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { badRequest } from "../errors/AppError";
import { UsuarioToken } from "../middlewares/auth";
import { CANAL_AVISOS } from "../tiempoReal/canales";
import { verificarAcceso } from "./accesoService";

/**
 * Avisos de actividad en la plataforma.
 *
 * 1. Cuando se confirma una operación importante, el gestor de transacciones
 *    publica en el canal parkway_avisos { tipo: "actividad", sede, operacion }.
 *    pg_notify solo se entrega si la transacción se confirma, y llega a todas
 *    las réplicas porque todas escuchan la misma base.
 * 2. Cada réplica lo reenvía por WebSocket. El mensaje no lleva placas ni
 *    nombres.
 * 3. La pantalla pide el detalle con su sesión:
 *      personal → /api/estacionamiento/actividad (sus sedes, sin sus propias acciones)
 *      cliente  → /api/cliente/actividad (lo que otros hicieron sobre sus vehículos y reservas)
 */
export const OPERACIONES_AVISABLES = [
  "INGRESO",
  "SALIDA",
  "RESERVA",
  "CANCELAR_RESERVA",
  "EXPIRACION",
  "ANULAR_PAGO",
  "COBRO_NUEVO",
  "ESTADO_ESPACIO",
] as const;

const AVISABLES = new Set<string>(OPERACIONES_AVISABLES);

// Sede afectada por una fila de la bitácora, según su entidad.
const SEDE_DE_TRANSACCION = `COALESCE(er.id_parqueadero, es.id_parqueadero, ep.id_parqueadero, ee.id_parqueadero)`;
const UNIR_SEDE = `
  LEFT JOIN registro_estacionamiento r ON t.entidad = 'registro_estacionamiento' AND r.id_registro::text = t.id_entidad
  LEFT JOIN espacio er ON er.id_espacio = r.id_espacio
  LEFT JOIN reserva rs ON t.entidad = 'reserva' AND rs.id_reserva::text = t.id_entidad
  LEFT JOIN espacio es ON es.id_espacio = rs.id_espacio
  LEFT JOIN pago pg ON t.entidad = 'pago' AND pg.id_pago::text = t.id_entidad
  LEFT JOIN registro_estacionamiento rp ON rp.id_registro = pg.id_registro
  LEFT JOIN espacio ep ON ep.id_espacio = rp.id_espacio
  LEFT JOIN espacio ee ON t.entidad = 'espacio' AND ee.id_espacio::text = t.id_entidad`;

/** Publica el aviso dentro de la transacción (se entrega al confirmarse). */
export async function avisarActividad(client: PoolClient, operacion: string, entidad: string, idEntidad: string | null) {
  if (!AVISABLES.has(operacion) || !idEntidad) return;
  await client.query(
    `SELECT pg_notify($4, json_build_object('tipo', 'actividad', 'sede', s.sede, 'operacion', $1::text)::text)
       FROM (SELECT ${SEDE_DE_TRANSACCION} AS sede
               FROM (SELECT $2::text AS entidad, $3::text AS id_entidad) t ${UNIR_SEDE}) s
      WHERE s.sede IS NOT NULL`,
    [operacion, entidad, idEntidad, CANAL_AVISOS]
  );
}

const desdeValido = (desde: unknown, horas: number) =>
  typeof desde === "string" && !Number.isNaN(Date.parse(desde)) ? new Date(desde) : new Date(Date.now() - horas * 3_600_000);

/** Actividad reciente de una sede para el personal. No incluye las acciones del propio usuario. */
export async function dePersonal(usuario: UsuarioToken, idParqueadero: number, desde?: unknown) {
  if (!Number.isInteger(idParqueadero) || idParqueadero <= 0) throw badRequest("Seleccione la sede");
  await verificarAcceso(usuario, idParqueadero);
  const { rows } = await pool.query(
    `SELECT t.id_transaccion AS id, t.tipo_operacion AS operacion, t.fecha_fin AS fecha,
            COALESCE(r.placa, rs.placa, rp.placa, t.detalle->>'placa') AS placa,
            COALESCE(er.codigo, es.codigo, ee.codigo, t.detalle->>'espacio') AS espacio,
            u.nombre AS actor, u.rol AS rol_actor,
            t.detalle->>'origen' AS origen,
            NULLIF(t.detalle->>'valor', '')::float AS valor,
            t.detalle->>'estado' AS estado_espacio,
            t.detalle->>'motivo' AS motivo
       FROM transaccion t
       ${UNIR_SEDE}
       LEFT JOIN usuario u ON u.id_usuario = t.id_usuario
      WHERE t.estado = 'CONFIRMADA' AND t.fecha_fin > $2
        AND t.tipo_operacion = ANY($3)
        AND ${SEDE_DE_TRANSACCION} = $1
        AND (t.id_usuario IS DISTINCT FROM $4 OR t.tipo_operacion = 'EXPIRACION')
      ORDER BY t.fecha_fin DESC
      LIMIT 30`,
    [idParqueadero, desdeValido(desde, 12), [...AVISABLES], usuario.id_usuario]
  );
  return rows;
}

/**
 * Lo que otras personas o el sistema hicieron sobre los vehículos y reservas
 * del cliente: reserva vencida, pago anulado y nuevo cobro. (La entrada y la
 * salida ya las detecta el aviso del cliente con su estado.)
 */
export async function deCliente(idCliente: number, desde?: unknown) {
  const { rows } = await pool.query(
    `SELECT t.id_transaccion AS id, t.tipo_operacion AS operacion, t.fecha_fin AS fecha,
            COALESCE(rs.placa, rp.placa, r.placa) AS placa,
            COALESCE(es.codigo, ep.codigo, er.codigo) AS espacio,
            p.nombre AS sede,
            NULLIF(t.detalle->>'motivo', '') AS motivo
       FROM transaccion t
       ${UNIR_SEDE}
       LEFT JOIN vehiculo v ON v.placa = COALESCE(rp.placa, r.placa)
       LEFT JOIN parqueadero p ON p.id_parqueadero = ${SEDE_DE_TRANSACCION}
      WHERE t.estado = 'CONFIRMADA' AND t.fecha_fin > $2
        AND (
              (t.tipo_operacion = 'EXPIRACION' AND rs.id_cliente = $1)
           OR (t.tipo_operacion IN ('ANULAR_PAGO', 'COBRO_NUEVO') AND v.id_cliente = $1)
        )
      ORDER BY t.fecha_fin DESC
      LIMIT 20`,
    [idCliente, desdeValido(desde, 24)]
  );
  return rows;
}
