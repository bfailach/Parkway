/**
 * Canal de PostgreSQL para avisos de actividad:
 * { "tipo": "actividad", "sede": 1, "operacion": "INGRESO" }.
 */
export const CANAL_AVISOS = "parkway_avisos";

export interface AvisoActividad {
  tipo: "actividad";
  sede: number;
  operacion: string;
}

/** Lee un aviso del canal. Solo deja pasar la forma esperada, sin otros campos. */
export function leerAvisoPersonal(payload: string | undefined): AvisoActividad | null {
  try {
    const m = JSON.parse(payload ?? "");
    const sede = Number(m.sede);
    const operacion = String(m.operacion ?? "");
    return m.tipo === "actividad" && Number.isInteger(sede) && sede > 0 && /^[A-Z_]{3,30}$/.test(operacion)
      ? { tipo: "actividad", sede, operacion }
      : null;
  } catch {
    return null;
  }
}
