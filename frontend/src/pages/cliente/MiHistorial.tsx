import { useState } from "react";
import { api, ApiError, Reclamo } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { duracion, fechaCorta, horaCorta, pesos } from "../../lib/formato";
import { Placa } from "../../components/Placa";
import { CeldaPago } from "../../components/CeldaPago";
import { Dialogo } from "../../components/Dialogo";

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
  const reclamos = useConsulta(() => api.cliente.reclamos(), []);
  // Reclamo sobre una visita del historial o, si no aparece (otra placa), con el número del comprobante.
  const [reportando, setReportando] = useState<{ idRegistro?: number; descripcion?: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const pendiente = new Set((reclamos.datos ?? []).filter((c) => c.estado === "PENDIENTE").map((c) => c.id_registro));

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Mi historial</h1>
          <p className="pagina-sub">Tus visitas a las sedes de Parkway y lo que pagaste en cada una.</p>
        </div>
      </header>

      {visitas.error && <p className="alerta alerta-error" role="alert">{visitas.error}</p>}
      {aviso && <p className="alerta alerta-ok" role="status">{aviso}</p>}

      <section aria-labelledby="titulo-visitas">
        <h2 id="titulo-visitas" className="bloque-titulo">Visitas</h2>
        {visitas.datos && lista.length === 0 ? (
          <div className="vacio"><p>Todavía no tienes visitas registradas.</p></div>
        ) : (
          <div className="tabla-contenedor" tabIndex={0}>
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Placa</th>
                  <th scope="col">Sede</th>
                  <th scope="col">Espacio</th>
                  <th scope="col">Ingreso</th>
                  <th scope="col">Salida</th>
                  <th scope="col">Permanencia</th>
                  <th scope="col">Pago</th>
                  <th scope="col" className="num">Valor</th>
                  <th scope="col"><span className="visualmente-oculto">Reportar</span></th>
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
                    <td><CeldaPago r={r} /></td>
                    <td className="num">{pesos(r.valor_calculado)}</td>
                    <td className="accion">
                      {pendiente.has(r.id_registro) ? (
                        <span className="chip chip-pendiente chip-sm">Reclamo en revisión</span>
                      ) : (
                        <button
                          className="boton boton-texto boton-sm"
                          onClick={() => { setAviso(null); setReportando({ idRegistro: r.id_registro, descripcion: `${r.placa} en ${r.sede}, ${pesos(r.valor_calculado)}` }); }}
                        >
                          Reportar un problema
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {lista.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={7}>{lista.length} {lista.length === 1 ? "visita" : "visitas"}</th>
                    <td className="num">{pesos(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <section className="bloque" aria-labelledby="titulo-reclamos">
        <h2 id="titulo-reclamos" className="bloque-titulo">Reclamos sobre cobros</h2>
        <p className="tenue">
          ¿Te cobraron como otro tipo de vehículo o la visita no aparece arriba porque se registró con otra placa?{" "}
          <button className="boton boton-texto boton-sm" onClick={() => { setAviso(null); setReportando({}); }}>Reportar con el número del comprobante</button>
        </p>
        {(reclamos.datos ?? []).length > 0 && (
          <ul className="reclamos-lista">
            {(reclamos.datos ?? []).map((c: Reclamo) => (
              <li key={c.id_reclamo} className="tarjeta reclamo">
                <div>
                  <strong>{c.placa}</strong> · {c.sede} · {pesos(c.valor)}
                  <span className="celda-sub tenue">{fechaCorta(c.fecha_creacion)}</span>
                  <p className="reclamo-motivo">“{c.motivo}”</p>
                  {c.respuesta && <p className="tenue">Respuesta: {c.respuesta}</p>}
                </div>
                <span className={`chip chip-sm ${c.estado === "PENDIENTE" ? "chip-pendiente" : c.estado === "RESUELTO" ? "chip-cumplida" : "chip-anulado"}`}>
                  {c.estado === "PENDIENTE" ? "En revisión" : c.estado === "RESUELTO" ? "Resuelto" : "Rechazado"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReclamoDialogo
        datos={reportando}
        onCerrar={() => setReportando(null)}
        onHecho={() => {
          setReportando(null);
          setAviso("Recibimos tu reclamo. El administrador lo revisará y te avisaremos aquí.");
          reclamos.recargar();
        }}
      />

      <section className="bloque" aria-labelledby="titulo-reservas">
        <h2 id="titulo-reservas" className="bloque-titulo">Reservas</h2>
        {reservas.datos && reservas.datos.length === 0 ? (
          <div className="vacio"><p>No has hecho reservas.</p></div>
        ) : (
          <div className="tabla-contenedor" tabIndex={0}>
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

function ReclamoDialogo({
  datos,
  onCerrar,
  onHecho,
}: {
  datos: { idRegistro?: number; descripcion?: string } | null;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [comprobante, setComprobante] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const conComprobante = datos !== null && !datos.idRegistro;

  async function enviar() {
    if (!datos) return;
    setEnviando(true);
    setError(null);
    try {
      await api.cliente.reclamar(conComprobante ? { comprobante: comprobante.trim(), motivo: motivo.trim() } : { idRegistro: datos.idRegistro, motivo: motivo.trim() });
      setComprobante("");
      setMotivo("");
      onHecho();
    } catch (ex) {
      setError(ex instanceof ApiError ? Object.values(ex.campos)[0] ?? ex.message : "No se pudo enviar el reclamo");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={datos !== null} titulo="Reportar un problema con el cobro" onCerrar={onCerrar}>
      {datos && (
        <>
          {datos.descripcion && <p>Visita: <strong>{datos.descripcion}</strong></p>}
          {conComprobante && (
            <label className="campo">
              <span className="campo-rotulo">Número del comprobante</span>
              <input value={comprobante} onChange={(e) => setComprobante(e.target.value.toUpperCase())} autoFocus />
              <span className="campo-ayuda">Aparece en el comprobante que te entregaron al salir.</span>
            </label>
          )}
          <label className="campo campo-motivo">
            <span className="campo-rotulo">¿Qué pasó?</span>
            <textarea
              rows={3}
              maxLength={500}
              value={motivo}
              autoFocus={!conComprobante}
              placeholder="Por ejemplo: llegué en moto y me cobraron como carro"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
            <button className="boton boton-primario" onClick={enviar} disabled={enviando || motivo.trim().length < 10 || (conComprobante && !comprobante.trim())}>
              {enviando ? "Enviando..." : "Enviar reclamo"}
            </button>
          </div>
        </>
      )}
    </Dialogo>
  );
}
