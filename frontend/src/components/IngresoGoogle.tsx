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

  // Escala la capa de Google para que cubra exactamente el botón visible.
  const raiz = useRef<HTMLDivElement>(null);
  function ajustarCapa() {
    const capa = contenedor.current;
    const caja = raiz.current;
    const marco = capa?.querySelector("iframe") ?? capa?.firstElementChild;
    if (!capa || !caja || !marco) return;
    const m = (marco as HTMLElement).getBoundingClientRect();
    const w = (marco as HTMLElement).offsetWidth || m.width;
    const h = (marco as HTMLElement).offsetHeight || m.height;
    if (!w || !h) return;
    capa.style.transform = `scale(${caja.offsetWidth / w}, ${caja.offsetHeight / h})`;
  }
  useEffect(() => {
    if (!disponible || !raiz.current) return;
    const ro = new ResizeObserver(() => ajustarCapa());
    ro.observe(raiz.current);
    const marco = contenedor.current?.querySelector("iframe");
    if (marco) ro.observe(marco);
    // El iframe de Google toma su tamaño final un momento después de dibujarse.
    const t = window.setTimeout(ajustarCapa, 600);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [disponible]);

  useEffect(() => {
    let vivo = true;
    api
      .configuracionGoogle()
      .then(async ({ clientId }) => {
        if (!clientId || !vivo) return;
        await cargarGoogle();
        if (!vivo || !window.google || !contenedor.current) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => enviar(r.credential), context: texto === "signup_with" ? "signup" : "signin" });
        // El botón oficial de Google es un iframe que no se puede estilizar. Se
        // dibuja invisible encima del botón propio de Parkway y se escala a su
        // tamaño: el clic llega a Google y el usuario ve el diseño de la plataforma.
        window.google.accounts.id.renderButton(contenedor.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: texto,
          shape: "rectangular",
          width: 400,
          locale: "es",
        });
        ajustarCapa();
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
      <div ref={raiz} className={`google-boton${enviando ? " enviando" : ""}`} aria-busy={enviando}>
        <span className="boton boton-secundario boton-ancho google-visual" aria-hidden="true">
          <LogoGoogle />
          {enviando ? "Conectando con Google..." : texto === "signup_with" ? "Crear cuenta con Google" : "Continuar con Google"}
        </span>
        <div ref={contenedor} className="google-capa" />
      </div>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
    </div>
  );
}

/** Logo "G" de Google, con sus colores oficiales (requisito de la marca). */
function LogoGoogle() {
  return (
    <svg className="google-logo" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
