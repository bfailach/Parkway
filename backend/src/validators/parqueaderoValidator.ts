import { TIPOS_VEHICULO } from "./ingresoValidator";
import type { Horario } from "../services/horarioService";

/**
 * Validación de los datos de una sede que crea o edita el administrador:
 * nombre, ubicación, cantidad de espacios por tipo, tarifas, horarios y
 * operadores con acceso. Función pura, probada en tests/parqueadero.test.ts.
 */
export interface TarifaSede {
  idTipo: number;
  valor_hora: number;
  valor_fraccion: number;
  valor_dia: number;
}

export interface DatosParqueadero {
  nombre: string;
  direccion: string;
  ciudad: string;
  latitud: number | null;
  longitud: number | null;
  /** Cantidad de pisos (1 a MAX_PISOS). */
  pisos: number;
  /** Espacios por piso y tipo: espaciosPorPiso[0] es el piso 1, { 1: 15, 2: 10, 3: 6 }. */
  espaciosPorPiso: Record<number, number>[];
  /** Total de espacios por tipo de vehículo en toda la sede. */
  espacios: Record<number, number>;
  tarifas: TarifaSede[];
  horarios: Horario[];
  operadores: number[];
}

type Resultado = { valido: true; datos: DatosParqueadero } | { valido: false; errores: Record<string, string> };

/**
 * Límites de una sede, pensados para los parqueaderos de Bogotá: la mayoría
 * son lotes o edificios pequeños y medianos, y un piso de un edificio de
 * parqueaderos recibe entre 50 y 150 carros. Por piso: 150 automóviles,
 * 80 motocicletas y 60 bicicletas. Por sede: 600, 300 y 200, y como máximo
 * 800 espacios en total.
 */
export const LIMITE_POR_PISO: Record<number, number> = { 1: 150, 2: 80, 3: 60 };
export const LIMITE_POR_SEDE: Record<number, number> = { 1: 600, 2: 300, 3: 200 };
export const LIMITE_TOTAL_SEDE = 800;
export const MAX_PISOS = 6;
const NOMBRE_PLURAL: Record<number, string> = { 1: "automóviles", 2: "motocicletas", 3: "bicicletas" };
const TIPOS = Object.values(TIPOS_VEHICULO) as number[];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const texto = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");

function numeroOpcional(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function validarParqueadero(body: Record<string, unknown>): Resultado {
  const errores: Record<string, string> = {};

  const nombre = texto(body.nombre);
  if (nombre.length < 3) errores.nombre = "Escriba el nombre de la sede";
  else if (nombre.length > 80) errores.nombre = "Máximo 80 caracteres";

  const direccion = texto(body.direccion);
  if (!direccion) errores.direccion = "Escriba la dirección";
  else if (direccion.length > 150) errores.direccion = "Máximo 150 caracteres";

  const ciudad = texto(body.ciudad) || "Bogotá";
  if (ciudad.length > 60) errores.ciudad = "Máximo 60 caracteres";

  const latitud = numeroOpcional(body.latitud);
  const longitud = numeroOpcional(body.longitud);
  if (latitud === undefined || (latitud !== null && (latitud < -90 || latitud > 90))) errores.latitud = "Entre -90 y 90";
  if (longitud === undefined || (longitud !== null && (longitud < -180 || longitud > 180))) errores.longitud = "Entre -180 y 180";
  if ((latitud === null) !== (longitud === null) && !errores.latitud && !errores.longitud) {
    errores[latitud === null ? "latitud" : "longitud"] = "Escriba la latitud y la longitud, o ninguna";
  }

  // Pisos y espacios por piso. Si no llega espaciosPorPiso, `espacios` se
  // toma como los espacios de una sede de un solo piso.
  const pisos = body.pisos === undefined || body.pisos === "" ? 1 : Number(body.pisos);
  const pisosValido = Number.isInteger(pisos) && pisos >= 1 && pisos <= MAX_PISOS;
  if (!pisosValido) errores.pisos = `Entre 1 y ${MAX_PISOS} pisos`;
  const porPisoBody = Array.isArray(body.espaciosPorPiso)
    ? (body.espaciosPorPiso as Record<string, unknown>[])
    : [(body.espacios ?? {}) as Record<string, unknown>];
  const nPisos = pisosValido ? pisos : 1;
  const espaciosPorPiso: Record<number, number>[] = [];
  const espacios: Record<number, number> = Object.fromEntries(TIPOS.map((t) => [t, 0]));
  for (let i = 0; i < nPisos; i++) {
    const piso = i + 1;
    const fila = porPisoBody[i] ?? {};
    const deEstePiso: Record<number, number> = {};
    let conError = false;
    for (const t of TIPOS) {
      const n = Number(fila[t] ?? 0);
      if (!Number.isInteger(n) || n < 0 || n > LIMITE_POR_PISO[t]) {
        errores[`espacios.${piso}.${t}`] = `Entre 0 y ${LIMITE_POR_PISO[t]} ${NOMBRE_PLURAL[t]} por piso`;
        conError = true;
      } else {
        deEstePiso[t] = n;
        espacios[t] += n;
      }
    }
    if (!conError && TIPOS.every((t) => deEstePiso[t] === 0)) {
      errores[nPisos === 1 ? "espacios" : `espacios.${piso}`] =
        nPisos === 1 ? "La sede necesita al menos un espacio" : `El piso ${piso} necesita al menos un espacio`;
    }
    espaciosPorPiso.push(deEstePiso);
  }
  for (const t of TIPOS) {
    if (espacios[t] > LIMITE_POR_SEDE[t]) errores[`espacios.total.${t}`] = `Máximo ${LIMITE_POR_SEDE[t]} ${NOMBRE_PLURAL[t]} en la sede`;
  }
  const totalSede = TIPOS.reduce((s, t) => s + espacios[t], 0);
  if (totalSede > LIMITE_TOTAL_SEDE) errores["espacios.total"] = `Máximo ${LIMITE_TOTAL_SEDE} espacios en la sede`;

  // Tarifas: obligatorias para cada tipo que tenga espacios
  const tarifasBody = Array.isArray(body.tarifas) ? (body.tarifas as Record<string, unknown>[]) : [];
  const tarifas: TarifaSede[] = [];
  for (const t of TIPOS) {
    if (!espacios[t]) continue;
    const f = tarifasBody.find((x) => Number(x?.idTipo) === t);
    const valores = ["valor_hora", "valor_fraccion", "valor_dia"].map((k) => Number(f?.[k]));
    ["valor_hora", "valor_fraccion", "valor_dia"].forEach((k, i) => {
      const v = valores[i];
      if (!f || f[k] === "" || f[k] == null || !Number.isInteger(v) || v < 0 || v > 1000000) errores[`tarifas.${t}.${k}`] = "Valor entero entre 0 y 1.000.000";
    });
    const [hora, fraccion, dia] = valores;
    if (!errores[`tarifas.${t}.valor_hora`] && !errores[`tarifas.${t}.valor_fraccion`] && fraccion > hora) {
      errores[`tarifas.${t}.valor_fraccion`] = "No puede superar el valor de la hora";
    }
    if (!errores[`tarifas.${t}.valor_hora`] && !errores[`tarifas.${t}.valor_dia`] && dia < hora) {
      errores[`tarifas.${t}.valor_dia`] = "No puede ser menor que el valor de la hora";
    }
    tarifas.push({ idTipo: t, valor_hora: hora, valor_fraccion: fraccion, valor_dia: dia });
  }

  // Horarios
  const horariosBody = Array.isArray(body.horarios) ? (body.horarios as Record<string, unknown>[]) : [];
  const horarios: Horario[] = [];
  const vistos = new Set<number>();
  for (const h of horariosBody) {
    const dia = Number(h?.dia);
    const abre = String(h?.abre ?? "");
    const cierra = String(h?.cierra ?? "");
    if (!Number.isInteger(dia) || dia < 1 || dia > 7 || vistos.has(dia)) {
      errores.horarios = "Día de la semana inválido o repetido";
      continue;
    }
    vistos.add(dia);
    if (!HORA.test(abre) || !(HORA.test(cierra) || cierra === "24:00")) errores[`horarios.${dia}`] = "Hora inválida (HH:MM)";
    else if (cierra !== "24:00" && cierra <= abre) errores[`horarios.${dia}`] = "La hora de cierre debe ser posterior a la de apertura";
    else horarios.push({ dia, abre, cierra });
  }
  if (!horariosBody.length) errores.horarios = "Indique al menos un día de atención";
  horarios.sort((a, b) => a.dia - b.dia);

  // Operadores con acceso
  const operadores = Array.isArray(body.operadores) ? body.operadores.map(Number) : [];
  if (operadores.some((id) => !Number.isInteger(id) || id <= 0)) errores.operadores = "Operador inválido";

  if (Object.keys(errores).length) return { valido: false, errores };
  return {
    valido: true,
    datos: {
      nombre,
      direccion,
      ciudad,
      latitud: latitud as number | null,
      longitud: longitud as number | null,
      pisos,
      espaciosPorPiso,
      espacios,
      tarifas,
      horarios,
      operadores: [...new Set(operadores)],
    },
  };
}
