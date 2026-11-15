import { MetodoPago, Registro } from "../lib/api";

const METODO: Record<MetodoPago, string> = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia" };

/** Comprobante y medio de pago de una visita en las tablas de historial (RF08). */
export function CeldaPago({ r }: { r: Registro }) {
  if (!r.comprobante) return <span className="tenue">Sin pago</span>;
  return (
    <>
      <span className={r.estado_pago === "ANULADO" ? "tachado" : undefined}>{r.comprobante}</span>
      <span className="celda-sub tenue">
        {r.metodo_pago ? METODO[r.metodo_pago] : ""}
        {r.estado_pago === "ANULADO" ? " · anulado" : ""}
      </span>
    </>
  );
}
