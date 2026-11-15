/**
 * Filtros de la bitácora de transacciones (RF14): usuario, tipo de
 * operación, entidad, estado y rango de fechas. Función pura, probada en
 * tests/bitacora.test.ts.
 */
export interface FiltrosBitacora {
  idUsuario?: number;
  tipo?: string;
  entidad?: string;
  idEntidad?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
}

type Resultado = { valido: true; filtros: FiltrosBitacora } | { valido: false; errores: Record<string, string> };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const NOMBRE = /^[A-Za-z_]{1,40}$/;
const ESTADOS = ["INICIADA", "CONFIRMADA", "REVERTIDA"];

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function leerFiltrosBitacora(q: Record<string, unknown>): Resultado {
  const errores: Record<string, string> = {};
  const f: FiltrosBitacora = {};

  const usuario = texto(q.idUsuario);
  if (usuario !== undefined) {
    const n = Number(usuario);
    if (!Number.isInteger(n) || n <= 0) errores.idUsuario = "Usuario inválido";
    else f.idUsuario = n;
  }

  const tipo = texto(q.tipo);
  if (tipo !== undefined) {
    if (!NOMBRE.test(tipo)) errores.tipo = "Operación inválida";
    else f.tipo = tipo.toUpperCase();
  }

  const entidad = texto(q.entidad);
  if (entidad !== undefined) {
    if (!NOMBRE.test(entidad)) errores.entidad = "Entidad inválida";
    else f.entidad = entidad.toLowerCase();
  }

  const idEntidad = texto(q.idEntidad);
  if (idEntidad !== undefined) {
    if (!/^[A-Za-z0-9-]{1,20}$/.test(idEntidad)) errores.idEntidad = "Identificador inválido";
    else f.idEntidad = idEntidad;
  }

  const estado = texto(q.estado);
  if (estado !== undefined) {
    if (!ESTADOS.includes(estado.toUpperCase())) errores.estado = "Estado inválido";
    else f.estado = estado.toUpperCase();
  }

  for (const k of ["desde", "hasta"] as const) {
    const v = texto(q[k]);
    if (v === undefined) continue;
    if (!FECHA.test(v) || Number.isNaN(Date.parse(v))) errores[k] = "Fecha inválida (AAAA-MM-DD)";
    else f[k] = v;
  }
  if (f.desde && f.hasta && f.desde > f.hasta) errores.hasta = "La fecha final es anterior a la inicial";

  if (Object.keys(errores).length) return { valido: false, errores };
  return { valido: true, filtros: f };
}
