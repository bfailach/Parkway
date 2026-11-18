import { useEffect, useState } from "react";
import { api, Consentimientos } from "../lib/api";
import { AvisoPrivacidad } from "./AvisoPrivacidad";

/** Autorizaciones de tratamiento de datos (Ley 1581 de 2012): ver, otorgar y revocar la opcional. */
export function Privacidad() {
  const [c, setC] = useState<Consentimientos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.consentimientos().then(setC).catch((e) => setError(e.message));
  }, []);

  async function cambiar(finalidad: string, otorgado: boolean) {
    setGuardando(true);
    setError(null);
    try {
      setC(await api.cambiarConsentimiento(finalidad, otorgado));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const fecha = (f: string | null) => (f ? new Date(f).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "");
  const servicio = c?.vigentes.find((v) => v.finalidad === "SERVICIO");
  const comunicaciones = c?.vigentes.find((v) => v.finalidad === "COMUNICACIONES");

  return (
    <section className="formulario panel-form panel-privacidad" aria-labelledby="privacidad-titulo">
      <h2 id="privacidad-titulo" className="privacidad-titulo">Privacidad y datos personales</h2>
      <p className="campo-ayuda">Autorizaciones que diste según la Ley 1581 de 2012. La opcional la puedes cambiar cuando quieras.</p>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {servicio && (
        <div className="privacidad-fila">
          <span className="interruptor-texto">
            <strong>Prestación del servicio (necesaria)</strong>
            <span>
              {servicio.otorgado
                ? `Autorizada el ${fecha(servicio.fecha)}`
                : "Tu cuenta es anterior a la política y no tiene la autorización registrada."}
            </span>
          </span>
          {!servicio.otorgado && (
            <button className="boton boton-secundario" disabled={guardando} onClick={() => cambiar("SERVICIO", true)}>Autorizar</button>
          )}
        </div>
      )}
      {comunicaciones && (
        <label className="interruptor">
          <span className="interruptor-texto">
            <strong>Comunicaciones sobre sedes y novedades (opcional)</strong>
            <span>{comunicaciones.otorgado === null ? "Sin decisión registrada." : `${comunicaciones.otorgado ? "Autorizadas" : "No autorizadas"} desde el ${fecha(comunicaciones.fecha)}`}</span>
          </span>
          <input type="checkbox" role="switch" checked={!!comunicaciones.otorgado} disabled={guardando} onChange={(e) => cambiar("COMUNICACIONES", e.target.checked)} />
          <span className="interruptor-pista" aria-hidden="true" />
        </label>
      )}
      <details className="aviso-privacidad">
        <summary>Ver el aviso de privacidad</summary>
        <AvisoPrivacidad />
      </details>
    </section>
  );
}
