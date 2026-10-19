import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { api, Parqueadero, Registro } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { horaCorta, pesos, pluralTipo } from "../lib/formato";
import { MapaEspacios } from "../components/MapaEspacios";
import { Odometro } from "../components/Odometro";
import { SalidaDialogo } from "../components/SalidaDialogo";
import { crearControl, soportaWebGL } from "../three/control";
import { Plaza } from "../three/layout";

const Escena = lazy(() => import("../three/Escena"));

/**
 * Panel de disponibilidad (RF05).
 * El cliente ve los cupos por tipo de vehículo y el plano 3D sin placas.
 * El personal ve las placas, puede girar el plano y registrar la salida
 * de un vehículo haciendo clic sobre su plaza.
 */
export function Disponibilidad({ sede, esPersonal }: { sede: Parqueadero; esPersonal: boolean }) {
  const webgl = useMemo(soportaWebGL, []);
  const [vista, setVista] = useState<"3d" | "plano">(webgl ? "3d" : "plano");
  const [tipo, setTipo] = useState<number | null>(null);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
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

  async function seleccionarPlaza(p: Plaza) {
    setAviso(null);
    if (!esPersonal) return;
    if (p.estado !== "OCUPADO" || !p.id_registro) {
      const texto =
        p.estado === "LIBRE"
          ? "libre"
          : p.estado === "RESERVADO"
            ? `reservado${p.placa ? ` para ${p.placa}` : ""}. Al llegar, registre el ingreso con esa placa.`
            : "fuera de servicio";
      setAviso(`${p.codigo}: ${texto}`);
      return;
    }
    try {
      const activos = await api.activos(sede.id_parqueadero, p.placa ?? undefined);
      const r = activos.find((a) => a.id_registro === p.id_registro);
      if (r) setRegistro(r);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo cargar el vehículo");
    }
  }

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
          {webgl && (
            <div className="conmutador" role="tablist" aria-label="Tipo de vista">
              <button role="tab" aria-selected={vista === "3d"} onClick={() => setVista("3d")}>3D</button>
              <button role="tab" aria-selected={vista === "plano"} onClick={() => setVista("plano")}>Plano</button>
            </div>
          )}
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
                onSeleccionar={seleccionarPlaza}
              />
            </Suspense>
            <p className="visor-ayuda">
              {esPersonal
                ? "Arrastra para girar, rueda para acercar. Haz clic en un vehículo para registrar su salida."
                : "Arrastra para girar, rueda para acercar. Las plazas con luz verde están libres."}
            </p>
            {aviso && <p className="visor-aviso" role="status">{aviso}</p>}
          </div>
        )}
        {vista === "plano" && mapa.datos && mapa.datos.length > 0 && <MapaEspacios espacios={mapa.datos} />}
      </section>

      <SalidaDialogo
        registro={registro}
        sede={sede.nombre}
        onCerrar={() => setRegistro(null)}
        onRegistrada={() => {
          mapa.recargar();
          resumen.recargar();
          totales.recargar();
        }}
      />
    </div>
  );
}
