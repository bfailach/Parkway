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
  /** Cantidad de espacios por tipo de vehículo: { 1: 30, 2: 10, 3: 0 }. */
  espacios: Record<number, number>;
  tarifas: TarifaSede[];
  horarios: Horario[];
  operadores: number[];
}

type Resultado = { valido: true; datos: DatosParqueadero } | { valido: false; errores: Record<string, string> };

export const MAX_ESPACIOS_POR_TIPO = 300;
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

  // Espacios por tipo
  const espaciosBody = (body.espacios ?? {}) as Record<string, unknown>;
  const espacios: Record<number, number> = {};
  for (const t of TIPOS) {
    const n = Number(espaciosBody[t] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > MAX_ESPACIOS_POR_TIPO) errores[`espacios.${t}`] = `Entre 0 y ${MAX_ESPACIOS_POR_TIPO}`;
    else espacios[t] = n;
  }
  if (!TIPOS.some((t) => errores[`espacios.${t}`]) && TIPOS.every((t) => espacios[t] === 0)) {
    errores.espacios = "La sede necesita al menos un espacio";
  }

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
      espacios,
      tarifas,
      horarios,
      operadores: [...new Set(operadores)],
    },
  };
}
