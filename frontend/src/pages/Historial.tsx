import { FormEvent, useState } from "react";
import { api, Parqueadero } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { duracion, fechaCorta, horaCorta, nombreTipo, pesos } from "../lib/formato";
import { Placa } from "../components/Placa";

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Historial de salidas registradas, con filtros por placa y fechas. */
export function Historial({ sede }: { sede: Parqueadero }) {
  const [form, setForm] = useState({ placa: "", desde: hoy(), hasta: hoy() });
  const [filtros, setFiltros] = useState(form);
  const [errorFechas, setErrorFechas] = useState<string | null>(null);

  const historial = useConsulta(
    () => api.historial({ idParqueadero: sede.id_parqueadero, ...filtros }),
    [sede.id_parqueadero, filtros]
  );

  function aplicar(e: FormEvent) {
    e.preventDefault();
    if (form.desde && form.hasta && form.desde > form.hasta) {
      setErrorFechas("La fecha inicial debe ser anterior a la final");
      return;
    }
    setErrorFechas(null);
    setFiltros(form);
  }

  const lista = historial.datos ?? [];
  const total = lista.reduce((s, r) => s + (r.valor_calculado ?? 0), 0);

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Historial de salidas</h1>
          <p className="pagina-sub">{sede.nombre}</p>
        </div>
      </header>

      <form className="filtros" onSubmit={aplicar}>
        <label className="campo">
          <span className="campo-rotulo">Placa</span>
          <input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="Todas" />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Desde</span>
          <input type="date" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Hasta</span>
          <input type="date" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} aria-invalid={!!errorFechas} />
        </label>
        <button className="boton boton-secundario">Filtrar</button>
      </form>
      {errorFechas && <p className="alerta alerta-error" role="alert">{errorFechas}</p>}
      {historial.error && <p className="alerta alerta-error" role="alert">{historial.error}</p>}

      {historial.datos && lista.length === 0 ? (
        <div className="vacio"><p>No hay salidas registradas con estos filtros. Amplíe el rango de fechas.</p></div>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Placa</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Espacio</th>
                <th scope="col">Ingreso</th>
                <th scope="col">Salida</th>
                <th scope="col">Permanencia</th>
                <th scope="col" className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id_registro}>
                  <td><Placa placa={r.placa} /></td>
                  <td>{nombreTipo(r.tipo)}</td>
                  <td className="codigo">{r.codigo_espacio}</td>
                  <td>{fechaCorta(r.fecha_ingreso)}</td>
                  <td>{horaCorta(r.fecha_salida)}</td>
                  <td>{duracion(r.minutos)}</td>
                  <td className="num">{pesos(r.valor_calculado)}</td>
                </tr>
              ))}
            </tbody>
            {lista.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row" colSpan={6}>{lista.length} {lista.length === 1 ? "salida" : "salidas"}</th>
                  <td className="num">{pesos(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
