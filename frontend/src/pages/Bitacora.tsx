import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { fechaCorta } from "../lib/formato";

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
};
const nombreOperacion = (t: string) => OPERACION[t] ?? t;

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
  return partes.join(", ");
}

/**
 * Bitácora de transacciones (RF14, RNF08). Solo para el administrador.
 * Cada operación queda con el usuario, el resultado y el detalle; las
 * revertidas incluyen el motivo del error.
 */
export function Bitacora() {
  const [form, setForm] = useState({ tipo: "", estado: "", desde: hoy(), hasta: hoy() });
  const [filtros, setFiltros] = useState(form);
  const bitacora = useConsulta(() => api.bitacora(filtros), [filtros], 15000);
  const filas = bitacora.datos?.filas ?? [];
  const revertidas = filas.filter((f) => f.estado === "REVERTIDA").length;

  function aplicar(e: FormEvent) {
    e.preventDefault();
    setFiltros(form);
  }

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Bitácora</h1>
          <p className="pagina-sub">Todas las operaciones del sistema, confirmadas y revertidas, con su responsable.</p>
        </div>
      </header>

      <form className="filtros" onSubmit={aplicar}>
        <label className="campo">
          <span className="campo-rotulo">Operación</span>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="">Todas</option>
            {(bitacora.datos?.tipos ?? []).map((t) => <option key={t} value={t}>{nombreOperacion(t)}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="campo-rotulo">Resultado</span>
          <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="CONFIRMADA">Confirmadas</option>
            <option value="REVERTIDA">Revertidas</option>
          </select>
        </label>
        <label className="campo">
          <span className="campo-rotulo">Desde</span>
          <input type="date" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Hasta</span>
          <input type="date" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} />
        </label>
        <button className="boton boton-secundario">Filtrar</button>
      </form>

      {bitacora.error && <p className="alerta alerta-error" role="alert">{bitacora.error}</p>}
      {bitacora.datos && (
        <p className="tenue resumen-bitacora">
          {filas.length} {filas.length === 1 ? "operación" : "operaciones"}, {revertidas} {revertidas === 1 ? "revertida" : "revertidas"}.
          {filas.length === 300 && " Se muestran las 300 más recientes; acote las fechas para ver más."}
        </p>
      )}

      {bitacora.datos && filas.length === 0 ? (
        <div className="vacio"><p>No hay operaciones con estos filtros.</p></div>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">N.º</th>
                <th scope="col">Fecha</th>
                <th scope="col">Operación</th>
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
                  <td>{f.usuario}</td>
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
