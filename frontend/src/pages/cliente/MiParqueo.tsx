import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, Parqueadero, Reserva, VehiculoCliente } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { calcularCobro } from "../../lib/tarifa";
import { duracion, horaCorta, nombreTipo, pesos, resumenHorario } from "../../lib/formato";
import { useApariencia } from "../../lib/apariencia";
import { MapaEspacios } from "../../components/MapaEspacios";
import { Placa } from "../../components/Placa";
import { crearControl, soportaWebGL } from "../../three/control";
import { contarPisos } from "../../components/FiltroPisos";
import { Selector } from "../../components/Selector";

const Escena = lazy(() => import("../../three/Escena"));

/** Reloj que avanza cada segundo, para cuentas regresivas y valores en vivo. */
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return ahora;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Inicio del cliente (RF03, RF10).
 * Muestra la reserva activa con su cuenta regresiva y la plaza en 3D, el
 * vehículo que está dentro con el valor acumulado, y el formulario para
 * reservar un espacio.
 */
export function MiParqueo({
  sedes,
  sedeInicial,
  onIrVehiculos,
}: {
  sedes: Parqueadero[];
  sedeInicial: Parqueadero;
  onIrVehiculos: () => void;
}) {
  const estado = useConsulta(() => api.cliente.estado(), [], 10000);
  const vehiculos = useConsulta(() => api.cliente.vehiculos(), []);
  const ahora = useAhora();

  const recargar = () => {
    estado.recargar();
    vehiculos.recargar();
  };

  const e = estado.datos;
  const disponibles = (vehiculos.datos ?? []).filter((v) => !v.dentro && !v.con_reserva);

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Mi parqueo</h1>
          <p className="pagina-sub">Tus reservas y tus vehículos dentro del parqueadero, en tiempo real.</p>
        </div>
      </header>

      {estado.error && <p className="alerta alerta-error" role="alert">{estado.error}</p>}

      {e?.reservas.map((r) => (
        <ReservaActiva key={r.id_reserva} reserva={r} ahora={ahora} minutos={e.minutosReserva} onCambio={recargar} />
      ))}

      {e?.dentro.map((r) => {
        const min = Math.max(1, Math.ceil((ahora - new Date(r.fecha_ingreso).getTime()) / 60000));
        const cobro = r.valor_hora != null ? calcularCobro(min, r) : null;
        return (
          <section key={r.id_registro} className="tarjeta-dentro" aria-label={`Vehículo ${r.placa} dentro del parqueadero`}>
            <div className="tarjeta-dentro-espacio">
              <span className="tenue">Tu vehículo está en</span>
              <strong>{r.codigo_espacio}</strong>
              <span>{r.sede}</span>
            </div>
            <div className="tarjeta-dentro-datos">
              <Placa placa={r.placa} tamano="md" />
              <dl className="tiquete-datos">
                <div><dt>Ingresó</dt><dd>{horaCorta(r.fecha_ingreso)}</dd></div>
                <div><dt>Tiempo</dt><dd>{duracion(min)}</dd></div>
              </dl>
            </div>
            <div className="tarjeta-dentro-valor">
              <span className="tenue">Valor hasta ahora</span>
              <strong>{pesos(cobro?.total ?? null)}</strong>
              <span className="tenue">{pesos(r.valor_hora)} la hora, {pesos(r.valor_fraccion)} cada 15 min</span>
            </div>
          </section>
        );
      })}

      {vehiculos.datos && vehiculos.datos.length === 0 ? (
        <div className="vacio vacio-accion">
          <p>Para reservar, primero agrega la placa de tu vehículo.</p>
          <button className="boton boton-primario" onClick={onIrVehiculos}>Agregar vehículo</button>
        </div>
      ) : (
        disponibles.length > 0 && (
          <FormReserva
            sedes={sedes}
            sedeInicial={sedeInicial}
            vehiculos={disponibles}
            minutos={e?.minutosReserva ?? 30}
            onReservada={recargar}
          />
        )
      )}

      {e && vehiculos.datos && vehiculos.datos.length > 0 && disponibles.length === 0 && e.reservas.length === 0 && e.dentro.length === 0 && (
        <div className="vacio"><p>Tus vehículos no están disponibles para reservar en este momento.</p></div>
      )}
    </div>
  );
}

function ReservaActiva({ reserva, ahora, minutos, onCambio }: { reserva: Reserva; ahora: number; minutos: number; onCambio: () => void }) {
  const webgl = useMemo(soportaWebGL, []);
  const { plano2d } = useApariencia();
  const control = useRef(crearControl("panel"));
  const plano = useConsulta(() => api.plano(reserva.id_parqueadero), [reserva.id_parqueadero], 10000);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restante = new Date(reserva.fecha_fin).getTime() - ahora;
  const total = minutos * 60000;
  const vencida = restante <= 0;

  useEffect(() => {
    if (vencida) onCambio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vencida]);

  async function cancelar() {
    setError(null);
    try {
      await api.cliente.cancelarReserva(reserva.id_reserva);
      onCambio();
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : "No se pudo cancelar la reserva");
    }
  }

  return (
    <section className="reserva-activa" aria-label={`Reserva del espacio ${reserva.codigo_espacio}`}>
      <div className="reserva-tarjeta">
        <span className="tenue">Tu espacio reservado</span>
        <strong className="reserva-codigo">{reserva.codigo_espacio}</strong>
        <span className="reserva-sede">{reserva.sede}</span>
        <Placa placa={reserva.placa} tamano="md" />

        <div className="cuenta-regresiva" role="timer" aria-live="off">
          <span className={`cuenta-numero ${restante < 5 * 60000 ? "urgente" : ""}`}>{mmss(restante)}</span>
          <span className="tenue">para llegar (hasta las {horaCorta(reserva.fecha_fin)})</span>
          <span className="cuenta-barra"><span style={{ transform: `scaleX(${Math.max(0, restante / total)})` }} /></span>
        </div>
        <p className="reserva-nota">Al llegar, el operador digita tu placa y entras directo a tu espacio. Si no llegas a tiempo, el espacio se libera.</p>

        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
        {confirmando ? (
          <div className="reserva-acciones">
            <span>¿Cancelar la reserva?</span>
            <button className="boton boton-secundario" onClick={() => setConfirmando(false)}>No</button>
            <button className="boton boton-peligro" onClick={cancelar}>Sí, cancelar</button>
          </div>
        ) : (
          <button className="boton boton-texto" onClick={() => setConfirmando(true)}>Cancelar reserva</button>
        )}
      </div>

      <div className={`visor-3d reserva-visor ${plano2d && plano.datos ? "reserva-visor-2d" : ""}`}>
        {plano2d && plano.datos ? (
          <MapaEspacios espacios={plano.datos} resaltado={reserva.id_espacio} />
        ) : webgl && plano.datos ? (
          <Suspense fallback={<div className="visor-cargando">Cargando plano 3D...</div>}>
            <Escena
              className="visor-3d-lienzo"
              espacios={plano.datos}
              control={control}
              resaltarId={reserva.id_espacio}
              pisoVisible={contarPisos(plano.datos) > 1 ? plano.datos.find((e) => e.id_espacio === reserva.id_espacio)?.piso ?? null : null}
            />
          </Suspense>
        ) : (
          <div className="visor-cargando">Tu espacio es el {reserva.codigo_espacio}</div>
        )}
        {!plano2d && <p className="visor-ayuda">Tu espacio es el que parpadea en azul. Arrastra para girar el plano.</p>}
      </div>
    </section>
  );
}

function FormReserva({
  sedes,
  sedeInicial,
  vehiculos,
  minutos,
  onReservada,
}: {
  sedes: Parqueadero[];
  sedeInicial: Parqueadero;
  vehiculos: VehiculoCliente[];
  minutos: number;
  onReservada: () => void;
}) {
  const [idSede, setIdSede] = useState(sedeInicial.id_parqueadero);
  const [placa, setPlaca] = useState(vehiculos[0]?.placa ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const resumen = useConsulta(() => api.resumen(idSede), [idSede], 5000);
  // Solo se puede reservar con la sede abierta y si la reserva termina antes del cierre.
  const horario = useConsulta(() => api.horario(idSede), [idSede], 60000);

  useEffect(() => {
    if (!vehiculos.some((v) => v.placa === placa)) setPlaca(vehiculos[0]?.placa ?? "");
  }, [vehiculos, placa]);

  const vehiculo = vehiculos.find((v) => v.placa === placa);
  const cupos = resumen.datos?.porTipo.find((t) => t.id_tipo === vehiculo?.id_tipo);
  const sinCupo = cupos != null && cupos.libres === 0;
  const tipoSinEspacios = resumen.datos != null && vehiculo != null && !cupos;
  const h = horario.datos;
  const cerrada = h != null && !h.abierto;
  const cierraPronto = h != null && h.abierto && h.minutosParaCerrar != null && h.minutosParaCerrar < minutos;
  const sinHorario = cerrada || cierraPronto;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!vehiculo) return;
    setEnviando(true);
    setError(null);
    try {
      await api.cliente.reservar(vehiculo.placa, idSede);
      onReservada();
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : "No se pudo reservar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bloque-reserva" aria-labelledby="titulo-reservar">
      <div className="bloque-reserva-texto">
        <h2 id="titulo-reservar" className="bloque-titulo">Reservar un espacio</h2>
        <p>Apartamos el primer espacio libre para tu vehículo. Tienes {minutos} minutos para llegar.</p>
      </div>
      <form className="form-reserva" onSubmit={enviar}>
        <div className="campo">
          <span className="campo-rotulo">Sede</span>
          <Selector
            etiqueta="Sede"
            valor={String(idSede)}
            opciones={sedes.map((s) => ({ valor: String(s.id_parqueadero), texto: s.nombre }))}
            onChange={(v) => setIdSede(Number(v))}
          />
        </div>

        <fieldset className="campo">
          <legend className="campo-rotulo">Vehículo</legend>
          <div className="segmentos">
            {vehiculos.map((v) => (
              <label key={v.placa} className="segmento">
                <input type="radio" name="vehiculo" checked={v.placa === placa} onChange={() => setPlaca(v.placa)} />
                <span>
                  {v.placa}
                  <small>{nombreTipo(v.tipo)}{v.marca ? `, ${v.marca}` : ""}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {h && (
          <div className={`horario-reserva ${sinHorario ? "horario-cerrado" : ""}`} aria-live="polite">
            <strong>
              {cerrada
                ? h.mensaje
                : cierraPronto
                  ? `Cierra en ${h.minutosParaCerrar} min: ya no alcanza para una reserva de ${minutos} min`
                  : h.mensaje}
            </strong>
            <span className="tenue">{resumenHorario(h.horarios)}</span>
          </div>
        )}

        <p className={`form-reserva-cupos ${sinCupo || tipoSinEspacios ? "sin-cupo" : ""}`} aria-live="polite">
          {tipoSinEspacios
            ? "Esta sede no tiene espacios para este tipo de vehículo."
            : cupos
              ? cupos.libres === 0
                ? "No hay cupos libres para este vehículo en la sede."
                : `${cupos.libres} ${cupos.libres === 1 ? "cupo libre" : "cupos libres"} para ${nombreTipo(cupos.tipo).toLowerCase()} ahora.`
              : "Consultando cupos..."}
        </p>

        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
        <button className="boton boton-primario boton-ancho" disabled={enviando || !vehiculo || sinCupo || tipoSinEspacios || sinHorario}>
          {enviando ? "Reservando..." : sinHorario ? "Fuera del horario de la sede" : "Reservar espacio"}
        </button>
      </form>
    </section>
  );
}
