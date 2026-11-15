import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, DatosUsuario, EstadoUsuario, Rol, SedeAdmin, UsuarioAdmin } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { fechaCorta } from "../../lib/formato";
import { Selector } from "../../components/Selector";
import { Dialogo } from "../../components/Dialogo";

const NOMBRE_ROL: Record<Rol, string> = { ADMINISTRADOR: "Administrador", OPERADOR: "Operador", CLIENTE: "Cliente" };
const NOMBRE_ESTADO: Record<EstadoUsuario, string> = { ACTIVO: "Activo", INACTIVO: "Inactivo", BLOQUEADO: "Bloqueado" };
const CHIP_ESTADO: Record<EstadoUsuario, string> = { ACTIVO: "chip-cumplida", INACTIVO: "chip-cancelada", BLOQUEADO: "chip-revertida" };
const NOMBRE_TURNO: Record<string, string> = { DIA: "Día", NOCHE: "Noche" };

const OPCIONES_ROL = (["ADMINISTRADOR", "OPERADOR", "CLIENTE"] as Rol[]).map((r) => ({ valor: r, texto: NOMBRE_ROL[r] }));
const OPCIONES_ESTADO = (["ACTIVO", "INACTIVO", "BLOQUEADO"] as EstadoUsuario[]).map((e) => ({ valor: e, texto: NOMBRE_ESTADO[e] }));
const OPCIONES_TURNO = [
  { valor: "", texto: "Elija el turno" },
  { valor: "DIA", texto: "Día" },
  { valor: "NOCHE", texto: "Noche" },
];

/**
 * Gestión de usuarios (RF02, solo administrador).
 * Crear, consultar, editar e inactivar clientes, operadores y
 * administradores. Los usuarios no se borran: inactivarlos les quita el
 * acceso y conserva su historial. A un operador se le asignan aquí las
 * sedes en las que trabaja.
 */
export function Usuarios({ idActual, onCambio }: { idActual: number; onCambio: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState({ q: "", rol: "", estado: "" });
  const usuarios = useConsulta(() => api.admin.usuarios(filtros), [filtros]);
  const sedes = useConsulta(() => api.admin.sedes(), []);
  const [editando, setEditando] = useState<UsuarioAdmin | "nuevo" | null>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState<UsuarioAdmin | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // La búsqueda se aplica un momento después de dejar de escribir.
  useEffect(() => {
    const t = window.setTimeout(() => setFiltros((f) => (f.q === busqueda.trim() ? f : { ...f, q: busqueda.trim() })), 300);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  const lista = usuarios.datos ?? [];
  const nombreSede = (id: number) => sedes.datos?.find((s) => s.id_parqueadero === id)?.nombre ?? `Sede ${id}`;
  const conteo = (rol: Rol) => lista.filter((u) => u.rol === rol).length;
  const sinAcceso = lista.filter((u) => u.estado !== "ACTIVO").length;
  const hayFiltros = !!(filtros.q || filtros.rol || filtros.estado);

  function terminar(texto: string) {
    setAviso(texto);
    usuarios.recargar();
    onCambio();
  }

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Usuarios</h1>
          <p className="pagina-sub">Crea cuentas para clientes, operadores y administradores, asigna turnos y sedes, e inactiva a quien ya no deba entrar.</p>
        </div>
        <button className="boton boton-primario" onClick={() => { setAviso(null); setEditando("nuevo"); }}>Nuevo usuario</button>
      </header>

      <div className="filtros" role="search">
        <label className="campo campo-buscar-usuario">
          <span className="campo-rotulo">Buscar</span>
          <input type="search" placeholder="Nombre, correo o documento" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </label>
        <div className="campo">
          <span className="campo-rotulo">Rol</span>
          <Selector etiqueta="Rol" valor={filtros.rol} opciones={[{ valor: "", texto: "Todos" }, ...OPCIONES_ROL]} onChange={(v) => setFiltros({ ...filtros, rol: v })} />
        </div>
        <div className="campo">
          <span className="campo-rotulo">Estado</span>
          <Selector etiqueta="Estado" valor={filtros.estado} opciones={[{ valor: "", texto: "Todos" }, ...OPCIONES_ESTADO]} onChange={(v) => setFiltros({ ...filtros, estado: v })} />
        </div>
        {hayFiltros && (
          <button className="boton boton-texto" onClick={() => { setBusqueda(""); setFiltros({ q: "", rol: "", estado: "" }); }}>Quitar filtros</button>
        )}
      </div>

      {aviso && <p className="alerta alerta-ok" role="status">{aviso}</p>}
      {usuarios.error && <p className="alerta alerta-error" role="alert">{usuarios.error}</p>}
      {usuarios.datos && (
        <p className="tenue resumen-bitacora">
          {lista.length} {lista.length === 1 ? "usuario" : "usuarios"}: {conteo("ADMINISTRADOR")} {conteo("ADMINISTRADOR") === 1 ? "administrador" : "administradores"},{" "}
          {conteo("OPERADOR")} {conteo("OPERADOR") === 1 ? "operador" : "operadores"} y {conteo("CLIENTE")} {conteo("CLIENTE") === 1 ? "cliente" : "clientes"}.
          {sinAcceso > 0 && ` ${sinAcceso} sin acceso.`}
        </p>
      )}

      {usuarios.datos && lista.length === 0 ? (
        <div className="vacio"><p>No hay usuarios con estos filtros.</p></div>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla tabla-usuarios">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Documento</th>
                <th scope="col">Rol</th>
                <th scope="col">Turno</th>
                <th scope="col">Sedes</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => {
                const yo = u.id_usuario === idActual;
                return (
                  <tr key={u.id_usuario}>
                    <td>
                      <strong>{u.nombre}</strong>{yo && <span className="chip chip-sm chip-activa">Tú</span>}
                      <span className="celda-secundaria tenue">{u.correo}</span>
                    </td>
                    <td>{u.documento ?? <span className="tenue">Sin documento</span>}</td>
                    <td>{NOMBRE_ROL[u.rol]}</td>
                    <td>{u.turno ? NOMBRE_TURNO[u.turno] ?? u.turno : <span className="tenue">No aplica</span>}</td>
                    <td className="celda-detalle">
                      {u.rol === "ADMINISTRADOR" ? <span className="tenue">Todas</span>
                        : u.rol === "CLIENTE" ? <span className="tenue">No aplica</span>
                        : u.sedes.length ? u.sedes.map(nombreSede).join(", ")
                        : <span className="campo-error">Sin sedes</span>}
                    </td>
                    <td><span className={`chip ${CHIP_ESTADO[u.estado]}`}>{NOMBRE_ESTADO[u.estado]}</span></td>
                    <td className="celda-acciones">
                      <button className="boton boton-secundario boton-sm" onClick={() => { setAviso(null); setEditando(u); }}>Editar</button>
                      {!yo && (
                        <button className="boton boton-texto boton-sm" onClick={() => { setAviso(null); setCambiandoEstado(u); }}>
                          {u.estado === "ACTIVO" ? "Inactivar" : "Activar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EditorUsuario
        usuario={editando}
        esUnoMismo={editando !== null && editando !== "nuevo" && editando.id_usuario === idActual}
        sedes={sedes.datos ?? []}
        onCerrar={() => setEditando(null)}
        onGuardado={(u, nuevo) => {
          setEditando(null);
          terminar(nuevo ? `Creamos la cuenta de ${u.nombre}.` : `Guardamos los cambios de ${u.nombre}.`);
        }}
      />
      <ConfirmarEstado
        usuario={cambiandoEstado}
        onCerrar={() => setCambiandoEstado(null)}
        onHecho={(u) => {
          setCambiandoEstado(null);
          terminar(u.estado === "ACTIVO" ? `${u.nombre} puede volver a iniciar sesión.` : `${u.nombre} ya no puede iniciar sesión.`);
        }}
      />
    </div>
  );
}

interface Form {
  nombre: string;
  documento: string;
  correo: string;
  telefono: string;
  rol: Rol;
  turno: string;
  estado: EstadoUsuario;
  contrasena: string;
  confirmar: string;
  sedes: number[];
}

const formVacio = (): Form => ({
  nombre: "", documento: "", correo: "", telefono: "", rol: "OPERADOR", turno: "", estado: "ACTIVO", contrasena: "", confirmar: "", sedes: [],
});

const formDe = (u: UsuarioAdmin): Form => ({
  nombre: u.nombre,
  documento: u.documento ?? "",
  correo: u.correo,
  telefono: u.telefono ?? "",
  rol: u.rol,
  turno: u.turno ?? "",
  estado: u.estado,
  contrasena: "",
  confirmar: "",
  sedes: u.sedes,
});

function EditorUsuario({ usuario, esUnoMismo, sedes, onCerrar, onGuardado }: {
  usuario: UsuarioAdmin | "nuevo" | null;
  esUnoMismo: boolean;
  sedes: SedeAdmin[];
  onCerrar: () => void;
  onGuardado: (u: UsuarioAdmin, nuevo: boolean) => void;
}) {
  const nuevo = usuario === "nuevo";
  const [f, setF] = useState<Form>(formVacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    setF(usuario === "nuevo" ? formVacio() : formDe(usuario));
    setErrores({});
    setError(null);
  }, [usuario]);

  const set = (c: Partial<Form>) => setF({ ...f, ...c });
  const err = (k: keyof Form) => errores[k];
  const campo = (k: "nombre" | "documento" | "correo" | "telefono", rotulo: string, props: Record<string, unknown> = {}) => (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}{k === "telefono" && <span className="opcional"> (opcional)</span>}</span>
      <input value={f[k]} onChange={(e) => set({ [k]: e.target.value })} aria-invalid={!!err(k)} {...props} />
      {err(k) && <span className="campo-error">{err(k)}</span>}
    </label>
  );

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    const locales: Record<string, string> = {};
    if ((nuevo || f.contrasena) && f.contrasena !== f.confirmar) locales.confirmar = "Las contraseñas no coinciden";
    if (Object.keys(locales).length) {
      setErrores(locales);
      return;
    }
    const datos: DatosUsuario = {
      nombre: f.nombre,
      documento: f.documento,
      correo: f.correo,
      telefono: f.telefono || undefined,
      rol: f.rol,
      turno: f.rol === "CLIENTE" ? undefined : f.turno,
      estado: f.estado,
      contrasena: f.contrasena || undefined,
      sedes: f.rol === "OPERADOR" ? f.sedes : undefined,
    };
    setGuardando(true);
    setErrores({});
    setError(null);
    try {
      const u = usuario === "nuevo" ? await api.admin.crearUsuario(datos) : await api.admin.editarUsuario(usuario.id_usuario, datos);
      onGuardado(u, usuario === "nuevo");
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrores(ex.campos);
        setError(ex.message);
      } else setError("No se pudo guardar el usuario");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo abierto={!!usuario} titulo={nuevo ? "Nuevo usuario" : "Editar usuario"} onCerrar={onCerrar}>
      <form className="form-usuario" onSubmit={guardar} noValidate>
        {campo("nombre", "Nombre completo", { autoComplete: "off" })}
        <div className="fila-campos">
          {campo("documento", "Documento", { inputMode: "numeric" })}
          {campo("telefono", "Teléfono", { inputMode: "tel" })}
        </div>
        {campo("correo", "Correo", { type: "email", autoComplete: "off" })}

        <div className="fila-campos">
          <div className="campo">
            <span className="campo-rotulo">Rol</span>
            <Selector etiqueta="Rol" valor={f.rol} opciones={OPCIONES_ROL} disabled={esUnoMismo} invalido={!!err("rol")}
              onChange={(v) => set({ rol: v as Rol, turno: v === "CLIENTE" ? "" : f.turno })} />
            {err("rol") && <span className="campo-error">{err("rol")}</span>}
          </div>
          {f.rol !== "CLIENTE" ? (
            <div className="campo">
              <span className="campo-rotulo">Turno</span>
              <Selector etiqueta="Turno" valor={f.turno} opciones={OPCIONES_TURNO} invalido={!!err("turno")} onChange={(v) => set({ turno: v })} />
              {err("turno") && <span className="campo-error">{err("turno")}</span>}
            </div>
          ) : <div />}
        </div>
        {esUnoMismo && <p className="campo-ayuda aviso-propio">Es tu cuenta: no puedes cambiar tu rol ni desactivarte.</p>}

        {!nuevo && !esUnoMismo && (
          <div className="campo">
            <span className="campo-rotulo">Estado</span>
            <Selector etiqueta="Estado" valor={f.estado} opciones={OPCIONES_ESTADO} invalido={!!err("estado")} onChange={(v) => set({ estado: v as EstadoUsuario })} />
            {f.estado !== "ACTIVO" && <span className="campo-ayuda">No podrá iniciar sesión. Si es cliente y tiene una reserva activa, se cancela.</span>}
          </div>
        )}

        {f.rol === "OPERADOR" && (
          <fieldset className="campo">
            <legend className="campo-rotulo">Sedes donde trabaja</legend>
            {err("sedes") && <span className="campo-error">{err("sedes")}</span>}
            {sedes.length === 0 ? <p className="tenue">Aún no hay sedes creadas.</p> : (
              <ul className="lista-operadores">
                {sedes.map((s) => (
                  <li key={s.id_parqueadero}>
                    <label>
                      <input
                        type="checkbox"
                        checked={f.sedes.includes(s.id_parqueadero)}
                        onChange={(e) => set({ sedes: e.target.checked ? [...f.sedes, s.id_parqueadero] : f.sedes.filter((x) => x !== s.id_parqueadero) })}
                      />
                      <span><strong>{s.nombre}</strong><span className="tenue">{s.direccion}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {f.sedes.length === 0 && sedes.length > 0 && <span className="campo-ayuda">Sin sedes, el operador podrá entrar pero no registrar ingresos.</span>}
          </fieldset>
        )}

        <div className="fila-campos">
          <label className="campo">
            <span className="campo-rotulo">{nuevo ? "Contraseña" : "Nueva contraseña"}{!nuevo && <span className="opcional"> (opcional)</span>}</span>
            <input type="password" autoComplete="new-password" value={f.contrasena} onChange={(e) => set({ contrasena: e.target.value })} aria-invalid={!!err("contrasena")} />
            {err("contrasena") ? <span className="campo-error">{err("contrasena")}</span> : <span className="campo-ayuda">Mínimo 8, con letras y números.</span>}
          </label>
          <label className="campo">
            <span className="campo-rotulo">Confirmar</span>
            <input type="password" autoComplete="new-password" value={f.confirmar} onChange={(e) => set({ confirmar: e.target.value })} aria-invalid={!!err("confirmar")} />
            {err("confirmar") && <span className="campo-error">{err("confirmar")}</span>}
          </label>
        </div>
        {!nuevo && usuario && <p className="campo-ayuda">Cuenta creada el {fechaCorta(usuario.fecha_creacion)}.</p>}

        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
          <button className="boton boton-primario" disabled={guardando}>{guardando ? "Guardando..." : nuevo ? "Crear usuario" : "Guardar cambios"}</button>
        </div>
      </form>
    </Dialogo>
  );
}

function ConfirmarEstado({ usuario, onCerrar, onHecho }: { usuario: UsuarioAdmin | null; onCerrar: () => void; onHecho: (u: UsuarioAdmin) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [usuario]);
  const activar = usuario?.estado !== "ACTIVO";

  async function confirmar() {
    if (!usuario) return;
    setEnviando(true);
    setError(null);
    try {
      onHecho(await api.admin.estadoUsuario(usuario.id_usuario, activar ? "ACTIVO" : "INACTIVO"));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "No se pudo cambiar el estado");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={!!usuario} titulo={activar ? "Activar usuario" : "Inactivar usuario"} onCerrar={onCerrar}>
      {usuario && (
        <>
          <p>
            {activar
              ? <><strong>{usuario.nombre}</strong> podrá volver a iniciar sesión con su correo y contraseña.</>
              : <><strong>{usuario.nombre}</strong> no podrá iniciar sesión y su sesión abierta se cierra. Su historial se conserva.{usuario.rol === "CLIENTE" && " Si tiene una reserva activa, se cancela y el espacio queda libre."}</>}
          </p>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
            <button className={`boton ${activar ? "boton-primario" : "boton-peligro"}`} onClick={confirmar} disabled={enviando} autoFocus>
              {enviando ? "Guardando..." : activar ? "Activar" : "Inactivar"}
            </button>
          </div>
        </>
      )}
    </Dialogo>
  );
}
