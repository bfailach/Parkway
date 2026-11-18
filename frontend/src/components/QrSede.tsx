import { useEffect, useRef, useState } from "react";
import { api, QrSede as Qr } from "../lib/api";

/**
 * QR de entrada de la sede (autoservicio). El operador lo muestra en la
 * portería; el cliente lo escanea y registra su ingreso desde su cuenta.
 *
 * Por seguridad el código vale solo 2 minutos: esta pantalla lo renueva
 * sola antes de que venza, así que una foto del código no sirve para
 * registrar el ingreso desde otro lugar más tarde. Por eso no se imprime;
 * se deja a la vista en una pantalla o tableta de la portería.
 */
export function QrSede({ idSede, nombre }: { idSede: number; nombre: string }) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [restante, setRestante] = useState(0);
  const caja = useRef<HTMLElement>(null);

  async function pedir() {
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

  // Renovación automática 20 s antes de que venza y cuenta regresiva.
  useEffect(() => {
    if (!visible || !qr) return;
    const vence = new Date(qr.expira).getTime();
    const tic = window.setInterval(() => setRestante(Math.max(0, Math.round((vence - Date.now()) / 1000))), 1000);
    setRestante(Math.max(0, Math.round((vence - Date.now()) / 1000)));
    const renovar = window.setTimeout(pedir, Math.max(1000, vence - Date.now() - 20_000));
    return () => {
      window.clearInterval(tic);
      window.clearTimeout(renovar);
    };
  }, [visible, qr]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) {
    return (
      <div className="qr-sede">
        <button
          className="boton"
          onClick={() => {
            setVisible(true);
            pedir();
          }}
        >
          Mostrar QR de entrada
        </button>
      </div>
    );
  }
  return (
    <section ref={caja} className="tarjeta qr-sede" aria-label={`Código QR de entrada de ${nombre}`}>
      <h2>Entrada con QR · {qr?.nombre ?? nombre}</h2>
      <p className="ayuda">
        El cliente lo escanea desde Parkway (<b>Mi parqueo → Escanear QR de entrada</b>) o con la cámara del celular. El código cambia cada 2 minutos.
      </p>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {qr ? (
        <>
          <div className="qr-imagen" dangerouslySetInnerHTML={{ __html: qr.svg }} />
          <p className="qr-renueva" aria-live="off">{cargando ? "Renovando…" : `Se renueva solo · vence en ${restante} s`}</p>
        </>
      ) : (
        <p>Generando…</p>
      )}
      <div className="acciones">
        <button className="boton" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : caja.current?.requestFullscreen?.())}>
          Pantalla completa
        </button>
        <button
          className="boton"
          onClick={() => {
            setVisible(false);
            setQr(null);
          }}
        >
          Ocultar
        </button>
      </div>
    </section>
  );
}
