import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, PreferenciasNotificacion } from "../../lib/api";
import { pesos } from "../../lib/formato";
import { Selector } from "../../components/Selector";
import { avisar, EVENTO_PREFERENCIAS } from "../../components/Notificador";

/**
 * Configuración de los avisos del cliente: cada cuánto ver el tiempo y el
 * valor acumulado, un monto límite, el aviso de la reserva y el de entrada
 * y salida. Se guarda en la cuenta, así que sirve en cualquier dispositivo.
 */
const permisoActual = () => (typeof Notification === "undefined" ? "no-soportado" : Notification.permission);

export function Notificaciones() {
  const [p, setP] = useState<PreferenciasNotificacion | null>(null);
  const [monto, setMonto] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [permiso, setPermiso] = useState(permisoActual);

  useEffect(() => {
    api.cliente
      .preferencias()
      .then((x) => {
        setP(x);
        setMonto(x.montoAviso ? String(x.montoAviso) : "");
      })
      .catch((e) => setMensaje({ tipo: "error", texto: e.message }));
  }, []);

  if (!p) return <div className="pagina">{mensaje && <p className="alerta alerta-error">{mensaje.texto}</p>}</div>;
  const cambiar = (c: Partial<PreferenciasNotificacion>) => setP({ ...p, ...c });

  async function pedirPermiso(activar: boolean) {
    if (!activar) return cambiar({ navegador: false });
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    setPermiso(r);
    cambiar({ navegador: r === "granted" });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const m = monto.replace(/\D/g, "");
    const datos = { ...p!, montoAviso: m ? Number(m) : null };
    setGuardando(true);
    setErrores({});
    setMensaje(null);
    try {
      const guardadas = await api.cliente.guardarPreferencias(datos);
      setP(guardadas);
      window.dispatchEvent(new CustomEvent(EVENTO_PREFERENCIAS, { detail: guardadas }));
      setMensaje({ tipo: "ok", texto: "Guardamos tus notificaciones." });
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrores(ex.campos);
        setMensaje({ tipo: "error", texto: ex.message });
      }
    } finally {
      setGuardando(false);
    }
  }

  const apagado = !p.activas;

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Notificaciones</h1>
          <p className="pagina-sub">Elige qué avisos quieres ver mientras tu vehículo está en el parqueadero.</p>
        </div>
      </header>

      <form className="formulario panel-form panel-notificaciones" onSubmit={guardar} noValidate>
        {mensaje && <p className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status">{mensaje.texto}</p>}

        <label className="interruptor">
          <span className="interruptor-texto">
            <strong>Recibir avisos</strong>
            <span>Apágalo para no ver ningún aviso.</span>
          </span>
          <input type="checkbox" role="switch" checked={p.activas} onChange={(e) => cambiar({ activas: e.target.checked })} />
          <span className="interruptor-pista" aria-hidden="true" />
        </label>

        <fieldset className="grupo-avisos" disabled={apagado}>
          <div className="campo">
            <span className="campo-rotulo">Tiempo y valor acumulado</span>
            <Selector
              etiqueta="Tiempo y valor acumulado"
              valor={String(p.cadaMinutos)}
              disabled={apagado}
              opciones={[
                { valor: "15", texto: "Cada 15 minutos" },
                { valor: "30", texto: "Cada 30 minutos" },
                { valor: "60", texto: "Cada hora" },
                { valor: "120", texto: "Cada 2 horas" },
                { valor: "0", texto: "No avisar" },
              ]}
              onChange={(v) => cambiar({ cadaMinutos: Number(v) })}
            />
            <span className="campo-ayuda">Te mostramos cuánto tiempo lleva tu vehículo y cuánto vas a pagar.</span>
          </div>

          <label className="campo">
            <span className="campo-rotulo">Avisarme si el valor pasa de <span className="opcional">(opcional)</span></span>
            <input
              inputMode="numeric"
              value={monto ? pesos(Number(monto.replace(/\D/g, ""))) : ""}
              onChange={(e) => setMonto(e.target.value.replace(/\D/g, "").slice(0, 7))}
              placeholder="Por ejemplo, $ 20.000"
              aria-invalid={!!errores.montoAviso}
            />
            {errores.montoAviso ? <span className="campo-error">{errores.montoAviso}</span> : <span className="campo-ayuda">Déjalo vacío para no recibir este aviso.</span>}
          </label>

          <div className="campo">
            <span className="campo-rotulo">Antes de que venza mi reserva</span>
            <Selector
              etiqueta="Antes de que venza mi reserva"
              valor={String(p.minutosAntesReserva)}
              disabled={apagado}
              opciones={[
                { valor: "5", texto: "5 minutos antes" },
                { valor: "10", texto: "10 minutos antes" },
                { valor: "15", texto: "15 minutos antes" },
                { valor: "0", texto: "No avisar" },
              ]}
              onChange={(v) => cambiar({ minutosAntesReserva: Number(v) })}
            />
          </div>

          <label className="interruptor">
            <span className="interruptor-texto">
              <strong>Entrada y salida</strong>
              <span>Cuando el operador registra que tu vehículo entró o salió.</span>
            </span>
            <input type="checkbox" role="switch" checked={p.alEntrarSalir} onChange={(e) => cambiar({ alEntrarSalir: e.target.checked })} />
            <span className="interruptor-pista" aria-hidden="true" />
          </label>

          <label className="interruptor">
            <span className="interruptor-texto">
              <strong>Notificaciones del navegador</strong>
              <span>
                {permiso === "denied"
                  ? "El navegador las bloqueó. Actívalas en la configuración del sitio."
                  : permiso === "no-soportado"
                    ? "Este navegador no las permite."
                    : "Para recibir los avisos aunque estés en otra pestaña."}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={p.navegador}
              disabled={permiso === "denied" || permiso === "no-soportado"}
              onChange={(e) => pedirPermiso(e.target.checked)}
            />
            <span className="interruptor-pista" aria-hidden="true" />
          </label>
        </fieldset>

        <div className="acciones-form">
          <button type="button" className="boton boton-secundario" onClick={() => avisar("Así se ve un aviso", "ABC 123 lleva 1 h 15 min en Sede Chapinero. Valor hasta ahora: $ 7.000.")}>
            Probar un aviso
          </button>
          <button className="boton boton-primario" disabled={guardando}>{guardando ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
