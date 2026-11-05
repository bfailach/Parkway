import { pool } from "../db/pool";
import { ZONA_HORARIA } from "./horarioService";
import { esFestivo, EntradasRed, METRICAS, predecir, vectorEntrada } from "../ia/redOcupacion";

/**
 * Servicio de predicción de ocupación (sección 14 del documento maestro).
 *
 * Arma el vector de entrada con datos que el sistema ya registra, consulta
 * la red neuronal y guarda el resultado en prediccion_ocupacion. Solo lee
 * datos operativos: si algo falla, la reserva o el ingreso siguen normalmente.
 */
export const UMBRAL_ALERTA = 0.9;

export interface Prediccion {
  idParqueadero: number;
  idTipo: number | null;
  capacidad: number;
  ocupacionActual: number;
  ocupacionEstimada: number;
  nivel: "NORMAL" | "ALTA" | "CRITICA";
  alerta: boolean;
  horaObjetivo: string;
  entradas: EntradasRed & { vector: number[]; sinHistorico: boolean };
  modelo: { nombre: string; maeValidacion: number };
  alternativa?: { idParqueadero: number; nombre: string; ocupacionEstimada: number } | null;
}

/** Fecha, hora y día de la semana en Bogotá. */
function ahoraEnZona(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(fecha);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dias: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { fecha: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")), dia: dias[v("weekday")] };
}

export function nivelDe(y: number): Prediccion["nivel"] {
  return y >= UMBRAL_ALERTA ? "CRITICA" : y >= 0.8 ? "ALTA" : "NORMAL";
}

async function leerEntradas(idParqueadero: number, idTipo: number | null) {
  const tipo = "($2::int IS NULL OR e.id_tipo = $2)";
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*) FROM espacio e WHERE e.id_parqueadero = $1 AND ${tipo} AND e.estado <> 'FUERA_DE_SERVICIO')::int AS capacidad,
       (SELECT count(*) FROM espacio e WHERE e.id_parqueadero = $1 AND ${tipo} AND e.estado = 'OCUPADO')::int AS ocupados,
       (SELECT count(*) FROM reserva r JOIN espacio e ON e.id_espacio = r.id_espacio
         WHERE e.id_parqueadero = $1 AND ${tipo} AND r.estado = 'ACTIVA'
           AND r.fecha_fin > now() AND r.fecha_inicio <= now() + interval '1 hour')::int AS reservas,
       (SELECT count(*) FROM registro_estacionamiento re JOIN espacio e ON e.id_espacio = re.id_espacio
         WHERE e.id_parqueadero = $1 AND ${tipo}
           AND re.fecha_ingreso <= now() - interval '7 days'
           AND (re.fecha_salida IS NULL OR re.fecha_salida > now() - interval '7 days'))::int AS hace_semana,
       EXISTS (SELECT 1 FROM registro_estacionamiento re JOIN espacio e ON e.id_espacio = re.id_espacio
         WHERE e.id_parqueadero = $1 AND re.fecha_ingreso <= now() - interval '7 days') AS con_historico`,
    [idParqueadero, idTipo]
  );
  return rows[0] as { capacidad: number; ocupados: number; reservas: number; hace_semana: number; con_historico: boolean };
}

let tablaDisponible = true;
async function guardar(p: Prediccion) {
  if (!tablaDisponible) return;
  try {
    await pool.query(
      `INSERT INTO prediccion_ocupacion (id_parqueadero, id_tipo, fecha_hora, ocupacion_estimada, ocupacion_actual, modelo)
       VALUES ($1, $2, date_trunc('hour', now()) + interval '1 hour', $3, $4, 'MLP')
       ON CONFLICT (id_parqueadero, (COALESCE(id_tipo, 0)), fecha_hora, modelo)
       DO UPDATE SET ocupacion_estimada = EXCLUDED.ocupacion_estimada,
                     ocupacion_actual = EXCLUDED.ocupacion_actual, creada = now()`,
      [p.idParqueadero, p.idTipo, p.ocupacionEstimada.toFixed(4), p.ocupacionActual.toFixed(4)]
    );
  } catch (err) {
    // Base creada antes de esta versión: se avisa una vez y se sigue sin guardar.
    if ((err as { code?: string }).code === "42P01") {
      tablaDisponible = false;
      // eslint-disable-next-line no-console
      console.warn("Falta la tabla prediccion_ocupacion. Ejecute database/migracion_prediccion.sql para guardar las predicciones.");
    }
  }
}

/** Predicción de una sede, sin buscar alternativas. Devuelve null si la sede no tiene espacios de ese tipo. */
export async function predecirSede(idParqueadero: number, idTipo: number | null = null, fecha = new Date()): Promise<Prediccion | null> {
  const d = await leerEntradas(idParqueadero, idTipo);
  if (!d || d.capacidad === 0) return null;
  const t = ahoraEnZona(fecha);
  const actual = d.ocupados / d.capacidad;
  // Sin una semana de historia (base recién creada) se usa la ocupación actual como referencia.
  const semana = d.con_historico ? d.hace_semana / d.capacidad : actual;
  const entradas: EntradasRed = {
    hora: t.hora, dia: t.dia, festivo: esFestivo(t.fecha),
    ocupacionActual: actual, ocupacionSemanaAnterior: semana, reservas: d.reservas / d.capacidad,
  };
  const vector = vectorEntrada(entradas);
  const y = predecir(vector).y;
  const objetivo = new Date(fecha.getTime() + 3600000);
  return {
    idParqueadero, idTipo, capacidad: d.capacidad,
    ocupacionActual: actual, ocupacionEstimada: y, nivel: nivelDe(y), alerta: y >= UMBRAL_ALERTA,
    horaObjetivo: `${String(ahoraEnZona(objetivo).hora).padStart(2, "0")}:00`,
    entradas: { ...entradas, vector, sinHistorico: !d.con_historico },
    modelo: { nombre: "MLP 6-8-1", maeValidacion: METRICAS.mae_pp },
  };
}

/**
 * Predicción para el flujo de reserva: si la sede va a estar casi llena,
 * sugiere la sede con menor ocupación esperada para el mismo tipo de vehículo.
 */
export async function predecirConAlternativa(idParqueadero: number, idTipo: number | null): Promise<Prediccion | null> {
  const p = await predecirSede(idParqueadero, idTipo);
  if (!p) return null;
  await guardar(p);
  if (p.alerta) {
    const { rows } = await pool.query(`SELECT id_parqueadero, nombre FROM parqueadero WHERE id_parqueadero <> $1`, [idParqueadero]);
    const otras = await Promise.all(
      rows.map(async (s) => ({ s, p: await predecirSede(s.id_parqueadero, idTipo).catch(() => null) }))
    );
    const mejor = otras
      .filter((o) => o.p && o.p.ocupacionEstimada < UMBRAL_ALERTA)
      .sort((a, b) => a.p!.ocupacionEstimada - b.p!.ocupacionEstimada)[0];
    p.alternativa = mejor
      ? { idParqueadero: mejor.s.id_parqueadero, nombre: mejor.s.nombre, ocupacionEstimada: mejor.p!.ocupacionEstimada }
      : null;
  }
  return p;
}
