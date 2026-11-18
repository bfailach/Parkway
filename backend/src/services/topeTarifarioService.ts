import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { AppError } from "../errors/AppError";
import { MINUTOS_FRACCION } from "./tarifaService";
import type { TarifaSede } from "../validators/parqueaderoValidator";

/**
 * Topes tarifarios del Decreto Distrital 026 de 2026 (Bogotá).
 *
 * El decreto fija la tarifa MÁXIMA por minuto, con IVA incluido, de los
 * parqueaderos fuera de vía. Parkway cobra por hora, fracción de 15 minutos
 * y tope por día, así que cada valor se compara con el tope del periodo que
 * cubre:
 *   valor_hora     ≤ tope × 60
 *   valor_fraccion ≤ tope × 15
 *   valor_dia      ≤ tope × 1.440
 * Así ningún tramo cobra más de lo que el decreto permite para ese tiempo.
 *
 * Los topes se leen de la tabla tope_tarifario (migracion_propuesta.sql).
 * Si la base todavía no tiene la tabla, se usan los mismos valores en código.
 */
export interface Tope {
  id_tipo: number;
  tipo: string;
  sello_oro: boolean;
  valor_minuto: number;
  norma: string;
  vigente_desde: string;
}

const NORMA = "Decreto Distrital 026 de 2026";
const TIPO: Record<number, string> = { 1: "AUTOMOVIL", 2: "MOTOCICLETA", 3: "BICICLETA" };
const NOMBRE: Record<number, string> = { 1: "automóviles", 2: "motocicletas", 3: "bicicletas" };

export const TOPES_DECRETO_026: Tope[] = [
  [1, false, 230], [1, true, 253],
  [2, false, 161], [2, true, 177],
  [3, false, 10], [3, true, 0],
].map(([id, sello, valor]) => ({
  id_tipo: id as number,
  tipo: TIPO[id as number],
  sello_oro: sello as boolean,
  valor_minuto: valor as number,
  norma: NORMA,
  vigente_desde: "2026-01-29",
}));

const esTablaFaltante = (e: unknown) => (e as { code?: string })?.code === "42P01" || (e as { code?: string })?.code === "42703";

const CONSULTA_TOPES = `SELECT DISTINCT ON (t.id_tipo, t.sello_oro)
              t.id_tipo, tv.nombre AS tipo, t.sello_oro, t.valor_minuto::float AS valor_minuto, t.norma,
              to_char(t.vigente_desde, 'YYYY-MM-DD') AS vigente_desde
         FROM tope_tarifario t JOIN tipo_vehiculo tv USING (id_tipo)
        WHERE t.vigente_desde <= CURRENT_DATE
        ORDER BY t.id_tipo, t.sello_oro, t.vigente_desde DESC`;

async function listarTopesDe(db: Pick<PoolClient, "query">): Promise<Tope[]> {
  const { rows } = await db.query(CONSULTA_TOPES);
  return rows.length ? rows : TOPES_DECRETO_026;
}

/** Topes vigentes hoy, uno por tipo de vehículo y certificación. */
export async function listarTopes(): Promise<Tope[]> {
  try {
    return await listarTopesDe(pool);
  } catch (e) {
    if (esTablaFaltante(e)) return TOPES_DECRETO_026;
    throw e;
  }
}

/** Valor máximo de cada tramo de la tarifa para un tope por minuto. */
export function maximosPorTramo(valorMinuto: number) {
  return { valor_hora: valorMinuto * 60, valor_fraccion: valorMinuto * MINUTOS_FRACCION, valor_dia: valorMinuto * 1440 };
}

/** Compara las tarifas con los topes. Devuelve los errores por campo (vacío si cumplen). Función pura. */
export function revisarTarifas(tarifas: TarifaSede[], topes: Tope[], selloOro: boolean): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const t of tarifas) {
    const tope = topes.find((x) => x.id_tipo === t.idTipo && x.sello_oro === selloOro);
    if (!tope) continue;
    const max = maximosPorTramo(tope.valor_minuto);
    const pesos = (n: number) => `$${n.toLocaleString("es-CO")}`;
    const fuera: string[] = [];
    if (t.valor_hora > max.valor_hora) fuera.push(`la hora (${pesos(t.valor_hora)}, máximo ${pesos(max.valor_hora)})`);
    if (t.valor_fraccion > max.valor_fraccion) fuera.push(`la fracción de 15 min (${pesos(t.valor_fraccion)}, máximo ${pesos(max.valor_fraccion)})`);
    if (t.valor_dia > max.valor_dia) fuera.push(`el día (${pesos(t.valor_dia)}, máximo ${pesos(max.valor_dia)})`);
    if (fuera.length) {
      errores[`tarifa_${t.idTipo}`] =
        `La tarifa de ${NOMBRE[t.idTipo]} supera el tope de ${pesos(tope.valor_minuto)} por minuto del ${tope.norma}` +
        `${selloOro ? " para sedes con Sello Oro" : ""}: ${fuera.join(", ")}.`;
    }
  }
  return errores;
}

/** Verifica las tarifas de una sede dentro de su transacción. Lanza 422 si alguna supera el tope. */
export async function validarTopesDeSede(client: PoolClient, idParqueadero: number, tarifas: TarifaSede[]) {
  let topes = TOPES_DECRETO_026;
  let selloOro = false;
  // SAVEPOINT: si la base aún no tiene la migración, el error no anula la
  // transacción de la sede y se usan los topes definidos en código.
  await client.query("SAVEPOINT topes");
  try {
    topes = await listarTopesDe(client);
    const { rows } = await client.query(`SELECT sello_oro FROM parqueadero WHERE id_parqueadero = $1`, [idParqueadero]);
    selloOro = Boolean(rows[0]?.sello_oro);
    await client.query("RELEASE SAVEPOINT topes");
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT topes");
    if (!esTablaFaltante(e)) throw e;
  }
  const errores = revisarTarifas(tarifas, topes, selloOro);
  if (Object.keys(errores).length) {
    throw new AppError(422, Object.values(errores).join(" "), errores);
  }
}

/** Tarifas activas que hoy superan el tope (para que el administrador las corrija). */
export async function tarifasFueraDeTope() {
  const topes = await listarTopes();
  let filas;
  try {
    ({ rows: filas } = await pool.query(
      `SELECT p.id_parqueadero, p.nombre AS sede, p.sello_oro, t.id_tipo, t.valor_hora::float AS valor_hora,
              t.valor_fraccion::float AS valor_fraccion, t.valor_dia::float AS valor_dia
         FROM tarifa t JOIN parqueadero p USING (id_parqueadero)
        WHERE t.activa ORDER BY p.id_parqueadero, t.id_tipo`
    ));
  } catch (e) {
    if (!esTablaFaltante(e)) throw e;
    ({ rows: filas } = await pool.query(
      `SELECT p.id_parqueadero, p.nombre AS sede, false AS sello_oro, t.id_tipo, t.valor_hora::float AS valor_hora,
              t.valor_fraccion::float AS valor_fraccion, t.valor_dia::float AS valor_dia
         FROM tarifa t JOIN parqueadero p USING (id_parqueadero)
        WHERE t.activa ORDER BY p.id_parqueadero, t.id_tipo`
    ));
  }
  return filas
    .map((f) => ({ ...f, problema: Object.values(revisarTarifas([{ ...f, idTipo: f.id_tipo }], topes, f.sello_oro))[0] }))
    .filter((f) => f.problema);
}
