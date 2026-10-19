import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, Usuario, sesion } from "../lib/api";
import { crearControl, soportaWebGL } from "../three/control";
import type { EspacioMapa } from "../lib/api";

const Escena = lazy(() => import("../three/Escena"));

const CUENTAS_PRUEBA = [
  { rol: "Operador", correo: "operador1@parkway.test", contrasena: "Operador123*" },
  { rol: "Administrador", correo: "admin@parkway.test", contrasena: "Admin123*" },
  { rol: "Cliente", correo: "cliente1@parkway.test", contrasena: "Cliente123*" },
];

export function Login({ onIngresar, onVolver }: { onIngresar: (u: Usuario) => void; onVolver: () => void }) {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [plano, setPlano] = useState<EspacioMapa[]>([]);
  const control = useRef(crearControl("portada"));
  const webgl = useMemo(soportaWebGL, []);

  useEffect(() => {
    api.plano(1).then(setPlano).catch(() => {});
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!correo.trim()) err.correo = "Escriba su correo";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) err.correo = "El correo no tiene un formato válido";
    if (!contrasena) err.contrasena = "Escriba su contraseña";
    setErrores(err);
    setMensaje(null);
    if (Object.keys(err).length) return;

    setEnviando(true);
    try {
      const r = await api.login(correo.trim(), contrasena);
      sesion.guardar(r.token);
      onIngresar(r.usuario);
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrores(ex.campos);
        setMensaje(ex.message);
      } else setMensaje("No se pudo iniciar sesión");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      {webgl && plano.length > 0 && (
        <Suspense fallback={null}>
          <Escena className="escena-fondo" espacios={plano} control={control} />
        </Suspense>
      )}
      <main className="login-panel">
        <button className="boton boton-texto login-volver" onClick={onVolver}>Volver a la portada</button>
        <form className="login-form" onSubmit={enviar} noValidate>
          <span className="senal-p" aria-hidden="true">P</span>
          <h1 className="display-2">Ingreso al panel</h1>
          <p className="login-sub">Para operadores, administradores y clientes registrados de Parkway.</p>

          {mensaje && <p className="alerta alerta-error" role="alert">{mensaje}</p>}

          <label className="campo">
            <span className="campo-rotulo">Correo</span>
            <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)}
              aria-invalid={!!errores.correo} aria-describedby="err-correo" />
            {errores.correo && <span className="campo-error" id="err-correo">{errores.correo}</span>}
          </label>

          <label className="campo">
            <span className="campo-rotulo">Contraseña</span>
            <input type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)}
              aria-invalid={!!errores.contrasena} aria-describedby="err-contrasena" />
            {errores.contrasena && <span className="campo-error" id="err-contrasena">{errores.contrasena}</span>}
          </label>

          <button className="boton boton-primario boton-ancho" disabled={enviando}>
            {enviando ? "Ingresando..." : "Ingresar"}
          </button>

          <details className="cuentas-prueba">
            <summary>Cuentas de prueba</summary>
            <ul>
              {CUENTAS_PRUEBA.map((c) => (
                <li key={c.correo}>
                  <button type="button" className="enlace" onClick={() => { setCorreo(c.correo); setContrasena(c.contrasena); }}>
                    {c.rol}
                  </button>
                  <span>{c.correo}</span>
                </li>
              ))}
            </ul>
          </details>
        </form>
      </main>
    </div>
  );
}
