import { useId, useState } from "react";
import { api, HoraPronostico } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";

const pct = (v: number) => `${Math.round(v * 100)} %`;
/** "14:00" → "2 p. m." */
const horaCorta = (h: string) => {
  const n = Number(h.slice(0, 2));
  return `${n % 12 || 12} ${n < 12 ? "a. m." : "p. m."}`;
};

// Medidas del gráfico en unidades del viewBox; el SVG se adapta al ancho.
const ANCHO = 720;
const ALTO = 200;
const M = { arriba: 14, abajo: 26, izq: 34, der: 8 };
const UMBRAL = 0.9;

function hace(fecha: string): string {
  const horas = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 3600000));
  if (horas < 1) return "hace menos de una hora";
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

/**
 * Pronóstico de ocupación de las próximas 24 horas (RF15, sección 13).
 * La curva sale de Prophet y la primera hora la corrige la red neuronal con
 * el estado actual de la sede. La franja es el rango de confianza; las
 * horas sombreadas son las de la sede cerrada.
 */
export function PronosticoDia({ idSede }: { idSede: number }) {
  const p = useConsulta(() => api.pronostico(idSede).catch(() => null), [idSede], 5 * 60000, { tiempoReal: false });
  const [activa, setActiva] = useState<number | null>(null);
  const idTitulo = useId();
  const d = p.datos;
  if (!d) return null;
  if (!d.disponible || !d.modelo || !d.resumen) {
    return (
      <section className="pronostico" aria-labelledby={idTitulo}>
        <h2 className="bloque-titulo" id={idTitulo}>Próximas 24 horas</h2>
        <p className="tenue">{d.mensaje ?? "El pronóstico no está disponible."}</p>
      </section>
    );
  }

  const horas = d.horas;
  const n = horas.length;
  const ancho = ANCHO - M.izq - M.der;
  const alto = ALTO - M.arriba - M.abajo;
  const paso = ancho / n;
  const x = (i: number) => M.izq + paso * (i + 0.5);
  const y = (v: number) => M.arriba + alto * (1 - v);
  const linea = (f: (h: HoraPronostico) => number) => horas.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(h)).toFixed(1)}`).join(" ");
  const franja =
    horas.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.superior).toFixed(1)}`).join(" ") +
    " " +
    [...horas].reverse().map((h, k) => `L${x(n - 1 - k).toFixed(1)},${y(h.inferior).toFixed(1)}`).join(" ") +
    " Z";
  const { mejorHora, pico, horasCriticas } = d.resumen;
  const m = d.modelo;
  const sel = activa !== null ? horas[activa] : null;

  return (
    <section className="pronostico" aria-labelledby={idTitulo}>
      <div className="bloque-cabeza">
        <h2 className="bloque-titulo" id={idTitulo}>Próximas 24 horas</h2>
        <p className="pronostico-lectura" aria-live="polite">
          {sel ? (
            <>
              <strong>{horaCorta(sel.hora)}</strong> {sel.abierta ? <>{pct(sel.estimada)} <span className="tenue">(entre {pct(sel.inferior)} y {pct(sel.superior)})</span></> : <span className="tenue">sede cerrada</span>}
            </>
          ) : (
            <span className="tenue">Toca o pasa el cursor por una hora</span>
          )}
        </p>
      </div>

      <div className="pronostico-claves">
        {mejorHora && (
          <div className="pronostico-clave clave-mejor">
            <span>Más cupo</span>
            <strong>{horaCorta(mejorHora.hora)}</strong>
            <small>{pct(mejorHora.estimada)} ocupado</small>
          </div>
        )}
        {pico && (
          <div className={`pronostico-clave ${pico.estimada >= UMBRAL ? "clave-critica" : "clave-pico"}`}>
            <span>Hora pico</span>
            <strong>{horaCorta(pico.hora)}</strong>
            <small>{pct(pico.estimada)} ocupado</small>
          </div>
        )}
        <div className={`pronostico-clave ${horasCriticas ? "clave-critica" : ""}`}>
          <span>Casi llena</span>
          <strong>{horasCriticas ? `${horasCriticas} ${horasCriticas === 1 ? "hora" : "horas"}` : "Ninguna hora"}</strong>
          <small>90 % o más</small>
        </div>
      </div>

      <svg
        className="pronostico-grafico"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label={`Ocupación esperada por hora. Más cupo a las ${mejorHora ? horaCorta(mejorHora.hora) : "—"}, hora pico a las ${pico ? horaCorta(pico.hora) : "—"}.`}
        onPointerLeave={(e) => e.pointerType === "mouse" && setActiva(null)}
      >
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="pg-guia" x1={M.izq} x2={ANCHO - M.der} y1={y(v)} y2={y(v)} />
            <text className="pg-eje" x={M.izq - 6} y={y(v) + 4} textAnchor="end">{v * 100}</text>
          </g>
        ))}
        {horas.map((h, i) => !h.abierta && <rect key={`c${i}`} className="pg-cerrada" x={x(i) - paso / 2} y={M.arriba} width={paso} height={alto} />)}
        <line className="pg-umbral" x1={M.izq} x2={ANCHO - M.der} y1={y(UMBRAL)} y2={y(UMBRAL)} />
        <path className="pg-franja" d={franja} />
        {d.corregida && <path className="pg-prophet" d={linea((h) => h.prophet ?? h.estimada)} />}
        <path className="pg-linea" d={linea((h) => h.estimada)} />
        {horas.map((h, i) =>
          i % 3 === 0 ? (
            <text key={`t${i}`} className="pg-eje" x={x(i)} y={ALTO - 8} textAnchor="middle">{horaCorta(h.hora).replace(" a. m.", "a").replace(" p. m.", "p")}</text>
          ) : null
        )}
        {sel && (
          <>
            <line className="pg-cursor" x1={x(activa!)} x2={x(activa!)} y1={M.arriba} y2={M.arriba + alto} />
            <circle className="pg-punto" cx={x(activa!)} cy={y(sel.estimada)} r={4.5} />
          </>
        )}
        {horas.map((h, i) => (
          <rect
            key={`z${i}`}
            className="pg-zona"
            x={x(i) - paso / 2}
            y={M.arriba}
            width={paso}
            height={alto}
            tabIndex={0}
            aria-label={`${horaCorta(h.hora)}: ${h.abierta ? pct(h.estimada) : "sede cerrada"}`}
            onPointerEnter={(e) => e.pointerType === "mouse" && setActiva(i)}
            onPointerDown={() => setActiva(i)}
            onFocus={() => setActiva(i)}
          />
        ))}
      </svg>

      <ul className="pronostico-leyenda">
        <li><span className="ley ley-linea" /> Ocupación esperada</li>
        <li><span className="ley ley-franja" /> Rango de confianza del {Math.round(m.intervalo * 100)} %</li>
        {d.corregida && <li><span className="ley ley-prophet" /> Solo calendario (Prophet)</li>}
        <li><span className="ley ley-cerrada" /> Sede cerrada</li>
      </ul>

      <p className="pronostico-nota tenue">
        Prophet con el histórico de 12 semanas{m.fuente === "SIMULADA" ? " (simulado mientras se juntan ocho semanas de registros reales)" : ""}
        {m.mape != null && <>, error medio {m.mape.toLocaleString("es-CO", { maximumFractionDigits: 1 })} % en las dos últimas semanas</>}.
        {d.corregida && " La red neuronal ajusta las primeras horas con la ocupación de ahora."} Calculado {hace(m.entrenado)}.
        {m.desactualizado && <strong className="campo-error"> No se ha recalculado en más de un día.</strong>}
      </p>

      <table className="visualmente-oculto">
        <caption>Ocupación esperada por hora</caption>
        <thead><tr><th scope="col">Hora</th><th scope="col">Esperada</th><th scope="col">Rango</th></tr></thead>
        <tbody>
          {horas.map((h) => (
            <tr key={h.fecha}>
              <th scope="row">{horaCorta(h.hora)}</th>
              <td>{h.abierta ? pct(h.estimada) : "Cerrada"}</td>
              <td>{h.abierta ? `${pct(h.inferior)} a ${pct(h.superior)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
