import { pool } from "../db/pool";
import { estadoEn, horariosDe, ZONA_HORARIA } from "./horarioService";
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

// ---------------------------------------------------------------------
// Pronóstico de las próximas 24 horas con Prophet (RF15, sección 13)
// ---------------------------------------------------------------------
/** Si el último entrenamiento tiene más de 36 horas, se avisa que está desactualizado. */
export const HORAS_VIGENCIA = 36;

export interface HoraPronostico {
  /** Inicio de la hora en Bogotá, "2026-11-15T14:00". */
  fecha: string;
  hora: string;
  /** Ocupación esperada, ya corregida con la red neuronal. */
  estimada: number;
  /** Lo que estimó Prophet solo con el calendario y el histórico. */
  prophet?: number;
  inferior: number;
  superior: number;
  /** false si la sede está cerrada a esa hora. */
  abierta: boolean;
}

export interface ResumenPronostico {
  /** Hora abierta con menos ocupación esperada en las próximas 12 horas. */
  mejorHora: { hora: string; estimada: number } | null;
  /** Hora abierta con más ocupación esperada en las próximas 24 horas. */
  pico: { hora: string; estimada: number } | null;
  /** Horas abiertas en las que se espera la sede casi llena (90 % o más). */
  horasCriticas: number;
}

/**
 * Cada hora que pasa, la diferencia entre la red y Prophet pesa un 30 %
 * menos: a las 3 horas queda un tercio y a las 8 horas casi nada.
 */
export const DECAIMIENTO_CORRECCION = 0.7;

/**
 * Corrige la curva de Prophet con la red neuronal (sección 14.1): Prophet
 * solo conoce el calendario y el histórico; la red sabe cómo está la sede
 * ahora y cuántas reservas vienen. La diferencia en la primera hora se
 * suma a la curva y se desvanece en las horas siguientes. El rango de
 * confianza se desplaza con la estimación. Función pura.
 */
export function corregirConRed(horas: HoraPronostico[], redPrimeraHora: number, decaimiento = DECAIMIENTO_CORRECCION): HoraPronostico[] {
  if (!horas.length) return horas;
  const diferencia = redPrimeraHora - horas[0].estimada;
  const recortar = (v: number) => Math.min(1, Math.max(0, v));
  return horas.map((h, i) => {
    const ajuste = diferencia * decaimiento ** i;
    return {
      ...h,
      prophet: h.estimada,
      estimada: recortar(h.estimada + ajuste),
      inferior: recortar(h.inferior + ajuste),
      superior: recortar(h.superior + ajuste),
    };
  });
}

/** Mejor hora para llegar, hora pico y horas críticas. Función pura, probada en tests/pronostico.test.ts. */
export function resumirPronostico(horas: HoraPronostico[]): ResumenPronostico {
  const abiertas = horas.filter((h) => h.abierta);
  const menor = (l: HoraPronostico[]) => l.reduce<HoraPronostico | null>((a, h) => (!a || h.estimada < a.estimada ? h : a), null);
  const mayor = (l: HoraPronostico[]) => l.reduce<HoraPronostico | null>((a, h) => (!a || h.estimada > a.estimada ? h : a), null);
  const mejor = menor(horas.slice(0, 12).filter((h) => h.abierta));
  const pico = mayor(abiertas);
  return {
    mejorHora: mejor ? { hora: mejor.hora, estimada: mejor.estimada } : null,
    pico: pico ? { hora: pico.hora, estimada: pico.estimada } : null,
    horasCriticas: abiertas.filter((h) => h.estimada >= UMBRAL_ALERTA).length,
  };
}

export interface Pronostico {
  idParqueadero: number;
  disponible: boolean;
  mensaje?: string;
  horas: HoraPronostico[];
  resumen: ResumenPronostico | null;
  ocupacionActual: number | null;
  /** La red neuronal corrige la próxima hora con lo que pasa ahora (sección 14.1). */
  redProximaHora: { hora: string; estimada: number } | null;
  /** true si la curva de Prophet se corrigió con la red. */
  corregida: boolean;
  modelo: {
    nombre: string;
    entrenado: string;
    fuente: "REAL" | "SIMULADA";
    mape: number | null;
    maePp: number | null;
    cobertura: number | null;
    intervalo: number;
    desactualizado: boolean;
  } | null;
}

const vacio = (idParqueadero: number, mensaje: string): Pronostico => ({
  idParqueadero, disponible: false, mensaje, horas: [], resumen: null, ocupacionActual: null, redProximaHora: null, corregida: false, modelo: null,
});

export async function pronostico(idParqueadero: number): Promise<Pronostico> {
  let meta, filas;
  try {
    [meta, filas] = await Promise.all([
      pool.query(
        `SELECT to_json(entrenado AT TIME ZONE current_setting('TimeZone')) #>> '{}' AS entrenado, fuente, mape::float, mae_pp::float, cobertura::float,
                intervalo::float, entrenado < now() - make_interval(hours => $2) AS desactualizado
           FROM modelo_pronostico WHERE id_parqueadero = $1`,
        [idParqueadero, HORAS_VIGENCIA]
      ),
      pool.query(
        `SELECT to_char(fecha_hora, 'YYYY-MM-DD"T"HH24:MI') AS fecha, to_char(fecha_hora, 'HH24:MI') AS hora,
                EXTRACT(ISODOW FROM fecha_hora)::int AS dia, EXTRACT(HOUR FROM fecha_hora)::int AS h,
                ocupacion_estimada::float AS estimada, limite_inferior::float AS inferior, limite_superior::float AS superior
           FROM prediccion_ocupacion
          WHERE id_parqueadero = $1 AND id_tipo IS NULL AND modelo = 'PROPHET' AND fecha_hora > now()
          ORDER BY fecha_hora
          LIMIT 24`,
        [idParqueadero]
      ),
    ]);
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") {
      return vacio(idParqueadero, "Aún no se ha calculado el pronóstico. Ejecute ia/pronostico_prophet.py.");
    }
    throw err;
  }
  const m = meta.rows[0];
  if (!m || filas.rows.length < 6) {
    return vacio(idParqueadero, "El pronóstico de las próximas horas todavía no está listo.");
  }

  const horarios = await horariosDe(idParqueadero);
  const curva: HoraPronostico[] = filas.rows.map((r) => ({
    fecha: r.fecha,
    hora: r.hora,
    estimada: r.estimada,
    inferior: r.inferior ?? r.estimada,
    superior: r.superior ?? r.estimada,
    abierta: horarios.length ? estadoEn(horarios, r.dia, r.h * 60).abierto : true,
  }));

  // La red estima la hora siguiente; si coincide con la primera hora de la curva, la corrige.
  const red = await predecirSede(idParqueadero).catch(() => null);
  const corrige = !!red && curva[0].hora === red.horaObjetivo;
  const horas = corrige ? corregirConRed(curva, red!.ocupacionEstimada) : curva;
  return {
    idParqueadero,
    disponible: true,
    horas,
    resumen: resumirPronostico(horas),
    ocupacionActual: red?.ocupacionActual ?? null,
    redProximaHora: red ? { hora: red.horaObjetivo, estimada: red.ocupacionEstimada } : null,
    corregida: corrige,
    modelo: {
      nombre: "Prophet",
      entrenado: m.entrenado,
      fuente: m.fuente,
      mape: m.mape,
      maePp: m.mae_pp,
      cobertura: m.cobertura,
      intervalo: m.intervalo,
      desactualizado: m.desactualizado,
    },
  };
}
