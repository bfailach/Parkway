import { useEffect, useState } from "react";
import { api, ApiError, MetodoPago, Pago, Parqueadero, Reclamo } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { duracion, fechaCorta, pesos } from "../../lib/formato";
import { Selector } from "../../components/Selector";
import { Dialogo } from "../../components/Dialogo";
import { billetesSugeridos } from "../../components/SalidaDialogo";
import { CorreccionVehiculo, RegistroACorregir } from "../../components/CorreccionVehiculo";

const NOMBRE_METODO: Record<MetodoPago, string> = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia" };
const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/**
 * Pagos (RF08) y anulación (RF09), solo para el administrador.
 * Muestra el cierre de caja por medio de pago y cada pago con su
 * comprobante. Un pago con error se anula con un motivo: no se borra, queda
 * ANULADO. Después se puede cobrar de nuevo el mismo registro.
 */
export function Pagos({ sedes }: { sedes: Parqueadero[] }) {
  const [filtros, setFiltros] = useState({ desde: hoy(), hasta: hoy(), idParqueadero: "", metodo: "", estado: "", q: "" });
  const [busqueda, setBusqueda] = useState("");
  const [anulando, setAnulando] = useState<Pago | null>(null);
  const [cobrando, setCobrando] = useState<Pago | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Corrección de un cobro (vehículo mal registrado), desde un pago o desde un reclamo.
  const [corrigiendo, setCorrigiendo] = useState<(RegistroACorregir & { idReclamo?: number }) | null>(null);
  const [respondiendo, setRespondiendo] = useState<Reclamo | null>(null);
  const [verTodosReclamos, setVerTodosReclamos] = useState(false);
  const reclamos = useConsulta(() => api.admin.reclamos(verTodosReclamos ? undefined : "PENDIENTE"), [verTodosReclamos], 30000);

  useEffect(() => {
    const t = window.setTimeout(() => setFiltros((f) => (f.q === busqueda.trim() ? f : { ...f, q: busqueda.trim() })), 300);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  const datos = useConsulta(
    () => api.admin.pagos({ ...filtros, idParqueadero: filtros.idParqueadero ? Number(filtros.idParqueadero) : undefined }),
    [filtros],
    30000
  );
  const pagos = datos.datos?.pagos ?? [];
  const t = datos.datos?.totales;
  const set = (c: Partial<typeof filtros>) => setFiltros({ ...filtros, ...c });

  function hecho(texto: string) {
    setAviso(texto);
    datos.recargar();
    reclamos.recargar();
  }

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Pagos</h1>
          <p className="pagina-sub">Cierre de caja y comprobantes. Un pago con error se anula con su motivo y queda en la bitácora.</p>
        </div>
      </header>

      <form className="filtros filtros-bitacora" onSubmit={(e) => e.preventDefault()}>
        <label className="campo campo-buscar-usuario">
          <span className="campo-rotulo">Buscar</span>
          <input type="search" placeholder="Placa o número" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </label>
        <div className="campo">
          <span className="campo-rotulo">Sede</span>
          <Selector etiqueta="Sede" valor={filtros.idParqueadero} opciones={[{ valor: "", texto: "Todas" }, ...sedes.map((s) => ({ valor: String(s.id_parqueadero), texto: s.nombre }))]} onChange={(v) => set({ idParqueadero: v })} />
        </div>
        <div className="campo">
          <span className="campo-rotulo">Medio</span>
          <Selector etiqueta="Medio de pago" valor={filtros.metodo} opciones={[{ valor: "", texto: "Todos" }, ...(Object.keys(NOMBRE_METODO) as MetodoPago[]).map((m) => ({ valor: m, texto: NOMBRE_METODO[m] }))]} onChange={(v) => set({ metodo: v })} />
        </div>
        <div className="campo">
          <span className="campo-rotulo">Estado</span>
          <Selector etiqueta="Estado" valor={filtros.estado} opciones={[{ valor: "", texto: "Todos" }, { valor: "APROBADO", texto: "Aprobados" }, { valor: "ANULADO", texto: "Anulados" }]} onChange={(v) => set({ estado: v })} />
        </div>
        <label className="campo">
          <span className="campo-rotulo">Desde</span>
          <input type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => e.target.value && set({ desde: e.target.value })} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Hasta</span>
          <input type="date" value={filtros.hasta} min={filtros.desde} onChange={(e) => e.target.value && set({ hasta: e.target.value })} />
        </label>
      </form>

      {t && (
        <dl className="caja" aria-label="Cierre de caja">
          {t.porMetodo.map((m) => (
            <div key={m.metodo}>
              <dt>{NOMBRE_METODO[m.metodo]}</dt>
              <dd>{pesos(m.total)}</dd>
              <dd className="tenue nota">{m.pagos} {m.pagos === 1 ? "pago" : "pagos"}{m.anulados ? `, ${m.anulados} anulado${m.anulados === 1 ? "" : "s"}` : ""}</dd>
            </div>
          ))}
          <div className="caja-total">
            <dt>Total recaudado</dt>
            <dd>{pesos(t.total)}</dd>
            <dd className="tenue nota">{t.anulados ? `Sin contar ${pesos(t.totalAnulado)} anulados` : `${t.pagos} pagos`}</dd>
          </div>
        </dl>
      )}

      {aviso && <p className="alerta alerta-ok" role="status">{aviso}</p>}

      {/* Reclamos de los clientes sobre un cobro */}
      {(reclamos.datos?.length || verTodosReclamos) ? (
        <section className="reclamos" aria-label="Reclamos de clientes">
          <div className="reclamos-cabeza">
            <h2 className="bloque-titulo">Reclamos{!verTodosReclamos && reclamos.datos ? ` pendientes (${reclamos.datos.length})` : ""}</h2>
            <button className="boton boton-texto boton-sm" onClick={() => setVerTodosReclamos(!verTodosReclamos)}>
              {verTodosReclamos ? "Ver solo pendientes" : "Ver también los respondidos"}
            </button>
          </div>
          {reclamos.datos?.length === 0 && <p className="tenue">No hay reclamos.</p>}
          <ul className="reclamos-lista">
            {reclamos.datos?.map((c) => (
              <li key={c.id_reclamo} className="tarjeta reclamo">
                <div>
                  <strong>{c.cliente}</strong> · {c.placa} · {c.sede} · {pesos(c.valor)} ({duracion(c.minutos)})
                  <span className="celda-sub tenue">{fechaCorta(c.fecha_creacion)}</span>
                  <p className="reclamo-motivo">“{c.motivo}”</p>
                  {c.estado !== "PENDIENTE" && (
                    <p className="tenue">
                      <span className={`chip chip-sm ${c.estado === "RESUELTO" ? "chip-cumplida" : "chip-anulado"}`}>{c.estado === "RESUELTO" ? "Resuelto" : "Rechazado"}</span>{" "}
                      {c.administrador}: {c.respuesta}
                    </p>
                  )}
                </div>
                {c.estado === "PENDIENTE" && (
                  <div className="celda-acciones">
                    <button className="boton boton-secundario boton-sm" onClick={() => { setAviso(null); setCorrigiendo({ idRegistro: c.id_registro, placa: c.placa, tipo: c.tipo, valor: c.valor, idReclamo: c.id_reclamo }); }}>
                      Corregir cobro
                    </button>
                    <button className="boton boton-texto boton-sm" onClick={() => { setAviso(null); setRespondiendo(c); }}>Responder</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {datos.error && <p className="alerta alerta-error" role="alert">{datos.error}</p>}
      {datos.datos && pagos.length === 0 ? (
        <div className="vacio"><p>No hay pagos con estos filtros.</p></div>
      ) : (
        <div className="tabla-contenedor" tabIndex={0}>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Comprobante</th>
                <th scope="col">Fecha y quién cobró</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Medio</th>
                <th scope="col">Valor</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id_pago} className={p.estado === "ANULADO" ? "fila-tenue" : undefined}>
                  <td><strong className={p.estado === "ANULADO" ? "tachado" : undefined}>{p.comprobante}</strong></td>
                  <td>{fechaCorta(p.fecha_pago)}<span className="celda-sub tenue">{p.operador}</span></td>
                  <td>{p.placa}<span className="celda-sub tenue">{p.sede}, {p.codigo_espacio}</span></td>
                  <td>{NOMBRE_METODO[p.metodo]}{p.referencia && <span className="celda-sub tenue">{p.referencia}</span>}</td>
                  <td>{pesos(p.monto)}</td>
                  <td>
                    <span className={`chip ${p.estado === "APROBADO" ? "chip-cumplida" : "chip-anulado"}`}>{p.estado === "APROBADO" ? "Aprobado" : "Anulado"}</span>
                    {p.estado === "ANULADO" && <span className="motivo-anulacion" title={p.motivo_anulacion ?? ""}>{p.anulado_por}: {p.motivo_anulacion}</span>}
                  </td>
                  <td className="celda-acciones">
                    {p.estado === "APROBADO" && (
                      <>
                        <button className="boton boton-texto boton-sm" title="El operador registró otra placa u otro tipo" onClick={() => { setAviso(null); setCorrigiendo({ idRegistro: p.id_registro, placa: p.placa, tipo: p.tipo, valor: p.monto }); }}>Corregir cobro</button>
                        <button className="boton boton-texto boton-sm" onClick={() => { setAviso(null); setAnulando(p); }}>Anular</button>
                      </>
                    )}
                    {p.estado === "ANULADO" && p.sin_pago_vigente && (
                      <button className="boton boton-secundario boton-sm" onClick={() => { setAviso(null); setCobrando(p); }}>Cobrar de nuevo</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagos.length === 500 && <p className="tenue">Se muestran los 500 pagos más recientes; acote los filtros para ver más.</p>}

      <Dialogo abierto={corrigiendo !== null} titulo="Corregir cobro" onCerrar={() => setCorrigiendo(null)}>
        {corrigiendo && (
          <CorreccionVehiculo modo="cobro" registro={corrigiendo} idReclamo={corrigiendo.idReclamo} onListo={(m) => { setCorrigiendo(null); hecho(m); }} />
        )}
      </Dialogo>
      <ResponderDialogo reclamo={respondiendo} onCerrar={() => setRespondiendo(null)} onHecho={(m) => { setRespondiendo(null); hecho(m); }} />
      <AnularDialogo pago={anulando} onCerrar={() => setAnulando(null)} onHecho={(p) => { setAnulando(null); hecho(`Anulamos el pago del comprobante ${p.comprobante}. Si hay que cobrarlo, use "Cobrar de nuevo".`); }} />
      <CobrarDialogo pago={cobrando} onCerrar={() => setCobrando(null)} onHecho={(p) => { setCobrando(null); hecho(`Cobramos ${pesos(p.monto)} a ${p.placa} con el comprobante ${p.comprobante}.`); }} />
    </div>
  );
}

function AnularDialogo({ pago, onCerrar, onHecho }: { pago: Pago | null; onCerrar: () => void; onHecho: (p: Pago) => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setMotivo("");
    setError(null);
  }, [pago?.id_pago]);

  async function confirmar() {
    if (!pago) return;
    if (motivo.trim().length < 10) {
      setError("Explique el motivo en al menos 10 caracteres");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      onHecho(await api.admin.anularPago(pago.id_pago, motivo));
    } catch (ex) {
      setError(ex instanceof ApiError ? Object.values(ex.campos)[0] ?? ex.message : "No se pudo anular el pago");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={!!pago} titulo="Anular pago" onCerrar={onCerrar}>
      {pago && (
        <>
          <dl className="tiquete-datos">
            <div><dt>Comprobante</dt><dd>{pago.comprobante}</dd></div>
            <div><dt>Placa</dt><dd>{pago.placa}</dd></div>
            <div><dt>Valor</dt><dd>{pesos(pago.monto)} en {NOMBRE_METODO[pago.metodo].toLowerCase()}</dd></div>
            <div><dt>Fecha</dt><dd>{fechaCorta(pago.fecha_pago)}</dd></div>
          </dl>
          <label className="campo campo-motivo">
            <span className="campo-rotulo">Motivo</span>
            <textarea rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se cobró con tarjeta, pero el cliente pagó en efectivo" autoFocus />
            <span className="campo-ayuda">El pago no se borra: queda anulado con este motivo y su nombre en la bitácora.</span>
          </label>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
            <button className="boton boton-peligro" onClick={confirmar} disabled={enviando}>{enviando ? "Anulando..." : "Anular pago"}</button>
          </div>
        </>
      )}
    </Dialogo>
  );
}

function CobrarDialogo({ pago, onCerrar, onHecho }: { pago: Pago | null; onCerrar: () => void; onHecho: (p: Pago) => void }) {
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setMetodo("EFECTIVO");
    setRecibido("");
    setReferencia("");
    setError(null);
  }, [pago?.id_pago]);

  const valor = pago?.valor_calculado ?? 0;
  const recibidoNum = Number(recibido) || 0;

  async function confirmar() {
    if (!pago) return;
    setEnviando(true);
    setError(null);
    try {
      onHecho(await api.admin.cobrarDeNuevo(pago.id_registro, {
        metodo,
        recibido: metodo === "EFECTIVO" && recibidoNum ? recibidoNum : undefined,
        referencia: metodo === "EFECTIVO" ? undefined : referencia,
      }));
    } catch (ex) {
      setError(ex instanceof ApiError ? Object.values(ex.campos)[0] ?? ex.message : "No se pudo registrar el pago");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={!!pago} titulo="Cobrar de nuevo" onCerrar={onCerrar}>
      {pago && (
        <>
          <p>
            Visita de <strong>{pago.placa}</strong> en {pago.sede}, {duracion(pago.minutos)}. El pago anterior ({pago.comprobante}) quedó anulado.
          </p>
          <div className="cobro-total"><span>Valor de la visita</span><strong>{pesos(valor)}</strong></div>
          <fieldset className="campo pago-metodos">
            <legend className="campo-rotulo">Medio de pago</legend>
            <div className="segmentos">
              {(Object.keys(NOMBRE_METODO) as MetodoPago[]).map((m) => (
                <label key={m} className="segmento">
                  <input type="radio" name="metodo-cobro" checked={metodo === m} onChange={() => { setMetodo(m); setError(null); }} />
                  <span>{NOMBRE_METODO[m]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {metodo === "EFECTIVO" ? (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="recibido-cobro">Recibido <span className="opcional">(vacío si paga exacto)</span></label>
              <input id="recibido-cobro" inputMode="numeric" value={recibido ? pesos(recibidoNum) : ""} placeholder={pesos(valor)} onChange={(e) => setRecibido(e.target.value.replace(/\D/g, "").slice(0, 7))} />
              <div className="billetes">
                {billetesSugeridos(valor).map((b) => <button key={b} type="button" className="boton boton-barra" onClick={() => setRecibido(String(b))}>{pesos(b)}</button>)}
              </div>
              {recibidoNum > 0 && (recibidoNum < valor ? <span className="campo-error">Faltan {pesos(valor - recibidoNum)}</span> : <span className="cambio">Cambio: <strong>{pesos(recibidoNum - valor)}</strong></span>)}
            </div>
          ) : (
            <label className="campo">
              <span className="campo-rotulo">{metodo === "TARJETA" ? "Número de aprobación del datáfono" : "Referencia de la transferencia"}</span>
              <input value={referencia} onChange={(e) => setReferencia(metodo === "TARJETA" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value.toUpperCase().slice(0, 30))} />
            </label>
          )}
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
            <button className="boton boton-primario" onClick={confirmar} disabled={enviando || (metodo === "EFECTIVO" && recibidoNum > 0 && recibidoNum < valor)}>
              {enviando ? "Registrando..." : `Cobrar ${pesos(valor)}`}
            </button>
          </div>
        </>
      )}
    </Dialogo>
  );
}

/** Respuesta a un reclamo sin corregir el cobro (por ejemplo, el cobro era correcto). */
function ResponderDialogo({ reclamo, onCerrar, onHecho }: { reclamo: Reclamo | null; onCerrar: () => void; onHecho: (m: string) => void }) {
  const [estado, setEstado] = useState<"RESUELTO" | "RECHAZADO">("RECHAZADO");
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setEstado("RECHAZADO");
    setRespuesta("");
    setError(null);
  }, [reclamo?.id_reclamo]);

  async function confirmar() {
    if (!reclamo) return;
    setEnviando(true);
    setError(null);
    try {
      await api.admin.responderReclamo(reclamo.id_reclamo, estado, respuesta.trim());
      onHecho(`Respondimos el reclamo de ${reclamo.cliente}. Recibirá el aviso.`);
    } catch (ex) {
      setError(ex instanceof ApiError ? Object.values(ex.campos)[0] ?? ex.message : "No se pudo responder");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={!!reclamo} titulo="Responder reclamo" onCerrar={onCerrar}>
      {reclamo && (
        <>
          <p>
            <strong>{reclamo.cliente}</strong> sobre {reclamo.placa} ({pesos(reclamo.valor)}): “{reclamo.motivo}”
          </p>
          <fieldset className="campo">
            <legend className="campo-rotulo">Resultado</legend>
            <div className="segmentos">
              <label className="segmento">
                <input type="radio" name="estado-reclamo" checked={estado === "RECHAZADO"} onChange={() => setEstado("RECHAZADO")} />
                <span>El cobro es correcto</span>
              </label>
              <label className="segmento">
                <input type="radio" name="estado-reclamo" checked={estado === "RESUELTO"} onChange={() => setEstado("RESUELTO")} />
                <span>Resuelto por otra vía</span>
              </label>
            </div>
          </fieldset>
          <label className="campo campo-motivo">
            <span className="campo-rotulo">Respuesta para el cliente</span>
            <textarea rows={3} maxLength={500} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} autoFocus />
            <span className="campo-ayuda">Si el vehículo se registró mal, use “Corregir cobro”: se devuelve la diferencia y el reclamo queda resuelto.</span>
          </label>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
            <button className="boton boton-primario" onClick={confirmar} disabled={enviando || respuesta.trim().length < 5}>{enviando ? "Enviando..." : "Responder"}</button>
          </div>
        </>
      )}
    </Dialogo>
  );
}
