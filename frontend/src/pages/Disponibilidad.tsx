import { api, Parqueadero } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { horaCorta, pesos, pluralTipo } from "../lib/formato";
import { MapaEspacios } from "../components/MapaEspacios";

/**
 * Panel de disponibilidad (RF05).
 * El cliente ve los cupos por tipo de vehículo. El personal además ve el
 * mapa de plazas y los totales del día. Se actualiza cada 5 segundos.
 */
export function Disponibilidad({ sede, esPersonal }: { sede: Parqueadero; esPersonal: boolean }) {
  const resumen = useConsulta(() => api.resumen(sede.id_parqueadero), [sede.id_parqueadero], 5000);
  const mapa = useConsulta(
    () => (esPersonal ? api.espacios(sede.id_parqueadero) : Promise.resolve([])),
    [sede.id_parqueadero, esPersonal],
    5000
  );
  const totales = useConsulta(
    () => (esPersonal ? api.totalesDia(sede.id_parqueadero) : Promise.resolve(null)),
    [sede.id_parqueadero, esPersonal],
    15000
  );

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
            return (
              <div key={t.id_tipo} className={`cupo cupo-${nivel}`}>
                <span className="cupo-tipo">{pluralTipo(t.tipo)}</span>
                <span className="cupo-libres">{t.libres}</span>
                <span className="cupo-detalle">
                  {t.libres === 0 ? "Sin cupos" : t.libres === 1 ? "cupo libre" : "cupos libres"} de {util}
                </span>
                <span className="cupo-barra" role="img" aria-label={`${pct} % ocupado`}>
                  <span style={{ width: `${pct}%` }} />
                </span>
              </div>
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

      {esPersonal && mapa.datos && mapa.datos.length > 0 && (
        <section className="bloque" aria-labelledby="titulo-mapa">
          <h2 className="bloque-titulo" id="titulo-mapa">Mapa de la sede</h2>
          <MapaEspacios espacios={mapa.datos} />
        </section>
      )}
    </div>
  );
}
