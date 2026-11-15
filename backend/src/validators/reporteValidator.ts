/**
 * Filtros de los reportes del administrador (RF13). Función pura, probada
 * en tests/reportes.test.ts.
 */
export type Agrupacion = "dia" | "semana" | "mes";

export interface FiltrosReporte {
  /** Sin sede: todas las sedes juntas. */
  idParqueadero?: number;
  /** Sin tipo: todos los tipos de vehículo. */
  idTipo?: number;
  /** Fechas AAAA-MM-DD, ambas incluidas. */
  desde: string;
  hasta: string;
  /** Solo para el reporte de ingresos. */
  agrupacion: Agrupacion;
}

type Resultado = { valido: true; filtros: FiltrosReporte } | { valido: false; errores: Record<string, string> };

/** Un año como máximo: los reportes se calculan al momento. */
export const MAX_DIAS_REPORTE = 366;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function entero(v: unknown): number | null | undefined {
  const t = texto(v);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000) + 1;

export function leerFiltrosReporte(q: Record<string, unknown>): Resultado {
  const errores: Record<string, string> = {};

  const sede = entero(q.idParqueadero);
  if (sede === null) errores.idParqueadero = "Sede inválida";
  const tipo = entero(q.idTipo);
  if (tipo === null || (tipo !== undefined && tipo > 3)) errores.idTipo = "Tipo de vehículo inválido";

  const desde = texto(q.desde);
  const hasta = texto(q.hasta);
  if (!desde) errores.desde = "Indique la fecha inicial";
  else if (!FECHA.test(desde) || Number.isNaN(Date.parse(desde))) errores.desde = "Fecha inválida (AAAA-MM-DD)";
  if (!hasta) errores.hasta = "Indique la fecha final";
  else if (!FECHA.test(hasta) || Number.isNaN(Date.parse(hasta))) errores.hasta = "Fecha inválida (AAAA-MM-DD)";
  if (!errores.desde && !errores.hasta && desde! > hasta!) errores.hasta = "La fecha final es anterior a la inicial";
  else if (!errores.desde && !errores.hasta && diasEntre(desde!, hasta!) > MAX_DIAS_REPORTE) {
    errores.hasta = `El periodo puede tener máximo ${MAX_DIAS_REPORTE} días`;
  }

  const agrupacion = (texto(q.agrupacion) ?? "dia").toLowerCase();
  if (!["dia", "semana", "mes"].includes(agrupacion)) errores.agrupacion = "Agrupe por día, semana o mes";

  if (Object.keys(errores).length) return { valido: false, errores };
  return {
    valido: true,
    filtros: {
      ...(sede ? { idParqueadero: sede } : {}),
      ...(tipo ? { idTipo: tipo } : {}),
      desde: desde!,
      hasta: hasta!,
      agrupacion: agrupacion as Agrupacion,
    },
  };
}
