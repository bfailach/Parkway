import { api } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { duracion, fechaCorta, horaCorta, pesos } from "../../lib/formato";
import { Placa } from "../../components/Placa";

const ESTADO_RESERVA: Record<string, string> = {
  ACTIVA: "Activa",
  CUMPLIDA: "Cumplida",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
};

/** Historial del cliente (RF03): visitas con su valor y reservas anteriores. */
export function MiHistorial() {
  const visitas = useConsulta(() => api.cliente.historial(), []);
  const reservas = useConsulta(() => api.cliente.reservas(), []);
  const lista = visitas.datos ?? [];
  const total = lista.reduce((s, r) => s + (r.valor_calculado ?? 0), 0);

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Mi historial</h1>
          <p className="pagina-sub">Tus visitas a las sedes de Parkway y lo que pagaste en cada una.</p>
        </div>
      </header>

      {visitas.error && <p className="alerta alerta-error" role="alert">{visitas.error}</p>}

      <section aria-labelledby="titulo-visitas">
        <h2 id="titulo-visitas" className="bloque-titulo">Visitas</h2>
        {visitas.datos && lista.length === 0 ? (
          <div className="vacio"><p>Todavía no tienes visitas registradas.</p></div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Placa</th>
                  <th scope="col">Sede</th>
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
                    <td>{r.sede}{r.id_reserva ? <span className="chip chip-reserva chip-sm">Con reserva</span> : null}</td>
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
                    <th scope="row" colSpan={6}>{lista.length} {lista.length === 1 ? "visita" : "visitas"}</th>
                    <td className="num">{pesos(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <section className="bloque" aria-labelledby="titulo-reservas">
        <h2 id="titulo-reservas" className="bloque-titulo">Reservas</h2>
        {reservas.datos && reservas.datos.length === 0 ? (
          <div className="vacio"><p>No has hecho reservas.</p></div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Placa</th>
                  <th scope="col">Sede</th>
                  <th scope="col">Espacio</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(reservas.datos ?? []).map((r) => (
                  <tr key={r.id_reserva}>
                    <td>{fechaCorta(r.fecha_inicio)}</td>
                    <td><Placa placa={r.placa} /></td>
                    <td>{r.sede}</td>
                    <td className="codigo">{r.codigo_espacio}</td>
                    <td><span className={`chip chip-${r.estado.toLowerCase()}`}>{ESTADO_RESERVA[r.estado]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
