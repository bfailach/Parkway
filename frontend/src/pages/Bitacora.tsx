import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { fechaCorta } from "../lib/formato";
import { Selector } from "../components/Selector";

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const OPERACION: Record<string, string> = {
  INGRESO: "Ingreso",
  SALIDA: "Salida",
  RESERVA: "Reserva",
  CANCELAR_RESERVA: "Cancelación de reserva",
  EXPIRACION: "Reserva expirada",
  REGISTRO_VEHICULO: "Registro de vehículo",
  QUITAR_VEHICULO: "Vehículo retirado",
  CREAR_PARQUEADERO: "Sede creada",
  EDITAR_PARQUEADERO: "Sede editada",
  ESTADO_ESPACIO: "Estado de espacio",
  CREAR_USUARIO: "Usuario creado",
  EDITAR_USUARIO: "Usuario editado",
  ESTADO_USUARIO: "Estado de usuario",
  PAGO: "Pago",
  ANULAR_PAGO: "Pago anulado",
  COBRO_NUEVO: "Nuevo cobro",
};
const nombreOperacion = (t: string) => OPERACION[t] ?? t;

const ENTIDAD: Record<string, string> = {
  registro_estacionamiento: "Registro",
  reserva: "Reserva",
  vehiculo: "Vehículo",
  parqueadero: "Sede",
  espacio: "Espacio",
  usuario: "Usuario",
  pago: "Pago",
};
const nombreEntidad = (e: string) => ENTIDAD[e] ?? e;
const NOMBRE_ROL: Record<string, string> = { ADMINISTRADOR: "administrador", OPERADOR: "operador", CLIENTE: "cliente" };

interface Filtros {
  idUsuario: string;
  tipo: string;
  entidad: string;
  idEntidad: string;
  estado: string;
  desde: string;
  hasta: string;
}

/** Detalle legible de una operación a partir del JSON de la bitácora. */
function detalle(d: Record<string, unknown> | null) {
  if (!d) return "";
  if (typeof d.error === "string") return d.error;
  const partes: string[] = [];
  if (d.placa) partes.push(String(d.placa));
  if (d.espacio) partes.push(`espacio ${d.espacio}`);
  if (d.minutos != null) partes.push(`${d.minutos} min`);
  if (d.valor != null) partes.push(`$ ${Number(d.valor).toLocaleString("es-CO")}`);
  if (d.reserva) partes.push("con reserva");
  if (typeof d.nombre === "string") partes.push(d.nombre);
  if (d.estado === "FUERA_DE_SERVICIO") partes.push("fuera de servicio");
  if (d.estado === "LIBRE") partes.push("habilitado");
  const ROL: Record<string, string> = { CLIENTE: "cliente", OPERADOR: "operador", ADMINISTRADOR: "administrador" };
  if (typeof d.rol === "string") partes.push(d.rolAnterior ? `de ${ROL[String(d.rolAnterior)]} a ${ROL[d.rol]}` : ROL[d.rol] ?? d.rol);
  if (d.estado === "ACTIVO" && d.rol === undefined) partes.push("activado");
  if (d.estado === "INACTIVO") partes.push("inactivado");
  if (d.estado === "BLOQUEADO") partes.push("bloqueado");
  if (d.contrasena) partes.push("contraseña cambiada");
  const METODO: Record<string, string> = { EFECTIVO: "efectivo", TARJETA: "tarjeta", TRANSFERENCIA: "transferencia" };
  if (typeof d.metodo === "string") partes.push(METODO[d.metodo] ?? d.metodo);
  if (typeof d.comprobante === "string") partes.push(d.comprobante);
  if (typeof d.motivo === "string") partes.push(`motivo: ${d.motivo}`);
  if (d.reservasCanceladas) partes.push(Number(d.reservasCanceladas) === 1 ? "reserva cancelada" : `${d.reservasCanceladas} reservas canceladas`);
  return partes.join(", ");
}

/**
 * Bitácora de transacciones (RF14, RNF08). Solo para el administrador.
 * Cada operación queda con el usuario, el resultado y el detalle; las
 * revertidas incluyen el motivo del error. Se filtra por usuario, tipo de
 * operación, entidad, resultado y fechas. Un clic en el usuario o en la
 * entidad de una fila filtra por ese valor, para seguir la historia de una
 * persona o de un registro.
 */
export function Bitacora() {
  const inicial: Filtros = { idUsuario: "", tipo: "", entidad: "", idEntidad: "", estado: "", desde: hoy(), hasta: hoy() };
  const [form, setForm] = useState<Filtros>(inicial);
  const [filtros, setFiltros] = useState<Filtros>(inicial);
  const bitacora = useConsulta(() => api.bitacora(filtros), [filtros], 15000);
  const filas = bitacora.datos?.filas ?? [];
  const revertidas = filas.filter((f) => f.estado === "REVERTIDA").length;
  const usuarios = bitacora.datos?.usuarios ?? [];
  const nombreUsuario = (id: string) => usuarios.find((u) => String(u.id_usuario) === id)?.nombre ?? `Usuario ${id}`;
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(inicial);

  function aplicar(e: FormEvent) {
    e.preventDefault();
    setFiltros(form);
  }

  /** Filtra al instante sin pasar por el botón (clic en una fila). */
  function filtrar(cambio: Partial<Filtros>) {
    const nuevo = { ...form, ...cambio };
    setForm(nuevo);
    setFiltros(nuevo);
  }

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Bitácora</h1>
          <p className="pagina-sub">Todas las operaciones del sistema, confirmadas y revertidas, con su responsable.</p>
        </div>
      </header>

      <form className="filtros filtros-bitacora" onSubmit={aplicar}>
        <div className="campo">
          <span className="campo-rotulo">Usuario</span>
          <Selector
            etiqueta="Usuario"
            valor={form.idUsuario}
            opciones={[
              { valor: "", texto: "Todos" },
              ...usuarios.map((u) => ({ valor: String(u.id_usuario), texto: `${u.nombre} (${NOMBRE_ROL[u.rol] ?? u.rol})` })),
            ]}
            onChange={(v) => setForm({ ...form, idUsuario: v })}
          />
        </div>
        <div className="campo">
          <span className="campo-rotulo">Operación</span>
          <Selector
            etiqueta="Operación"
            valor={form.tipo}
            opciones={[
              { valor: "", texto: "Todas" },
              ...(bitacora.datos?.tipos ?? []).map((t) => ({ valor: t, texto: nombreOperacion(t) })),
            ]}
            onChange={(v) => setForm({ ...form, tipo: v })}
          />
        </div>
        <div className="campo">
          <span className="campo-rotulo">Entidad</span>
          <Selector
            etiqueta="Entidad"
            valor={form.entidad}
            opciones={[
              { valor: "", texto: "Todas" },
              ...(bitacora.datos?.entidades ?? []).map((e) => ({ valor: e, texto: nombreEntidad(e) })),
            ]}
            onChange={(v) => setForm({ ...form, entidad: v, idEntidad: "" })}
          />
        </div>
        <div className="campo">
          <span className="campo-rotulo">Resultado</span>
          <Selector
            etiqueta="Resultado"
            valor={form.estado}
            opciones={[
              { valor: "", texto: "Todos" },
              { valor: "CONFIRMADA", texto: "Confirmadas" },
              { valor: "REVERTIDA", texto: "Revertidas" },
            ]}
            onChange={(v) => setForm({ ...form, estado: v })}
          />
        </div>
        <label className="campo">
          <span className="campo-rotulo">Desde</span>
          <input type="date" value={form.desde} max={form.hasta || undefined} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Hasta</span>
          <input type="date" value={form.hasta} min={form.desde || undefined} onChange={(e) => setForm({ ...form, hasta: e.target.value })} />
        </label>
        <button className="boton boton-secundario">Filtrar</button>
        {hayFiltros && (
          <button type="button" className="boton boton-texto" onClick={() => filtrar(inicial)}>Quitar filtros</button>
        )}
      </form>

      {(filtros.idEntidad || filtros.idUsuario) && (
        <p className="filtros-activos">
          {filtros.idUsuario && (
            <span className="chip chip-activa">
              Operaciones de {nombreUsuario(filtros.idUsuario)}
              <button type="button" className="chip-quitar" aria-label="Quitar el filtro de usuario" onClick={() => filtrar({ idUsuario: "" })}>×</button>
            </span>
          )}
          {filtros.idEntidad && (
            <span className="chip chip-activa">
              Historia de {nombreEntidad(filtros.entidad).toLowerCase()} {filtros.idEntidad}
              <button type="button" className="chip-quitar" aria-label="Quitar el filtro de entidad" onClick={() => filtrar({ idEntidad: "" })}>×</button>
            </span>
          )}
        </p>
      )}

      {bitacora.error && <p className="alerta alerta-error" role="alert">{bitacora.error}</p>}
      {bitacora.datos && (
        <p className="tenue resumen-bitacora">
          {filas.length} {filas.length === 1 ? "operación" : "operaciones"}, {revertidas} {revertidas === 1 ? "revertida" : "revertidas"}.
          {filas.length === 300 && " Se muestran las 300 más recientes; acote los filtros para ver más."}
        </p>
      )}

      {bitacora.datos && filas.length === 0 ? (
        <div className="vacio"><p>No hay operaciones con estos filtros.</p></div>
      ) : (
        <div className="tabla-contenedor" tabIndex={0}>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">N.º</th>
                <th scope="col">Fecha</th>
                <th scope="col">Operación</th>
                <th scope="col">Entidad</th>
                <th scope="col">Usuario</th>
                <th scope="col">Resultado</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id_transaccion}>
                  <td className="tenue">{f.id_transaccion}</td>
                  <td>{fechaCorta(f.fecha_inicio)}</td>
                  <td>{nombreOperacion(f.tipo_operacion)}</td>
                  <td>
                    {f.id_entidad ? (
                      <button
                        type="button"
                        className="enlace-celda"
                        title={`Ver todas las operaciones de ${nombreEntidad(f.entidad).toLowerCase()} ${f.id_entidad}`}
                        onClick={() => filtrar({ entidad: f.entidad, idEntidad: f.id_entidad!, desde: "", hasta: "" })}
                      >
                        {nombreEntidad(f.entidad)} {f.id_entidad}
                      </button>
                    ) : (
                      nombreEntidad(f.entidad)
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="enlace-celda"
                      title={`Ver solo las operaciones de ${f.usuario}`}
                      onClick={() => filtrar({ idUsuario: String(f.id_usuario) })}
                    >
                      {f.usuario}
                    </button>
                    <span className="tenue celda-rol"> {NOMBRE_ROL[f.rol] ?? f.rol}</span>
                  </td>
                  <td>
                    <span className={`chip ${f.estado === "CONFIRMADA" ? "chip-cumplida" : "chip-revertida"}`}>
                      {f.estado === "CONFIRMADA" ? "Confirmada" : "Revertida"}
                    </span>
                  </td>
                  <td className="celda-detalle">{detalle(f.detalle)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
