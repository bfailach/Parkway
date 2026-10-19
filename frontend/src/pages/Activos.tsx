import { useState } from "react";
import { api, Parqueadero, Registro } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { duracion, horaCorta, nombreTipo, pesos } from "../lib/formato";
import { Placa } from "../components/Placa";
import { SalidaDialogo } from "../components/SalidaDialogo";

/**
 * Vehículos dentro del parqueadero y registro de salida (RF07).
 * El valor mostrado se recalcula en cada consulta. El valor definitivo lo
 * calcula el backend con la hora de la base de datos al confirmar la salida.
 */
export function Activos({ sede }: { sede: Parqueadero }) {
  const [filtro, setFiltro] = useState("");
  const [seleccion, setSeleccion] = useState<Registro | null>(null);

  const activos = useConsulta(() => api.activos(sede.id_parqueadero, filtro || undefined), [sede.id_parqueadero, filtro], 15000);
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
                  <td>
                    {nombreTipo(r.tipo)}
                    {r.marca ? <span className="tenue"> {r.marca}</span> : null}
                    {r.id_reserva ? <span className="chip chip-reserva chip-sm">Con reserva</span> : null}
                  </td>
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

      <SalidaDialogo
        registro={seleccion}
        sede={sede.nombre}
        onCerrar={() => setSeleccion(null)}
        onRegistrada={() => activos.recargar()}
      />
    </div>
  );
}
