/** Canal de PostgreSQL para avisos al personal (por ahora, ingresos con QR). */
export const CANAL_AVISOS = "parkway_avisos";

/** Lee un aviso del canal parkway_avisos. Solo deja pasar tipos conocidos con su sede. */
export function leerAvisoPersonal(payload: string | undefined): { tipo: "ingreso-qr"; sede: number } | null {
  try {
    const m = JSON.parse(payload ?? "");
    const sede = Number(m.sede);
    return m.tipo === "ingreso-qr" && Number.isInteger(sede) && sede > 0 ? { tipo: "ingreso-qr", sede } : null;
  } catch {
    return null;
  }
}
