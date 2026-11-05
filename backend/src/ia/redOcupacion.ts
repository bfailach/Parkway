import pesos from "./pesos_red.json";

/**
 * Red neuronal de ocupación (perceptrón multicapa 6-8-1).
 *
 * Los pesos se entrenan con ia/entrenar_red.py y se guardan en pesos_red.json.
 * Aquí solo se hace el cálculo hacia adelante:
 *   h = ReLU(W1·x + b1)
 *   ŷ = sigmoide(w2·h + b2)
 * Son 65 parámetros, así que la predicción tarda menos de un milisegundo.
 */
export interface PesosRed {
  W1: number[][]; // 6 filas (entradas) × 8 columnas (neuronas ocultas)
  b1: number[];
  w2: number[];
  b2: number;
}

export interface EntradasRed {
  /** Hora local de la consulta, 0 a 23. */
  hora: number;
  /** Día de la semana, 0 = lunes ... 6 = domingo. */
  dia: number;
  festivo: boolean;
  /** Ocupación actual de la sede (0 a 1). */
  ocupacionActual: number;
  /** Ocupación a la misma hora hace siete días (0 a 1). */
  ocupacionSemanaAnterior: number;
  /** Reservas activas en camino sobre la capacidad (0 a 1). */
  reservas: number;
}

export const PESOS: PesosRed = pesos as PesosRed;
export const METRICAS = (pesos as { metricas: Record<string, number> }).metricas;

const acotar = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** Escala las entradas al rango de 0 a 1, en el mismo orden del entrenamiento. */
export function vectorEntrada(e: EntradasRed): number[] {
  return [
    e.hora / 23,
    e.dia / 6,
    e.festivo ? 1 : 0,
    acotar(e.ocupacionActual),
    acotar(e.ocupacionSemanaAnterior),
    acotar(e.reservas),
  ];
}

export function predecir(x: number[], p: PesosRed = PESOS): { y: number; ocultas: number[] } {
  const ocultas = p.b1.map((b, j) => Math.max(0, x.reduce((s, xi, i) => s + xi * p.W1[i][j], b)));
  const z = ocultas.reduce((s, h, j) => s + h * p.w2[j], p.b2);
  return { y: 1 / (1 + Math.exp(-z)), ocultas };
}

// ------------------------------------------------------------- festivos
function pascua(anio: number): Date {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

const masDias = (f: Date, n: number) => new Date(f.getTime() + n * 86400000);
/** Ley Emiliani: el festivo se corre al lunes siguiente. */
const alLunes = (f: Date) => masDias(f, (8 - f.getUTCDay()) % 7);
const clave = (f: Date) => f.toISOString().slice(0, 10);

const cache = new Map<number, Set<string>>();
export function festivosColombia(anio: number): Set<string> {
  let s = cache.get(anio);
  if (s) return s;
  const fecha = (m: number, d: number) => new Date(Date.UTC(anio, m - 1, d));
  const p = pascua(anio);
  const lista = [
    ...[[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].map(([m, d]) => fecha(m, d)),
    ...[[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].map(([m, d]) => alLunes(fecha(m, d))),
    masDias(p, -3), masDias(p, -2),
    ...[39, 60, 68].map((n) => alLunes(masDias(p, n))),
  ];
  s = new Set(lista.map(clave));
  cache.set(anio, s);
  return s;
}

/** true si la fecha (AAAA-MM-DD) es festivo en Colombia. */
export const esFestivo = (fechaISO: string) => festivosColombia(Number(fechaISO.slice(0, 4))).has(fechaISO);
