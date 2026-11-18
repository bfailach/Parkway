import { useState } from "react";
import { api, QrSede as Qr } from "../lib/api";

/**
 * QR de entrada de la sede (autoservicio). El operador lo muestra en la
 * portería; el cliente lo escanea con la cámara del celular y registra su
 * ingreso desde su cuenta.
 */
export function QrSede({ idSede, nombre }: { idSede: number; nombre: string }) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function mostrar() {
    setCargando(true);
    setError(null);
    try {
      setQr(await api.qrIngreso(idSede));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  if (!qr) {
    return (
      <div className="qr-sede">
        <button className="boton" onClick={mostrar} disabled={cargando}>{cargando ? "Generando..." : "Mostrar QR de entrada"}</button>
        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <section className="tarjeta qr-sede" aria-label={`Código QR de entrada de ${nombre}`}>
      <h2>Entrada con QR · {qr.nombre}</h2>
      <p className="ayuda">El cliente lo escanea con la cámara, inicia sesión y elige su vehículo. Vale hasta el {new Date(qr.expira).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</p>
      <div className="qr-imagen" dangerouslySetInnerHTML={{ __html: qr.svg }} />
      <div className="acciones">
        <button className="boton" onClick={() => window.print()}>Imprimir</button>
        <button className="boton" onClick={() => setQr(null)}>Ocultar</button>
      </div>
    </section>
  );
}
