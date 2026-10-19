import { useState } from "react";
import { api, ApiError, Parqueadero, Registro } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { duracion, horaCorta, nombreTipo, pesos } from "../lib/formato";
import { Placa } from "../components/Placa";
import { Dialogo } from "../components/Dialogo";
import { Tiquete } from "../components/Tiquete";

/**
 * Vehículos dentro del parqueadero y registro de salida (RF07).
 * El valor mostrado se recalcula en cada consulta. El valor definitivo lo
 * calcula el backend con la hora de la base de datos al confirmar la salida.
 */
export function Activos({ sede }: { sede: Parqueadero }) {
  const [filtro, setFiltro] = useState("");
  const [seleccion, setSeleccion] = useState<Registro | null>(null);
  const [resultado, setResultado] = useState<Registro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const activos = useConsulta(() => api.activos(sede.id_parqueadero, filtro || undefined), [sede.id_parqueadero, filtro], 15000);

  async function confirmarSalida() {
    if (!seleccion) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await api.salida(seleccion.id_registro);
      setResultado(r);
      activos.recargar();
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : "No se pudo registrar la salida");
    } finally {
      setEnviando(false);
    }
  }

  function cerrar() {
    setSeleccion(null);
    setResultado(null);
    setError(null);
  }

  const lista = activos.datos ?? [];

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">En el parqueadero</h1>
          <p className="pagina-sub">
            {activos.datos ? `${lista.length} ${lista.length === 1 ? "vehículo" : "vehículos"}${filtro ? " con ese filtro" : ""}` : "Cargando..."}
          </p>
        </div>
        <label className="buscador">
          <span className="visualmente-oculto">Buscar por placa</span>
          <input
            type="search"
            placeholder="Buscar placa"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          />
        </label>
      </header>

      {activos.error && <p className="alerta alerta-error" role="alert">{activos.error}</p>}

      {activos.datos && lista.length === 0 ? (
        <div className="vacio">
          <p>{filtro ? `Ningún vehículo dentro coincide con ${filtro}.` : "No hay vehículos dentro. Los ingresos que registre aparecerán aquí."}</p>
        </div>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Placa</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Espacio</th>
                <th scope="col">Ingreso</th>
                <th scope="col">Tiempo</th>
                <th scope="col" className="num">Valor a la fecha</th>
                <th scope="col"><span className="visualmente-oculto">Acción</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id_registro}>
                  <td><Placa placa={r.placa} /></td>
                  <td>{nombreTipo(r.tipo)}{r.marca ? <span className="tenue"> {r.marca}</span> : null}</td>
                  <td className="codigo">{r.codigo_espacio}</td>
                  <td>{horaCorta(r.fecha_ingreso)}</td>
                  <td>{duracion(r.minutos_transcurridos)}</td>
                  <td className="num">{pesos(r.valor_estimado)}</td>
                  <td className="accion">
                    <button className="boton boton-secundario" onClick={() => setSeleccion(r)}>Registrar salida</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={!!seleccion} titulo={resultado ? "Salida registrada" : "Registrar salida"} onCerrar={cerrar}>
        {seleccion && !resultado && (
          <>
            <div className="confirmacion">
              <Placa placa={seleccion.placa} tamano="md" />
              <dl className="tiquete-datos">
                <div><dt>Espacio</dt><dd>{seleccion.codigo_espacio}</dd></div>
                <div><dt>Ingreso</dt><dd>{horaCorta(seleccion.fecha_ingreso)}</dd></div>
                <div><dt>Tiempo</dt><dd>{duracion(seleccion.minutos_transcurridos)}</dd></div>
                <div><dt>Valor estimado</dt><dd>{pesos(seleccion.valor_estimado)}</dd></div>
              </dl>
              <p className="tenue">El valor final se calcula con la hora exacta de salida.</p>
            </div>
            {error && <p className="alerta alerta-error" role="alert">{error}</p>}
            <div className="dialogo-acciones">
              <button className="boton boton-texto" onClick={cerrar}>Cancelar</button>
              <button className="boton boton-primario" onClick={confirmarSalida} disabled={enviando} autoFocus>
                {enviando ? "Registrando..." : "Confirmar salida"}
              </button>
            </div>
          </>
        )}
        {resultado && (
          <>
            <Tiquete registro={resultado} sede={sede.nombre} />
            <div className="dialogo-acciones">
              <button className="boton boton-primario" onClick={cerrar} autoFocus>Listo</button>
            </div>
          </>
        )}
      </Dialogo>
    </div>
  );
}
