import { useEffect, useRef, useState } from "react";
import { ActividadPersonal, api, QrSede as Qr } from "../lib/api";
import { escucharAvisos } from "../lib/tiempoReal";
import { VerificacionQr } from "./VerificacionQr";

/**
 * QR de entrada de la sede (autoservicio). El operador lo muestra en la
 * portería; el cliente lo escanea y registra su ingreso desde su cuenta.
 *
 * Por seguridad el código vale solo 2 minutos: esta pantalla lo renueva
 * sola antes de que venza, así que una foto del código no sirve para
 * registrar el ingreso desde otro lugar más tarde. Por eso no se imprime;
 * se deja a la vista en una pantalla o tableta de la portería.
 *
 * Cuando un cliente registra su ingreso con el código, el QR se oculta y
 * aparece la confirmación (placa, cliente, espacio y hora); el operador lo
 * vuelve a mostrar para el siguiente cliente. El aviso general también llega.
 */
export function QrSede({ idSede, nombre }: { idSede: number; nombre: string }) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [restante, setRestante] = useState(0);
  const [confirmado, setConfirmado] = useState<ActividadPersonal | null>(null);
  const [resultado, setResultado] = useState<"verificado" | "anulado" | null>(null);
  const caja = useRef<HTMLElement>(null);
  const mostradoDesde = useRef<string>(new Date().toISOString());

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

  // Mientras el QR está a la vista, un ingreso con QR en esta sede lo oculta y muestra la confirmación.
  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    const quitar = escucharAvisos(async (a) => {
      if (a.tipo !== "actividad" || a.operacion !== "INGRESO" || a.sede !== idSede) return;
      try {
        const lista = await api.actividad(idSede, mostradoDesde.current);
        const qr = lista.find((x) => x.operacion === "INGRESO" && x.origen === "QR");
        if (qr && vivo) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
          setConfirmado(qr);
          setResultado(null);
          setVisible(false);
          setQr(null);
        }
      } catch {
        /* el aviso general sigue llegando aunque esta consulta falle */
      }
    });
    return () => {
      vivo = false;
      quitar();
    };
  }, [visible, idSede]);

  const mostrar = () => {
    mostradoDesde.current = new Date().toISOString();
    setConfirmado(null);
    setResultado(null);
    setVisible(true);
    pedir();
  };

  if (!visible) {
    return (
      <div className="qr-sede">
        {confirmado && (
          <div className="tarjeta qr-confirmacion" role="status" aria-live="polite">
            <p className="qr-confirmacion-titulo">
              {resultado === "anulado" ? "Ingreso anulado" : resultado === "verificado" ? "Ingreso con QR verificado" : "Ingreso con QR registrado: verifique el vehículo"}
            </p>
            {resultado === null ? (
              <VerificacionQr
                datos={{
                  idRegistro: Number(confirmado.id_entidad),
                  placa: confirmado.placa ?? "",
                  tipo: confirmado.tipo,
                  marca: confirmado.marca,
                  color: confirmado.color,
                  cliente: confirmado.actor,
                  espacio: confirmado.espacio,
                  fecha: confirmado.fecha,
                }}
                onListo={setResultado}
              />
            ) : (
              <p>
                <b>{confirmado.placa}</b> ·{" "}
                {resultado === "anulado" ? `el espacio ${confirmado.espacio} quedó libre y no se cobró nada.` : `espacio ${confirmado.espacio}. Puede seguir.`}
              </p>
            )}
            {resultado !== null && (
              <div className="acciones">
                <button className="boton boton-primario" onClick={mostrar}>Mostrar QR para el siguiente cliente</button>
                <button className="boton" onClick={() => setConfirmado(null)}>Cerrar</button>
              </div>
            )}
          </div>
        )}
        {!confirmado && (
          <button className="boton" onClick={mostrar}>
            Mostrar QR de entrada
          </button>
        )}
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
