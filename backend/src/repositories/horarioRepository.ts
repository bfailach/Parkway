import { PoolClient } from "pg";
import { pool } from "../db/pool";
import type { Horario } from "../services/horarioService";

/** Repositorio de horarios de atención por sede. */

const SELECT = `SELECT id_parqueadero, dia, to_char(abre, 'HH24:MI') AS abre,
                       CASE WHEN cierra = '24:00'::time THEN '24:00' ELSE to_char(cierra, 'HH24:MI') END AS cierra
                  FROM horario`;

export async function listar(idParqueadero: number): Promise<Horario[]> {
  const { rows } = await pool.query(`${SELECT} WHERE id_parqueadero = $1 ORDER BY dia`, [idParqueadero]);
  return rows.map(({ dia, abre, cierra }) => ({ dia, abre, cierra }));
}

/** Horarios de todas las sedes, agrupados por sede. */
export async function listarTodos(): Promise<Map<number, Horario[]>> {
  const { rows } = await pool.query(`${SELECT} ORDER BY id_parqueadero, dia`);
  const mapa = new Map<number, Horario[]>();
  rows.forEach(({ id_parqueadero, dia, abre, cierra }) => {
    if (!mapa.has(id_parqueadero)) mapa.set(id_parqueadero, []);
    mapa.get(id_parqueadero)!.push({ dia, abre, cierra });
  });
  return mapa;
}

export async function reemplazar(client: PoolClient, idParqueadero: number, horarios: Horario[]) {
  await client.query(`DELETE FROM horario WHERE id_parqueadero = $1`, [idParqueadero]);
  for (const h of horarios) {
    await client.query(`INSERT INTO horario (id_parqueadero, dia, abre, cierra) VALUES ($1, $2, $3, $4)`, [
      idParqueadero,
      h.dia,
      h.abre,
      h.cierra,
    ]);
  }
}
