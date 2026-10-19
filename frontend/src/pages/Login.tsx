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
  const [modo, setModo] = useState<"ingresar" | "crear">("ingresar");
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
        {modo === "crear" ? (
          <CrearCuenta onCreada={onIngresar} onIngresar={() => setModo("ingresar")} />
        ) : (
        <form className="login-form" onSubmit={enviar} noValidate>
          <span className="senal-p" aria-hidden="true">P</span>
          <h1 className="display-2">Ingresar a Parkway</h1>
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

          <p className="login-alterno">
            ¿No tienes cuenta?{" "}
            <button type="button" className="enlace" onClick={() => setModo("crear")}>Crea una para reservar</button>
          </p>

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
        )}
      </main>
    </div>
  );
}

/** Creación de cuenta de cliente (RF01). Al terminar inicia la sesión. */
function CrearCuenta({ onCreada, onIngresar }: { onCreada: (u: Usuario) => void; onIngresar: () => void }) {
  const [f, setF] = useState({ nombre: "", documento: "", correo: "", telefono: "", contrasena: "", confirmar: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  function validar() {
    const err: Record<string, string> = {};
    if (f.nombre.trim().length < 3) err.nombre = "Escriba su nombre completo";
    if (!/^\d{5,12}$/.test(f.documento.replace(/[.\s]/g, ""))) err.documento = "Solo números, entre 5 y 12 dígitos";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim())) err.correo = "Correo inválido";
    if (f.telefono && !/^\+?\d{7,15}$/.test(f.telefono.replace(/[\s-]/g, ""))) err.telefono = "Teléfono inválido";
    if (f.contrasena.length < 8) err.contrasena = "Mínimo 8 caracteres";
    else if (!/\d/.test(f.contrasena) || !/[A-Za-z]/.test(f.contrasena)) err.contrasena = "Debe tener letras y números";
    if (f.confirmar !== f.contrasena) err.confirmar = "Las contraseñas no coinciden";
    return err;
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const err = validar();
    setErrores(err);
    setMensaje(null);
    if (Object.keys(err).length) return;
    setEnviando(true);
    try {
      const r = await api.registro({
        nombre: f.nombre,
        documento: f.documento,
        correo: f.correo,
        telefono: f.telefono || undefined,
        contrasena: f.contrasena,
      });
      sesion.guardar(r.token);
      onCreada(r.usuario);
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrores(ex.campos);
        setMensaje(ex.message);
      } else setMensaje("No se pudo crear la cuenta");
    } finally {
      setEnviando(false);
    }
  }

  const campo = (k: keyof typeof f, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      <input value={f[k]} onChange={cambiar(k)} aria-invalid={!!errores[k]} {...props} />
      {errores[k] && <span className="campo-error">{errores[k]}</span>}
    </label>
  );

  return (
    <form className="login-form" onSubmit={enviar} noValidate>
      <h1 className="display-2">Crear cuenta</h1>
      <p className="login-sub">Registra tus vehículos, reserva un espacio antes de llegar y consulta lo que has pagado.</p>
      {mensaje && <p className="alerta alerta-error" role="alert">{mensaje}</p>}
      {campo("nombre", "Nombre completo", { autoComplete: "name" })}
      <div className="fila-campos">
        {campo("documento", "Documento", { inputMode: "numeric" })}
        {campo("telefono", "Teléfono (opcional)", { inputMode: "tel", autoComplete: "tel" })}
      </div>
      {campo("correo", "Correo", { type: "email", autoComplete: "email" })}
      <div className="fila-campos">
        {campo("contrasena", "Contraseña", { type: "password", autoComplete: "new-password" })}
        {campo("confirmar", "Repetir contraseña", { type: "password", autoComplete: "new-password" })}
      </div>
      <button className="boton boton-primario boton-ancho" disabled={enviando}>
        {enviando ? "Creando cuenta..." : "Crear cuenta"}
      </button>
      <p className="login-alterno">
        ¿Ya tienes cuenta?{" "}
        <button type="button" className="enlace" onClick={onIngresar}>Ingresa</button>
      </p>
    </form>
  );
}
