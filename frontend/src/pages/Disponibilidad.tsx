import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, EspacioMapa, Parqueadero, Registro } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { duracion, horaCorta, nombreTipo, pesos, pluralTipo } from "../lib/formato";
import { leerApariencia } from "../lib/apariencia";
import { Placa } from "../components/Placa";
import { MapaEspacios } from "../components/MapaEspacios";
import { Odometro } from "../components/Odometro";
import { SalidaDialogo } from "../components/SalidaDialogo";
import { contarPisos, FiltroPisos } from "../components/FiltroPisos";
import { crearControl, soportaWebGL } from "../three/control";
import { Plaza } from "../three/layout";

const Escena = lazy(() => import("../three/Escena"));

/**
 * Panel de disponibilidad (RF05).
 * El cliente ve los cupos por tipo de vehículo y el plano sin placas.
 * El personal ve las placas y los códigos de bicicleta. En el plano 3D y
 * en el 2D, un clic sobre una plaza abre su detalle; si está ocupada, desde
 * ahí se registra la salida.
 */
export function Disponibilidad({ sede, esPersonal }: { sede: Parqueadero; esPersonal: boolean }) {
  const webgl = useMemo(soportaWebGL, []);
  const [vista, setVista] = useState<"3d" | "plano">(webgl && !leerApariencia().plano2d ? "3d" : "plano");
  const [tipo, setTipo] = useState<number | null>(null);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [idSeleccion, setIdSeleccion] = useState<number | null>(null);
  const [piso, setPiso] = useState<number | null>(null);
  const control = useRef(crearControl("panel"));

  const resumen = useConsulta(() => api.resumen(sede.id_parqueadero), [sede.id_parqueadero], 5000);
  const mapa = useConsulta(
    () => (esPersonal ? api.espacios(sede.id_parqueadero) : api.plano(sede.id_parqueadero)),
    [sede.id_parqueadero, esPersonal],
    5000
  );
  const totales = useConsulta(
    () => (esPersonal ? api.totalesDia(sede.id_parqueadero) : Promise.resolve(null)),
    [sede.id_parqueadero, esPersonal],
    15000
  );

  useEffect(() => {
    setIdSeleccion(null);
    setPiso(null);
  }, [sede.id_parqueadero]);
  const pisos = contarPisos(mapa.datos);
  const espaciosDelPiso = piso == null ? mapa.datos ?? [] : (mapa.datos ?? []).filter((e) => (e.piso ?? 1) === piso);
  const seleccion = (mapa.datos ?? []).find((e) => e.id_espacio === idSeleccion) ?? null;
  const seleccionar = (id: number) => setIdSeleccion((actual) => (actual === id ? null : id));

  const r = resumen.datos;

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">{sede.nombre}</h1>
          <p className="pagina-sub">{sede.direccion}</p>
        </div>
        {r && <p className="actualizado">Actualizado a las {horaCorta(r.actualizado)}</p>}
      </header>

      {resumen.error && <p className="alerta alerta-error" role="alert">{resumen.error}</p>}

      {r && (
        <section className="cupos" aria-label="Cupos libres por tipo de vehículo">
          {r.porTipo.map((t) => {
            const util = t.total - t.fuera_de_servicio;
            const pct = util ? Math.round((t.ocupados / util) * 100) : 0;
            const nivel = t.libres === 0 ? "lleno" : pct >= 80 ? "alto" : "normal";
            const activo = tipo === t.id_tipo;
            return (
              <button
                key={t.id_tipo}
                className={`cupo cupo-${nivel} ${activo ? "cupo-activo" : ""}`}
                aria-pressed={activo}
                onClick={() => setTipo(activo ? null : t.id_tipo)}
                title={activo ? "Mostrar todos los tipos" : `Resaltar ${pluralTipo(t.tipo).toLowerCase()} libres en el plano`}
              >
                <span className="cupo-tipo">{pluralTipo(t.tipo)}</span>
                <Odometro valor={t.libres} className="cupo-libres" />
                <span className="cupo-detalle">
                  {t.libres === 0 ? "Sin cupos" : t.libres === 1 ? "cupo libre" : "cupos libres"} de {util}
                  {t.reservados > 0 && <span className="cupo-reservados">{t.reservados} {t.reservados === 1 ? "reservado" : "reservados"}</span>}
                </span>
                <span className="cupo-barra" role="img" aria-label={`${pct} % ocupado`}>
                  <span style={{ transform: `scaleX(${pct / 100})` }} />
                </span>
              </button>
            );
          })}
        </section>
      )}

      {esPersonal && totales.datos && (
        <dl className="hoy" aria-label="Movimiento de hoy">
          <div><dt>Ingresos hoy</dt><dd>{totales.datos.ingresos_hoy}</dd></div>
          <div><dt>Salidas hoy</dt><dd>{totales.datos.salidas_hoy}</dd></div>
          <div><dt>Valor cobrado hoy</dt><dd>{pesos(totales.datos.recaudo_hoy)}</dd></div>
        </dl>
      )}

      <section className="bloque" aria-labelledby="titulo-mapa">
        <div className="bloque-cabeza">
          <h2 className="bloque-titulo" id="titulo-mapa">Plano de la sede</h2>
          <div className="bloque-controles">
          <FiltroPisos pisos={pisos} valor={piso} onChange={(p) => setPiso(p)} />
          {webgl && (
            <div className="conmutador" role="tablist" aria-label="Tipo de vista">
              <button role="tab" aria-selected={vista === "3d"} onClick={() => setVista("3d")}>3D</button>
              <button role="tab" aria-selected={vista === "plano"} onClick={() => setVista("plano")}>Plano</button>
            </div>
          )}
          </div>
        </div>

        {vista === "3d" && mapa.datos && (
          <div className="visor-3d">
            <Suspense fallback={<div className="visor-cargando">Cargando plano 3D...</div>}>
              <Escena
                key={sede.id_parqueadero}
                className="visor-3d-lienzo"
                espacios={mapa.datos}
                control={control}
                resaltarTipo={tipo}
                resaltarId={idSeleccion}
                pisoVisible={piso}
                onSeleccionar={(p: Plaza) => seleccionar(p.id_espacio)}
              />
            </Suspense>
            <p className="visor-ayuda">
              {esPersonal
                ? "Arrastra para girar, rueda para acercar. Haz clic en una plaza para ver el vehículo."
                : "Arrastra para girar, rueda para acercar. Las plazas con luz verde están libres."}
            </p>
            {seleccion && (
              <DetalleEspacio espacio={seleccion} sede={sede} esPersonal={esPersonal} onCerrar={() => setIdSeleccion(null)} onSalida={setRegistro} flotante />
            )}
          </div>
        )}
        {vista === "plano" && mapa.datos && mapa.datos.length > 0 && (
          <div className="plano-con-detalle">
            <MapaEspacios espacios={espaciosDelPiso} onSeleccionar={(e) => seleccionar(e.id_espacio)} seleccionado={idSeleccion} />
            {seleccion && (
              <DetalleEspacio espacio={seleccion} sede={sede} esPersonal={esPersonal} onCerrar={() => setIdSeleccion(null)} onSalida={setRegistro} />
            )}
          </div>
        )}
      </section>

      <SalidaDialogo
        registro={registro}
        sede={sede.nombre}
        onCerrar={() => setRegistro(null)}
        onRegistrada={() => {
          setIdSeleccion(null);
          mapa.recargar();
          resumen.recargar();
          totales.recargar();
        }}
      />
    </div>
  );
}

const ESTADO: Record<EspacioMapa["estado"], string> = {
  LIBRE: "Libre",
  OCUPADO: "Ocupado",
  RESERVADO: "Reservado",
  FUERA_DE_SERVICIO: "Fuera de servicio",
};

/**
 * Detalle de una plaza: el vehículo que la ocupa (placa o código de
 * bicicleta, marca, color, dueño, tiempo y valor) o la reserva. El cliente
 * no ve placas ni dueños, solo el estado y el tipo de vehículo.
 */
function DetalleEspacio({
  espacio: e,
  sede,
  esPersonal,
  onCerrar,
  onSalida,
  flotante = false,
}: {
  espacio: EspacioMapa;
  sede: Parqueadero;
  esPersonal: boolean;
  onCerrar: () => void;
  onSalida: (r: Registro) => void;
  flotante?: boolean;
}) {
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRegistro(null);
    setError(null);
    if (!esPersonal || e.estado !== "OCUPADO" || !e.placa) return;
    let vigente = true;
    api
      .activos(sede.id_parqueadero, e.placa)
      .then((lista) => vigente && setRegistro(lista.find((r) => r.id_registro === e.id_registro) ?? null))
      .catch((x) => vigente && setError(x.message));
    return () => {
      vigente = false;
    };
  }, [e.id_espacio, e.id_registro, e.placa, e.estado, esPersonal, sede.id_parqueadero]);

  const vehiculo = [nombreTipo(e.tipo), e.marca, e.color?.toLowerCase()].filter(Boolean).join(", ");

  return (
    <aside className={`ficha-espacio ${flotante ? "ficha-flotante" : ""}`} aria-label={`Espacio ${e.codigo}`} aria-live="polite">
      <header className="ficha-cabeza">
        <div>
          <span className="ficha-codigo">{e.codigo}</span>
          {e.piso != null && e.piso > 1 && <span className="ficha-piso">Piso {e.piso}</span>}
          <span className={`chip chip-estado-${e.estado.toLowerCase()}`}>{ESTADO[e.estado]}</span>
        </div>
        <button type="button" className="aviso-cerrar" aria-label="Cerrar detalle" onClick={onCerrar}>×</button>
      </header>

      {e.estado === "OCUPADO" && (
        <>
          {esPersonal && e.placa && <Placa placa={e.placa} tamano="md" />}
          <dl className="tiquete-datos">
            <div><dt>Vehículo</dt><dd>{vehiculo}</dd></div>
            {esPersonal && <div><dt>Dueño</dt><dd>{e.cliente ?? "Visitante sin cuenta"}</dd></div>}
            {esPersonal && e.fecha_ingreso && <div><dt>Ingresó</dt><dd>{horaCorta(e.fecha_ingreso)}</dd></div>}
            {registro && <div><dt>Tiempo</dt><dd>{duracion(registro.minutos_transcurridos)}</dd></div>}
            {registro && <div><dt>Valor hasta ahora</dt><dd>{pesos(registro.valor_estimado)}</dd></div>}
          </dl>
          {error && <p className="alerta alerta-error">{error}</p>}
          {esPersonal && (
            <button className="boton boton-primario boton-ancho" disabled={!registro} onClick={() => registro && onSalida(registro)}>
              Registrar salida
            </button>
          )}
        </>
      )}
      {e.estado === "RESERVADO" && (
        <dl className="tiquete-datos">
          {esPersonal && e.placa && <div><dt>Reservado para</dt><dd><Placa placa={e.placa} /></dd></div>}
          {esPersonal && e.cliente && <div><dt>Cliente</dt><dd>{e.cliente}</dd></div>}
          {e.reserva_vence && <div><dt>Vence</dt><dd>{horaCorta(e.reserva_vence)}</dd></div>}
          <div><dt>Tipo</dt><dd>{nombreTipo(e.tipo)}</dd></div>
        </dl>
      )}
      {e.estado === "LIBRE" && <p className="tenue">Libre para {nombreTipo(e.tipo).toLowerCase()}. El próximo ingreso de este tipo puede ocuparlo.</p>}
      {e.estado === "FUERA_DE_SERVICIO" && <p className="tenue">En mantenimiento. No se asigna a ningún vehículo.</p>}
    </aside>
  );
}
