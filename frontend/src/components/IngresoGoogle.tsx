import { useEffect, useRef, useState } from "react";
import { api, ApiError, sesion, Usuario } from "../lib/api";
import { AvisoPrivacidad } from "./AvisoPrivacidad";

/**
 * Botón "Continuar con Google" (Google Identity Services).
 *
 * Google entrega un ID token firmado; el servidor lo verifica y responde con
 * la sesión de Parkway. Si la cuenta es nueva, primero se pide la
 * autorización de datos (Ley 1581 de 2012) y se reenvía la misma credencial.
 * Si el servidor no tiene GOOGLE_CLIENT_ID, el botón no aparece.
 */
interface GoogleId {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; context?: string }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let cargaScript: Promise<void> | null = null;
function cargarGoogle(): Promise<void> {
  cargaScript ??= new Promise((ok, falla) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      cargaScript = null;
      falla(new Error("No se pudo cargar Google"));
    };
    document.head.appendChild(s);
  });
  return cargaScript;
}

export function IngresoGoogle({ onIngresar, texto = "continue_with" }: { onIngresar: (u: Usuario) => void; texto?: "continue_with" | "signup_with" }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Cuenta nueva: datos de Google y credencial a la espera de la autorización.
  const [pendiente, setPendiente] = useState<{ credencial: string; nombre: string; correo: string } | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [comunicaciones, setComunicaciones] = useState(false);

  async function enviar(credencial: string, autorizacion?: { aceptaTratamiento: boolean; aceptaComunicaciones: boolean }) {
    setEnviando(true);
    setError(null);
    try {
      const r = await api.google({ credencial, ...autorizacion });
      sesion.guardar(r.token);
      onIngresar(r.usuario);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.campos.aceptaTratamiento && !autorizacion) {
        setPendiente({ credencial, nombre: e.campos.nombre ?? "", correo: e.campos.correo ?? "" });
      } else {
        setError((e as Error).message);
      }
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    let vivo = true;
    api
      .configuracionGoogle()
      .then(async ({ clientId }) => {
        if (!clientId || !vivo) return;
        await cargarGoogle();
        if (!vivo || !window.google || !contenedor.current) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => enviar(r.credential), context: texto === "signup_with" ? "signup" : "signin" });
        const oscuro = document.documentElement.dataset.theme !== "light";
        window.google.accounts.id.renderButton(contenedor.current, {
          type: "standard",
          theme: oscuro ? "filled_black" : "outline",
          size: "large",
          text: texto,
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.min(400, contenedor.current.offsetWidth || 400),
          locale: "es",
        });
        setDisponible(true);
      })
      .catch(() => undefined); // sin Google (sin conexión o sin configurar) queda el ingreso con correo
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pendiente) {
    return (
      <div className="google-autorizacion">
        <p>
          Vas a crear tu cuenta de cliente con <strong>{pendiente.correo}</strong>
          {pendiente.nombre ? <> a nombre de <strong>{pendiente.nombre}</strong></> : null}.
        </p>
        <details className="aviso-privacidad">
          <summary>Aviso de privacidad</summary>
          <AvisoPrivacidad />
        </details>
        <label className="casilla">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          <span>Autorizo a Parkway a tratar mis datos personales para prestarme el servicio, según el aviso de privacidad (Ley 1581 de 2012).</span>
        </label>
        <label className="casilla">
          <input type="checkbox" checked={comunicaciones} onChange={(e) => setComunicaciones(e.target.checked)} />
          <span>Quiero recibir información sobre sedes, tarifas y novedades (opcional).</span>
        </label>
        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
        <button
          type="button"
          className="boton boton-primario boton-ancho"
          disabled={!acepta || enviando}
          onClick={() => enviar(pendiente.credencial, { aceptaTratamiento: true, aceptaComunicaciones: comunicaciones })}
        >
          {enviando ? "Creando cuenta..." : "Crear mi cuenta"}
        </button>
        <button type="button" className="enlace google-cancelar" onClick={() => setPendiente(null)}>Usar otra cuenta</button>
      </div>
    );
  }

  return (
    <div className="ingreso-google" hidden={!disponible && !error}>
      {disponible && <div className="separador-o" role="separator"><span>o</span></div>}
      <div ref={contenedor} className="google-boton" aria-busy={enviando} />
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
    </div>
  );
}
