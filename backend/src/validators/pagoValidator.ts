/**
 * Validación del pago que registra el operador al dar la salida (RF08) y
 * de la anulación que hace el administrador (RF09). Funciones puras,
 * probadas en tests/pagos.test.ts.
 *
 * Los pagos electrónicos se simulan (el documento deja fuera la conexión
 * con una pasarela real): el operador digita el número de aprobación del
 * datáfono o la referencia de la transferencia, y el sistema impide
 * registrar dos veces la misma.
 */
export const METODOS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"] as const;
export type MetodoPago = (typeof METODOS)[number];

export interface DatosPago {
  metodo: MetodoPago;
  /** Tarjeta o transferencia. */
  referencia: string | null;
  /** Efectivo: lo que entregó el cliente. Si no se indica, se asume el valor exacto. */
  recibido: number | null;
}

type Resultado<T> = { valido: true; datos: T } | { valido: false; errores: Record<string, string> };

/** Lo máximo que se acepta en efectivo de una vez: evita errores de digitación. */
export const MAXIMO_EFECTIVO = 2_000_000;

export function validarPago(body: Record<string, unknown>): Resultado<DatosPago> {
  const errores: Record<string, string> = {};
  const metodo = String(body.metodo ?? "").trim().toUpperCase() as MetodoPago;
  if (!METODOS.includes(metodo)) errores.metodo = "Elija el medio de pago";

  let referencia: string | null = null;
  const textoRef = String(body.referencia ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (metodo === "TARJETA") {
    if (!textoRef) errores.referencia = "Digite el número de aprobación del datáfono";
    else if (!/^\d{4,12}$/.test(textoRef)) errores.referencia = "El número de aprobación tiene de 4 a 12 dígitos";
    else referencia = textoRef;
  } else if (metodo === "TRANSFERENCIA") {
    if (!textoRef) errores.referencia = "Digite la referencia de la transferencia";
    else if (!/^[A-Z0-9-]{4,30}$/.test(textoRef)) errores.referencia = "Use de 4 a 30 letras, números o guiones";
    else referencia = textoRef;
  }

  let recibido: number | null = null;
  if (metodo === "EFECTIVO" && body.recibido !== undefined && body.recibido !== null && body.recibido !== "") {
    const n = Number(String(body.recibido).replace(/[$.\s]/g, ""));
    if (!Number.isInteger(n) || n <= 0) errores.recibido = "Digite el valor recibido en pesos";
    else if (n > MAXIMO_EFECTIVO) errores.recibido = "El valor recibido es demasiado alto";
    else recibido = n;
  }

  if (Object.keys(errores).length) return { valido: false, errores };
  return { valido: true, datos: { metodo, referencia, recibido } };
}

/**
 * Cambio para el cliente. Si no se indicó lo recibido, se asume el valor
 * exacto. Devuelve null si lo recibido no alcanza.
 */
export function calcularCambio(monto: number, recibido: number | null): { recibido: number; cambio: number } | null {
  const r = recibido ?? monto;
  return r < monto ? null : { recibido: r, cambio: r - monto };
}

/** Número del comprobante: PKW-2026-000123. */
export function numeroComprobante(anio: number, consecutivo: number): string {
  return `PKW-${anio}-${String(consecutivo).padStart(6, "0")}`;
}

export function validarAnulacion(body: Record<string, unknown>): Resultado<{ motivo: string }> {
  const motivo = String(body.motivo ?? "").trim().replace(/\s+/g, " ");
  if (motivo.length < 10) return { valido: false, errores: { motivo: "Explique el motivo en al menos 10 caracteres" } };
  if (motivo.length > 300) return { valido: false, errores: { motivo: "Máximo 300 caracteres" } };
  return { valido: true, datos: { motivo } };
}
