import { useEffect, useState } from "react";
import { api, Parqueadero, ReservaSede } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { fechaCorta, horaCorta, nombreTipo } from "../lib/formato";
import { Placa } from "../components/Placa";

const ESTADO: Record<string, string> = {
  ACTIVA: "Activa",
  CUMPLIDA: "Llegó",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
};

function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return ahora;
}

const restante = (fin: string, ahora: number) => {
  const s = Math.max(0, Math.floor((new Date(fin).getTime() - ahora) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Reservas de la sede para el personal (RF10).
 * Las activas muestran cuánto le queda al cliente para llegar y permiten
 * registrar el ingreso con la placa ya escrita.
 */
export function Reservas({ sede, onRegistrarIngreso }: { sede: Parqueadero; onRegistrarIngreso: (r: ReservaSede) => void }) {
  const reservas = useConsulta(() => api.reservasSede(sede.id_parqueadero), [sede.id_parqueadero], 10000);
  const ahora = useAhora();
  const lista = reservas.datos ?? [];
  const activas = lista.filter((r) => r.estado === "ACTIVA");
  const hoy = lista.filter((r) => r.estado !== "ACTIVA");
  const cuenta = (e: string) => hoy.filter((r) => r.estado === e).length;

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Reservas</h1>
          <p className="pagina-sub">{sede.nombre}. Los clientes tienen 30 minutos para llegar; después el espacio se libera solo.</p>
        </div>
      </header>

      {reservas.error && <p className="alerta alerta-error" role="alert">{reservas.error}</p>}

      <dl className="hoy hoy-reservas">
        <div><dt>Esperando llegada</dt><dd>{activas.length}</dd></div>
        <div><dt>Llegaron hoy</dt><dd>{cuenta("CUMPLIDA")}</dd></div>
        <div><dt>Canceladas</dt><dd>{cuenta("CANCELADA")}</dd></div>
        <div><dt>Expiradas</dt><dd>{cuenta("EXPIRADA")}</dd></div>
      </dl>

      <section className="bloque" aria-labelledby="titulo-activas">
        <h2 id="titulo-activas" className="bloque-titulo">Esperando llegada</h2>
        {reservas.datos && activas.length === 0 ? (
          <div className="vacio"><p>No hay reservas activas en esta sede.</p></div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Placa</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Vehículo</th>
                  <th scope="col">Espacio</th>
                  <th scope="col">Vence</th>
                  <th scope="col" className="num">Tiempo para llegar</th>
                  <th scope="col"><span className="visualmente-oculto">Acción</span></th>
                </tr>
              </thead>
              <tbody>
                {activas.map((r) => {
                  const ms = new Date(r.fecha_fin).getTime() - ahora;
                  return (
                    <tr key={r.id_reserva}>
                      <td><Placa placa={r.placa} /></td>
                      <td>
                        {r.cliente}
                        {r.telefono && <span className="tenue celda-sub">{r.telefono}</span>}
                      </td>
                      <td>{nombreTipo(r.tipo)}{r.marca ? <span className="tenue"> {r.marca}</span> : null}</td>
                      <td className="codigo">{r.codigo_espacio}</td>
                      <td>{horaCorta(r.fecha_fin)}</td>
                      <td className={`num ${ms < 5 * 60000 ? "texto-alerta" : ""}`}>{restante(r.fecha_fin, ahora)}</td>
                      <td className="accion">
                        <button className="boton boton-secundario" onClick={() => onRegistrarIngreso(r)}>Registrar ingreso</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bloque" aria-labelledby="titulo-hoy">
        <h2 id="titulo-hoy" className="bloque-titulo">Reservas de hoy</h2>
        {reservas.datos && hoy.length === 0 ? (
          <div className="vacio"><p>Aún no hay reservas terminadas hoy.</p></div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Placa</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Espacio</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {hoy.map((r) => (
                  <tr key={r.id_reserva}>
                    <td>{fechaCorta(r.fecha_inicio)}</td>
                    <td><Placa placa={r.placa} /></td>
                    <td>{r.cliente}</td>
                    <td className="codigo">{r.codigo_espacio}</td>
                    <td><span className={`chip chip-${r.estado.toLowerCase()}`}>{ESTADO[r.estado]}</span></td>
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
