import { PoolClient } from "pg";
import { pool } from "../db/pool";

export interface Vehiculo {
  placa: string;
  id_tipo: number;
  id_cliente: number | null;
  marca: string | null;
  color: string | null;
}

export async function buscarParaActualizar(client: PoolClient, placa: string): Promise<Vehiculo | null> {
  const { rows } = await client.query(`SELECT * FROM vehiculo WHERE placa = $1 FOR UPDATE`, [placa]);
  return rows[0] ?? null;
}

export async function crear(
  client: PoolClient,
  v: { placa: string; idTipo: number; marca?: string; color?: string; idCliente?: number }
): Promise<Vehiculo> {
  const { rows } = await client.query(
    `INSERT INTO vehiculo (placa, id_tipo, marca, color, id_cliente) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [v.placa, v.idTipo, v.marca ?? null, v.color ?? null, v.idCliente ?? null]
  );
  return rows[0];
}

/** Asocia un vehículo sin dueño (registrado antes como visitante) a un cliente. */
export async function asociarCliente(
  client: PoolClient,
  v: { placa: string; idCliente: number; marca?: string; color?: string }
) {
  await client.query(
    `UPDATE vehiculo SET id_cliente = $2, marca = COALESCE($3, marca), color = COALESCE($4, color) WHERE placa = $1`,
    [v.placa, v.idCliente, v.marca ?? null, v.color ?? null]
  );
}

/**
 * Quita el vehículo de la cuenta del cliente. No se borra la fila porque
 * el historial de ingresos y reservas la referencia.
 */
export async function desasociarCliente(client: PoolClient, placa: string) {
  await client.query(`UPDATE vehiculo SET id_cliente = NULL WHERE placa = $1`, [placa]);
}

export async function listarDelCliente(idCliente: number) {
  const { rows } = await pool.query(
    `SELECT v.placa, v.id_tipo, t.nombre AS tipo, v.marca, v.color,
            (r.id_registro IS NOT NULL) AS dentro,
            (rs.id_reserva IS NOT NULL) AS con_reserva,
            -- Dónde está: la sede, el espacio y el piso del ingreso abierto o de la reserva activa.
            COALESCE(pr.nombre, prs.nombre) AS sede,
            COALESCE(er.codigo, ers.codigo) AS espacio,
            COALESCE(er.piso, ers.piso) AS piso,
            r.fecha_ingreso,
            rs.fecha_fin AS reserva_vence
       FROM vehiculo v
       JOIN tipo_vehiculo t ON t.id_tipo = v.id_tipo
       LEFT JOIN registro_estacionamiento r ON r.placa = v.placa AND r.estado = 'ABIERTO'
       LEFT JOIN espacio er ON er.id_espacio = r.id_espacio
       LEFT JOIN parqueadero pr ON pr.id_parqueadero = er.id_parqueadero
       LEFT JOIN reserva rs ON rs.placa = v.placa AND rs.estado = 'ACTIVA'
       LEFT JOIN espacio ers ON ers.id_espacio = rs.id_espacio
       LEFT JOIN parqueadero prs ON prs.id_parqueadero = ers.id_parqueadero
      WHERE v.id_cliente = $1
      ORDER BY v.placa`,
    [idCliente]
  );
  return rows;
}

/**
 * Actualiza marca y color con los datos que confirma el operador en el
 * ingreso. El formulario se llena con los datos guardados, así que un
 * valor distinto es una corrección del operador. Un campo vacío conserva
 * lo que ya estaba.
 */
export async function actualizarDatos(client: PoolClient, placa: string, marca?: string, color?: string) {
  if (!marca && !color) return;
  await client.query(
    `UPDATE vehiculo SET marca = COALESCE($2, marca), color = COALESCE($3, color) WHERE placa = $1`,
    [placa, marca ?? null, color ?? null]
  );
}

/** Siguiente código de bicicleta: BICI001, BICI002... */
export async function siguienteCodigoBicicleta(client: PoolClient): Promise<string> {
  const { rows } = await client.query(`SELECT 'BICI' || lpad(nextval('seq_bicicleta')::text, 3, '0') AS codigo`);
  return rows[0].codigo;
}

const SELECT_CON_DUENO = `
  SELECT v.placa, v.id_tipo, t.nombre AS tipo, v.marca, v.color,
         u.nombre AS cliente, u.telefono,
         EXISTS (SELECT 1 FROM registro_estacionamiento r WHERE r.placa = v.placa AND r.estado = 'ABIERTO') AS dentro
    FROM vehiculo v
    JOIN tipo_vehiculo t ON t.id_tipo = v.id_tipo
    LEFT JOIN usuario u  ON u.id_usuario = v.id_cliente`;

/** Datos guardados de un vehículo, para llenar el formulario de ingreso. */
export async function obtenerConDueno(placa: string) {
  const { rows } = await pool.query(`${SELECT_CON_DUENO} WHERE v.placa = $1`, [placa]);
  return rows[0] ?? null;
}

/** Búsqueda por placa o código (las bicicletas se buscan por su código BICI). */
export async function buscar(texto: string, idTipo?: number, limite = 8) {
  const { rows } = await pool.query(
    `${SELECT_CON_DUENO}
      WHERE v.placa LIKE '%' || $1 || '%'
        AND ($2::int IS NULL OR v.id_tipo = $2)
      ORDER BY (v.placa LIKE $1 || '%') DESC, v.placa
      LIMIT $3`,
    [texto, idTipo ?? null, limite]
  );
  return rows;
}
