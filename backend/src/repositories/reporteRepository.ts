import { pool } from "../db/pool";
import type { FiltrosReporte } from "../validators/reporteValidator";

/**
 * Consultas de los reportes del administrador (RF13). Las fechas se
 * guardan en hora de Bogotá; el periodo va desde las 00:00 de `desde` hasta
 * las 24:00 de `hasta`, sin pasar de la hora actual.
 *
 * Parámetros comunes: $1 desde, $2 hasta, $3 sede (o null), $4 tipo (o null).
 */
const FILTRO_ESPACIO = `($3::int IS NULL OR e.id_parqueadero = $3) AND ($4::int IS NULL OR e.id_tipo = $4)`;
const params = (f: FiltrosReporte) => [f.desde, f.hasta, f.idParqueadero ?? null, f.idTipo ?? null];

/** Espacios en servicio de la selección: la capacidad con que se calcula la ocupación. */
export async function capacidad(f: FiltrosReporte): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM espacio e
      WHERE ($1::int IS NULL OR e.id_parqueadero = $1) AND ($2::int IS NULL OR e.id_tipo = $2)
        AND e.estado <> 'FUERA_DE_SERVICIO'`,
    [f.idParqueadero ?? null, f.idTipo ?? null]
  );
  return rows[0].n;
}

export interface HoraOcupacion {
  /** AAAA-MM-DD */
  fecha: string;
  hora: number;
  /** Vehículos dentro al inicio de la hora. */
  ocupados: number;
  /** Vehículos que entraron durante la hora. */
  llegadas: number;
}

/**
 * Una fila por cada hora del periodo con los vehículos dentro al inicio de
 * la hora y las llegadas durante ella. Cada estancia aporta una fila por
 * cada inicio de hora que pasó dentro del parqueadero, así el cálculo crece
 * con los registros y no con horas × registros.
 */
export async function ocupacionPorHora(f: FiltrosReporte): Promise<HoraOcupacion[]> {
  const { rows } = await pool.query(
    `WITH limites AS (
        SELECT $1::date::timestamp AS ini,
               LEAST($2::date::timestamp + interval '1 day', date_trunc('hour', now()) + interval '1 hour') AS fin
     ),
     horas AS (
        SELECT generate_series(ini, fin - interval '1 hour', interval '1 hour') AS h FROM limites
     ),
     dentro AS (
        SELECT h, count(*)::int AS n
          FROM registro_estacionamiento re
          JOIN espacio e ON e.id_espacio = re.id_espacio, limites,
               LATERAL generate_series(
                 date_trunc('hour', re.fecha_ingreso + interval '1 hour' - interval '1 microsecond'),
                 COALESCE(re.fecha_salida, now()) - interval '1 microsecond',
                 interval '1 hour') AS h
         WHERE ${FILTRO_ESPACIO}
           AND re.fecha_ingreso < limites.fin
           AND COALESCE(re.fecha_salida, now()) > limites.ini
         GROUP BY h
     ),
     llegadas AS (
        SELECT date_trunc('hour', re.fecha_ingreso) AS h, count(*)::int AS n
          FROM registro_estacionamiento re
          JOIN espacio e ON e.id_espacio = re.id_espacio, limites
         WHERE ${FILTRO_ESPACIO} AND re.fecha_ingreso >= limites.ini AND re.fecha_ingreso < limites.fin
         GROUP BY 1
     )
     SELECT to_char(horas.h, 'YYYY-MM-DD') AS fecha, EXTRACT(HOUR FROM horas.h)::int AS hora,
            COALESCE(dentro.n, 0) AS ocupados, COALESCE(llegadas.n, 0) AS llegadas
       FROM horas
       LEFT JOIN dentro ON dentro.h = horas.h
       LEFT JOIN llegadas ON llegadas.h = horas.h
      ORDER BY horas.h`,
    params(f)
  );
  return rows;
}

export interface FilaRotacion {
  id_espacio: number;
  codigo: string;
  sede: string;
  tipo: string;
  piso: number;
  estado: string;
  usos: number;
  minutos_ocupado: number;
  ingresos: number;
}

/**
 * Uso de cada espacio en el periodo: cuántos vehículos lo ocuparon, cuántos
 * minutos estuvo ocupado (solo la parte de cada estancia que cae dentro del
 * periodo) y cuánto se cobró en las salidas del periodo.
 */
export async function rotacionPorEspacio(f: FiltrosReporte): Promise<{ filas: FilaRotacion[]; minutosPeriodo: number }> {
  const { rows } = await pool.query(
    `WITH limites AS (
        SELECT $1::date::timestamp AS ini,
               LEAST($2::date::timestamp + interval '1 day', now()::timestamp) AS fin
     )
     SELECT e.id_espacio, e.codigo, p.nombre AS sede, t.nombre AS tipo, e.piso, e.estado,
            count(re.id_registro) FILTER (WHERE re.fecha_ingreso >= l.ini)::int AS usos,
            COALESCE(round(sum(EXTRACT(EPOCH FROM
                LEAST(COALESCE(re.fecha_salida, now()), l.fin) - GREATEST(re.fecha_ingreso, l.ini)) / 60)), 0)::int AS minutos_ocupado,
            COALESCE(sum(re.valor_calculado) FILTER (WHERE re.fecha_salida >= l.ini AND re.fecha_salida < l.fin), 0)::float AS ingresos,
            round(EXTRACT(EPOCH FROM max(l.fin) - max(l.ini)) / 60)::int AS minutos_periodo
       FROM espacio e
       JOIN parqueadero p ON p.id_parqueadero = e.id_parqueadero
       JOIN tipo_vehiculo t ON t.id_tipo = e.id_tipo
       CROSS JOIN limites l
       LEFT JOIN registro_estacionamiento re
              ON re.id_espacio = e.id_espacio
             AND re.fecha_ingreso < l.fin
             AND COALESCE(re.fecha_salida, now()) > l.ini
      WHERE ${FILTRO_ESPACIO}
      GROUP BY e.id_espacio, p.nombre, t.nombre
      ORDER BY usos DESC, minutos_ocupado DESC, p.nombre, e.piso, e.codigo`,
    params(f)
  );
  const minutosPeriodo = rows[0]?.minutos_periodo ?? 0;
  return { filas: rows.map(({ minutos_periodo: _m, ...r }) => r), minutosPeriodo };
}

export interface FilaIngresos {
  periodo: string;
  id_parqueadero: number;
  sede: string;
  salidas: number;
  valor: number;
  minutos_promedio: number | null;
}

/**
 * Salidas y valor cobrado por periodo (día, semana o mes) y sede. Incluye
 * los periodos sin movimiento, con cero, para que la serie no tenga huecos.
 */
export async function ingresosPorPeriodo(f: FiltrosReporte): Promise<FilaIngresos[]> {
  const unidad = { dia: "day", semana: "week", mes: "month" }[f.agrupacion];
  const { rows } = await pool.query(
    `WITH periodos AS (
        SELECT generate_series(date_trunc($5, $1::date::timestamp), $2::date::timestamp, ('1 ' || $5)::interval) AS inicio
     ),
     sedes AS (
        SELECT id_parqueadero, nombre FROM parqueadero WHERE $3::int IS NULL OR id_parqueadero = $3
     ),
     salidas AS (
        SELECT date_trunc($5, re.fecha_salida) AS inicio, e.id_parqueadero,
               count(*)::int AS salidas, sum(re.valor_calculado)::float AS valor, avg(re.minutos)::float AS minutos_promedio
          FROM registro_estacionamiento re
          JOIN espacio e ON e.id_espacio = re.id_espacio
         WHERE ${FILTRO_ESPACIO} AND re.estado = 'CERRADO'
           AND re.fecha_salida >= $1::date AND re.fecha_salida < $2::date + 1
         GROUP BY 1, 2
     )
     SELECT to_char(p.inicio, 'YYYY-MM-DD') AS periodo, s.id_parqueadero, s.nombre AS sede,
            COALESCE(x.salidas, 0) AS salidas, COALESCE(x.valor, 0) AS valor, x.minutos_promedio
       FROM periodos p
       CROSS JOIN sedes s
       LEFT JOIN salidas x ON x.inicio = p.inicio AND x.id_parqueadero = s.id_parqueadero
      ORDER BY p.inicio, s.nombre`,
    [...params(f), unidad]
  );
  return rows;
}
