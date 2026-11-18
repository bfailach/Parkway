import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AvisoPrivacidad } from "./AvisoPrivacidad";

/**
 * Ley 1581 de 2012: las cuentas creadas antes de la política de datos no
 * tienen la autorización registrada. Al iniciar sesión se les pide, con el
 * aviso de privacidad a la vista. Las cuentas nuevas ya la dieron al
 * registrarse, así que para ellas no aparece.
 */
export function BannerAutorizacion() {
  const [pendiente, setPendiente] = useState(false);
  const [comunicaciones, setComunicaciones] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .consentimientos()
      .then((c) => setPendiente(c.registroDisponible !== false && c.vigentes.some((v) => v.finalidad === "SERVICIO" && v.otorgado === null)))
      .catch(() => undefined); // si la base no tiene la migración, no se muestra
  }, []);

  if (!pendiente) return null;

  async function autorizar() {
    setGuardando(true);
    setError(null);
    try {
      await api.cambiarConsentimiento("SERVICIO", true);
      await api.cambiarConsentimiento("COMUNICACIONES", comunicaciones);
      setPendiente(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="tarjeta banner-autorizacion" aria-labelledby="banner-autorizacion-titulo">
      <h2 id="banner-autorizacion-titulo">Autoriza el tratamiento de tus datos</h2>
      <p>
        Actualizamos nuestra política de datos personales (Ley 1581 de 2012). Para seguir prestándote el servicio necesitamos tu
        autorización para tratar los datos de tu cuenta, tus vehículos, reservas y pagos.
      </p>
      <details className="aviso-privacidad">
        <summary>Leer el aviso de privacidad</summary>
        <AvisoPrivacidad />
      </details>
      <label className="casilla">
        <input type="checkbox" checked={comunicaciones} onChange={(e) => setComunicaciones(e.target.checked)} />
        <span>También quiero recibir información sobre sedes, tarifas y novedades (opcional).</span>
      </label>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="boton boton-primario" disabled={guardando} onClick={autorizar}>
          {guardando ? "Guardando…" : "Autorizo el tratamiento de mis datos"}
        </button>
      </div>
    </section>
  );
}
