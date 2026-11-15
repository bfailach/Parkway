import * as reporteRepository from "../repositories/reporteRepository";
import { FilaIngresos, FilaRotacion, HoraOcupacion } from "../repositories/reporteRepository";
import { esFestivo } from "../ia/redOcupacion";
import { ColumnaCsv } from "../utils/csv";
import { Agrupacion, diasEntre, FiltrosReporte } from "../validators/reporteValidator";

/**
 * Reportes del administrador (RF13): ocupación por franja horaria,
 * rotación por espacio e ingresos por periodo y sede. Cada reporte trae sus
 * filas, un resumen para la pantalla y las columnas para exportarlo a CSV.
 */
export const TIPOS_REPORTE = ["ocupacion", "rotacion", "ingresos"] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

// ---------------------------------------------------------------------
// Ocupación por franja horaria
// ---------------------------------------------------------------------
export interface FranjaHoraria {
  hora: number;
  /** Ocupación promedio a esa hora en todos los días del periodo (0 a 1). */
  promedio: number;
  /** Ocupación promedio solo de lunes a viernes que no son festivos. */
  promedioLaboral: number | null;
  /** Ocupación promedio de sábados, domingos y festivos. */
  promedioLibre: number | null;
  /** La mayor ocupación registrada a esa hora. */
  maximo: number;
  /** Vehículos que llegan en esa hora, en promedio por día. */
  llegadasPromedio: number;
  dias: number;
}

/**
 * Agrupa las horas del periodo por hora del día. Distingue los días
 * laborales de los fines de semana y festivos, porque su curva es distinta.
 * Función pura, probada en tests/reportes.test.ts.
 */
export function agregarPorFranja(horas: HoraOcupacion[], capacidad: number): FranjaHoraria[] {
  const grupos = Array.from({ length: 24 }, () => ({ todas: [] as number[], laboral: [] as number[], libre: [] as number[], llegadas: 0 }));
  for (const h of horas) {
    const ocupacion = capacidad > 0 ? Math.min(1, h.ocupados / capacidad) : 0;
    const dia = new Date(`${h.fecha}T12:00:00Z`).getUTCDay(); // 0 domingo, 6 sábado
    const libre = dia === 0 || dia === 6 || esFestivo(h.fecha);
    const g = grupos[h.hora];
    g.todas.push(ocupacion);
    (libre ? g.libre : g.laboral).push(ocupacion);
    g.llegadas += h.llegadas;
  }
  const promedio = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  return grupos
    .map((g, hora) => ({
      hora,
      promedio: promedio(g.todas) ?? 0,
      promedioLaboral: promedio(g.laboral),
      promedioLibre: promedio(g.libre),
      maximo: g.todas.length ? Math.max(...g.todas) : 0,
      llegadasPromedio: g.todas.length ? g.llegadas / g.todas.length : 0,
      dias: g.todas.length,
    }))
    .filter((f) => f.dias > 0);
}

export async function ocupacion(f: FiltrosReporte) {
  const [capacidad, horas] = await Promise.all([reporteRepository.capacidad(f), reporteRepository.ocupacionPorHora(f)]);
  const franjas = agregarPorFranja(horas, capacidad);
  const conDatos = franjas.filter((x) => x.dias > 0);
  const pico = conDatos.reduce<FranjaHoraria | null>((a, x) => (!a || x.promedio > a.promedio ? x : a), null);
  const general = horas.length && capacidad ? horas.reduce((a, h) => a + h.ocupados, 0) / (horas.length * capacidad) : 0;
  const maximo = horas.reduce<HoraOcupacion | null>((a, h) => (!a || h.ocupados > a.ocupados ? h : a), null);
  return {
    capacidad,
    filas: franjas,
    resumen: {
      ocupacionPromedio: general,
      horaPico: pico ? { hora: pico.hora, promedio: pico.promedio } : null,
      maximo: maximo && capacidad ? { fecha: maximo.fecha, hora: maximo.hora, ocupacion: maximo.ocupados / capacidad } : null,
      llegadas: horas.reduce((a, h) => a + h.llegadas, 0),
      horasAnalizadas: horas.length,
    },
  };
}

const franja = (h: number) => `${String(h).padStart(2, "0")}:00 a ${String((h + 1) % 24).padStart(2, "0")}:00`;
const pct = (v: number | null) => (v === null ? null : v * 100);

const COLUMNAS_OCUPACION: ColumnaCsv<FranjaHoraria>[] = [
  { titulo: "Franja", valor: (f) => franja(f.hora) },
  { titulo: "Ocupación promedio (%)", valor: (f) => pct(f.promedio), decimales: 1 },
  { titulo: "Lunes a viernes (%)", valor: (f) => pct(f.promedioLaboral), decimales: 1 },
  { titulo: "Fines de semana y festivos (%)", valor: (f) => pct(f.promedioLibre), decimales: 1 },
  { titulo: "Ocupación máxima (%)", valor: (f) => pct(f.maximo), decimales: 1 },
  { titulo: "Llegadas por día", valor: (f) => f.llegadasPromedio, decimales: 1 },
  { titulo: "Días con datos", valor: (f) => f.dias },
];

// ---------------------------------------------------------------------
// Rotación por espacio
// ---------------------------------------------------------------------
export interface RotacionEspacio extends FilaRotacion {
  /** Parte del periodo en que estuvo ocupado (0 a 1). */
  porcentajeOcupado: number;
  /** Vehículos por día. */
  rotacionDiaria: number;
}

export async function rotacion(f: FiltrosReporte) {
  const { filas, minutosPeriodo } = await reporteRepository.rotacionPorEspacio(f);
  const dias = Math.max(minutosPeriodo / 1440, 1 / 24);
  const espacios: RotacionEspacio[] = filas.map((r) => ({
    ...r,
    porcentajeOcupado: minutosPeriodo ? Math.min(1, r.minutos_ocupado / minutosPeriodo) : 0,
    rotacionDiaria: r.usos / dias,
  }));
  const usos = espacios.reduce((a, e) => a + e.usos, 0);
  const minutos = espacios.reduce((a, e) => a + e.minutos_ocupado, 0);
  return {
    filas: espacios,
    resumen: {
      espacios: espacios.length,
      usos,
      rotacionPromedio: espacios.length ? usos / espacios.length / dias : 0,
      masUsado: espacios[0]?.usos ? { codigo: espacios[0].codigo, sede: espacios[0].sede, usos: espacios[0].usos } : null,
      sinUso: espacios.filter((e) => e.usos === 0 && e.minutos_ocupado === 0).length,
      /** Parte del periodo que un espacio pasó ocupado, en promedio (0 a 1). */
      ocupadoPromedio: espacios.length && minutosPeriodo ? Math.min(1, minutos / (espacios.length * minutosPeriodo)) : 0,
      dias,
    },
  };
}

const COLUMNAS_ROTACION: ColumnaCsv<RotacionEspacio>[] = [
  { titulo: "Sede", valor: (f) => f.sede },
  { titulo: "Espacio", valor: (f) => f.codigo },
  { titulo: "Piso", valor: (f) => f.piso },
  { titulo: "Tipo", valor: (f) => f.tipo },
  { titulo: "Vehículos", valor: (f) => f.usos },
  { titulo: "Vehículos por día", valor: (f) => f.rotacionDiaria, decimales: 2 },
  { titulo: "Horas ocupado", valor: (f) => f.minutos_ocupado / 60, decimales: 1 },
  { titulo: "Tiempo ocupado (%)", valor: (f) => pct(f.porcentajeOcupado), decimales: 1 },
  { titulo: "Valor cobrado", valor: (f) => f.ingresos, decimales: 0 },
  { titulo: "Estado actual", valor: (f) => f.estado },
];

// ---------------------------------------------------------------------
// Ingresos por periodo y sede
// ---------------------------------------------------------------------
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Nombre del periodo: "15/11/2026", "Semana del 09/11/2026" o "noviembre de 2026". */
export function nombrePeriodo(inicio: string, agrupacion: Agrupacion): string {
  const [a, m, d] = inicio.split("-");
  if (agrupacion === "mes") return `${MESES[Number(m) - 1]} de ${a}`;
  const fecha = `${d}/${m}/${a}`;
  return agrupacion === "semana" ? `Semana del ${fecha}` : fecha;
}

export async function ingresos(f: FiltrosReporte) {
  const filas = await reporteRepository.ingresosPorPeriodo(f);
  const salidas = filas.reduce((a, r) => a + r.salidas, 0);
  const valor = filas.reduce((a, r) => a + r.valor, 0);
  const minutos = filas.reduce((a, r) => a + (r.minutos_promedio ?? 0) * r.salidas, 0);
  const porMetodo = {
    efectivo: filas.reduce((a, r) => a + r.efectivo, 0),
    tarjeta: filas.reduce((a, r) => a + r.tarjeta, 0),
    transferencia: filas.reduce((a, r) => a + r.transferencia, 0),
  };
  const porPeriodo = new Map<string, number>();
  for (const r of filas) porPeriodo.set(r.periodo, (porPeriodo.get(r.periodo) ?? 0) + r.valor);
  const mejor = [...porPeriodo].reduce<[string, number] | null>((a, x) => (!a || x[1] > a[1] ? x : a), null);
  const porSede = new Map<string, { sede: string; salidas: number; valor: number }>();
  for (const r of filas) {
    const s = porSede.get(r.sede) ?? { sede: r.sede, salidas: 0, valor: 0 };
    s.salidas += r.salidas;
    s.valor += r.valor;
    porSede.set(r.sede, s);
  }
  return {
    filas: filas.map((r) => ({ ...r, nombre: nombrePeriodo(r.periodo, f.agrupacion) })),
    resumen: {
      valor,
      salidas,
      ticketPromedio: salidas ? valor / salidas : null,
      permanenciaPromedio: salidas ? minutos / salidas : null,
      mejorPeriodo: mejor && mejor[1] > 0 ? { nombre: nombrePeriodo(mejor[0], f.agrupacion), valor: mejor[1] } : null,
      porSede: [...porSede.values()],
      porMetodo,
      dias: diasEntre(f.desde, f.hasta),
    },
  };
}

const COLUMNAS_INGRESOS: ColumnaCsv<FilaIngresos & { nombre: string }>[] = [
  { titulo: "Periodo", valor: (f) => f.nombre },
  { titulo: "Inicio del periodo", valor: (f) => f.periodo },
  { titulo: "Sede", valor: (f) => f.sede },
  { titulo: "Salidas", valor: (f) => f.salidas },
  { titulo: "Valor cobrado", valor: (f) => f.valor, decimales: 0 },
  { titulo: "Efectivo", valor: (f) => f.efectivo, decimales: 0 },
  { titulo: "Tarjeta", valor: (f) => f.tarjeta, decimales: 0 },
  { titulo: "Transferencia", valor: (f) => f.transferencia, decimales: 0 },
  { titulo: "Valor promedio por salida", valor: (f) => (f.salidas ? f.valor / f.salidas : null), decimales: 0 },
  { titulo: "Permanencia promedio (min)", valor: (f) => f.minutos_promedio, decimales: 0 },
];

export async function generar(tipo: TipoReporte, f: FiltrosReporte) {
  if (tipo === "ocupacion") return { ...(await ocupacion(f)), columnas: COLUMNAS_OCUPACION as ColumnaCsv<unknown>[] };
  if (tipo === "rotacion") return { ...(await rotacion(f)), columnas: COLUMNAS_ROTACION as ColumnaCsv<unknown>[] };
  return { ...(await ingresos(f)), columnas: COLUMNAS_INGRESOS as ColumnaCsv<unknown>[] };
}
