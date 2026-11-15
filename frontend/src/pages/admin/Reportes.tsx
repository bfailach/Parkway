import { useState } from "react";
import {
  api, FiltrosReporte, Parqueadero, ReporteIngresos, ReporteOcupacion, ReporteRotacion, TipoReporte, TipoVehiculo,
} from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { duracion, nombreTipo, pesos } from "../../lib/formato";
import { Selector } from "../../components/Selector";

/**
 * Reportes del administrador (RF13): ocupación por franja horaria,
 * rotación por espacio e ingresos por periodo y sede. Cada uno se ve en
 * pantalla y se descarga en CSV para abrirlo en Excel.
 */
const PESTANAS: { id: TipoReporte; nombre: string }[] = [
  { id: "ocupacion", nombre: "Ocupación por franja" },
  { id: "rotacion", nombre: "Rotación por espacio" },
  { id: "ingresos", nombre: "Ingresos por periodo" },
];

const pct = (v: number | null | undefined, decimales = 0) =>
  v == null ? "—" : `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: decimales })} %`;
const num = (v: number, decimales = 1) => v.toLocaleString("es-CO", { maximumFractionDigits: decimales });
const hora12 = (h: number) => `${h % 12 || 12} ${h < 12 ? "a. m." : "p. m."}`;

/** Fecha local AAAA-MM-DD. */
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function rango(preset: string): { desde: string; hasta: string } {
  const hoy = new Date();
  const dias = (n: number) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n);
  if (preset === "7") return { desde: iso(dias(6)), hasta: iso(hoy) };
  if (preset === "30") return { desde: iso(dias(29)), hasta: iso(hoy) };
  if (preset === "mes") return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
  if (preset === "anterior") {
    return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
  }
  return { desde: iso(hoy), hasta: iso(hoy) };
}
const PRESETS = [
  { id: "hoy", nombre: "Hoy" },
  { id: "7", nombre: "7 días" },
  { id: "30", nombre: "30 días" },
  { id: "mes", nombre: "Este mes" },
  { id: "anterior", nombre: "Mes anterior" },
];

export function Reportes({ sedes, tipos }: { sedes: Parqueadero[]; tipos: TipoVehiculo[] }) {
  const [pestana, setPestana] = useState<TipoReporte>("ocupacion");
  const [preset, setPreset] = useState("7");
  const [filtros, setFiltros] = useState<FiltrosReporte>({ ...rango("7"), agrupacion: "dia" });
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  const reporte = useConsulta(
    () => api.admin.reporte<ReporteOcupacion | ReporteRotacion | ReporteIngresos>(pestana, filtros),
    [pestana, filtros]
  );
  const set = (c: Partial<FiltrosReporte>) => setFiltros({ ...filtros, ...c });

  async function descargar() {
    setDescargando(true);
    setErrorDescarga(null);
    try {
      await api.admin.descargarReporte(pestana, filtros);
    } catch (e) {
      setErrorDescarga(e instanceof Error ? e.message : "No se pudo descargar el reporte");
    } finally {
      setDescargando(false);
    }
  }

  const sedeNombre = filtros.idParqueadero ? sedes.find((s) => s.id_parqueadero === filtros.idParqueadero)?.nombre : "Todas las sedes";

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Reportes</h1>
          <p className="pagina-sub">Cómo se usan las sedes y cuánto producen. Cada reporte se descarga en CSV para Excel.</p>
        </div>
        <button className="boton boton-primario" onClick={descargar} disabled={descargando || !reporte.datos}>
          {descargando ? "Descargando..." : "Descargar CSV"}
        </button>
      </header>

      <div className="filtros-historial filtros-reporte">
        <div className="filtros">
          <div className="campo">
            <span className="campo-rotulo">Sede</span>
            <Selector
              etiqueta="Sede"
              valor={String(filtros.idParqueadero ?? "")}
              opciones={[{ valor: "", texto: "Todas" }, ...sedes.map((s) => ({ valor: String(s.id_parqueadero), texto: s.nombre }))]}
              onChange={(v) => set({ idParqueadero: v ? Number(v) : undefined })}
            />
          </div>
          <div className="campo">
            <span className="campo-rotulo">Vehículo</span>
            <Selector
              etiqueta="Tipo de vehículo"
              valor={String(filtros.idTipo ?? "")}
              opciones={[{ valor: "", texto: "Todos" }, ...tipos.map((t) => ({ valor: String(t.id_tipo), texto: nombreTipo(t.nombre) }))]}
              onChange={(v) => set({ idTipo: v ? Number(v) : undefined })}
            />
          </div>
          <label className="campo">
            <span className="campo-rotulo">Desde</span>
            <input type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => { setPreset(""); if (e.target.value) set({ desde: e.target.value }); }} />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Hasta</span>
            <input type="date" value={filtros.hasta} min={filtros.desde} onChange={(e) => { setPreset(""); if (e.target.value) set({ hasta: e.target.value }); }} />
          </label>
          {pestana === "ingresos" && (
            <div className="campo">
              <span className="campo-rotulo">Agrupar por</span>
              <Selector
                etiqueta="Agrupar por"
                valor={filtros.agrupacion ?? "dia"}
                opciones={[{ valor: "dia", texto: "Día" }, { valor: "semana", texto: "Semana" }, { valor: "mes", texto: "Mes" }]}
                onChange={(v) => set({ agrupacion: v as FiltrosReporte["agrupacion"] })}
              />
            </div>
          )}
        </div>
        <div className="atajos-fecha" role="group" aria-label="Periodo">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="boton boton-barra" aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); set(rango(p.id)); }}>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      <nav className="pestanas-reporte" aria-label="Reportes">
        {PESTANAS.map((p) => (
          <button key={p.id} className="nav-item" aria-current={pestana === p.id ? "page" : undefined} onClick={() => setPestana(p.id)}>
            {p.nombre}
          </button>
        ))}
      </nav>

      <p className="tenue resumen-bitacora">{sedeNombre}, del {filtros.desde.split("-").reverse().join("/")} al {filtros.hasta.split("-").reverse().join("/")}.</p>
      {errorDescarga && <p className="alerta alerta-error" role="alert">{errorDescarga}</p>}
      {reporte.error && <p className="alerta alerta-error" role="alert">{reporte.error}</p>}
      {reporte.cargando && !reporte.datos && <p className="tenue">Calculando...</p>}
      {reporte.datos && pestana === "ocupacion" && "capacidad" in reporte.datos && <VistaOcupacion r={reporte.datos as ReporteOcupacion} />}
      {reporte.datos && pestana === "rotacion" && "rotacionPromedio" in reporte.datos.resumen && <VistaRotacion r={reporte.datos as ReporteRotacion} />}
      {reporte.datos && pestana === "ingresos" && "ticketPromedio" in reporte.datos.resumen && <VistaIngresos r={reporte.datos as ReporteIngresos} />}
    </div>
  );
}

function Indicadores({ items }: { items: { rotulo: string; valor: string; nota?: string }[] }) {
  return (
    <dl className="indicadores">
      {items.map((i) => (
        <div key={i.rotulo}>
          <dt>{i.rotulo}</dt>
          <dd>{i.valor}</dd>
          {i.nota && <span className="tenue">{i.nota}</span>}
        </div>
      ))}
    </dl>
  );
}

/** Barras verticales simples en SVG, con una o dos series. */
function Barras({ etiquetas, series, formato, alto = 180, titulo }: {
  etiquetas: string[];
  series: { nombre: string; valores: (number | null)[]; clase: string }[];
  formato: (v: number) => string;
  alto?: number;
  titulo: string;
}) {
  const ancho = 720;
  const m = { arriba: 10, abajo: 24, izq: 8, der: 8 };
  const max = Math.max(1e-9, ...series.flatMap((s) => s.valores.map((v) => v ?? 0)));
  const paso = (ancho - m.izq - m.der) / Math.max(etiquetas.length, 1);
  const barra = Math.min(28, (paso * 0.8) / series.length);
  const h = alto - m.arriba - m.abajo;
  const cada = Math.ceil(etiquetas.length / 12);
  return (
    <figure className="barras">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo}>
        <line className="pg-guia" x1={m.izq} x2={ancho - m.der} y1={m.arriba + h} y2={m.arriba + h} />
        {etiquetas.map((e, i) => {
          const centro = m.izq + paso * (i + 0.5);
          return (
            <g key={e + i}>
              {series.map((s, k) => {
                const v = s.valores[i] ?? 0;
                const alto2 = (v / max) * h;
                return (
                  <rect key={s.nombre} className={s.clase} x={centro - (barra * series.length) / 2 + k * barra} y={m.arriba + h - alto2} width={barra - 2} height={alto2} rx={2}>
                    <title>{`${e}, ${s.nombre}: ${formato(v)}`}</title>
                  </rect>
                );
              })}
              {i % cada === 0 && <text className="pg-eje" x={centro} y={alto - 6} textAnchor="middle">{e}</text>}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="pronostico-leyenda">
          {series.map((s) => <span key={s.nombre}><span className={`ley ley-${s.clase}`} /> {s.nombre}</span>)}
        </figcaption>
      )}
    </figure>
  );
}

function VistaOcupacion({ r }: { r: ReporteOcupacion }) {
  const { resumen: s, filas } = r;
  if (!s.horasAnalizadas) return <div className="vacio"><p>No hay datos en este periodo.</p></div>;
  return (
    <>
      <Indicadores
        items={[
          { rotulo: "Ocupación promedio", valor: pct(s.ocupacionPromedio, 1), nota: `${r.capacidad} espacios en servicio` },
          { rotulo: "Hora pico", valor: s.horaPico ? hora12(s.horaPico.hora) : "—", nota: s.horaPico ? `${pct(s.horaPico.promedio)} en promedio` : undefined },
          { rotulo: "Ocupación máxima", valor: s.maximo ? pct(s.maximo.ocupacion) : "—", nota: s.maximo ? `${s.maximo.fecha.split("-").reverse().join("/")}, ${hora12(s.maximo.hora)}` : undefined },
          { rotulo: "Vehículos que llegaron", valor: num(s.llegadas, 0) },
        ]}
      />
      <section className="bloque">
        <h2 className="bloque-titulo">Ocupación promedio por hora</h2>
        <Barras
          titulo="Ocupación promedio por hora, entre semana y fines de semana"
          etiquetas={filas.map((f) => String(f.hora))}
          series={[
            { nombre: "Lunes a viernes", valores: filas.map((f) => f.promedioLaboral), clase: "barra-a" },
            { nombre: "Fines de semana y festivos", valores: filas.map((f) => f.promedioLibre), clase: "barra-b" },
          ]}
          formato={(v) => pct(v, 1)}
        />
      </section>
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Franja</th>
              <th scope="col">Promedio</th>
              <th scope="col">Lunes a viernes</th>
              <th scope="col">Fines de semana y festivos</th>
              <th scope="col">Máxima</th>
              <th scope="col">Llegadas por día</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.hora} className={s.horaPico?.hora === f.hora ? "fila-destacada" : undefined}>
                <td>{hora12(f.hora)} a {hora12((f.hora + 1) % 24)}</td>
                <td><span className="medidor" style={{ ["--valor" as string]: f.promedio }} />{pct(f.promedio, 1)}</td>
                <td>{pct(f.promedioLaboral, 1)}</td>
                <td>{pct(f.promedioLibre, 1)}</td>
                <td>{pct(f.maximo)}</td>
                <td>{num(f.llegadasPromedio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VistaRotacion({ r }: { r: ReporteRotacion }) {
  const { resumen: s, filas } = r;
  const [todos, setTodos] = useState(false);
  const visibles = todos ? filas : filas.slice(0, 50);
  if (!filas.length) return <div className="vacio"><p>No hay espacios con estos filtros.</p></div>;
  return (
    <>
      <Indicadores
        items={[
          { rotulo: "Rotación promedio", valor: `${num(s.rotacionPromedio, 2)}`, nota: "vehículos por espacio al día" },
          { rotulo: "Espacio más usado", valor: s.masUsado?.codigo ?? "—", nota: s.masUsado ? `${s.masUsado.usos} vehículos, ${s.masUsado.sede}` : undefined },
          { rotulo: "Tiempo ocupado", valor: pct(s.ocupadoPromedio, 1), nota: "promedio por espacio en el periodo" },
          { rotulo: "Espacios sin uso", valor: `${s.sinUso} de ${s.espacios}`, nota: s.sinUso ? "candidatos a revisar" : undefined },
        ]}
      />
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Espacio</th>
              <th scope="col">Sede</th>
              <th scope="col">Tipo</th>
              <th scope="col">Vehículos</th>
              <th scope="col">Por día</th>
              <th scope="col">Tiempo ocupado</th>
              <th scope="col">Cobrado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <tr key={e.id_espacio}>
                <td><strong>{e.codigo}</strong>{e.piso > 1 && <span className="tenue"> piso {e.piso}</span>}</td>
                <td>{e.sede}</td>
                <td>{nombreTipo(e.tipo)}</td>
                <td>{e.usos}</td>
                <td>{num(e.rotacionDiaria, 2)}</td>
                <td><span className="medidor" style={{ ["--valor" as string]: e.porcentajeOcupado }} />{pct(e.porcentajeOcupado, 1)}</td>
                <td>{pesos(e.ingresos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > 50 && (
        <button className="boton boton-texto" onClick={() => setTodos(!todos)}>
          {todos ? "Ver solo los 50 primeros" : `Ver los ${filas.length} espacios`}
        </button>
      )}
    </>
  );
}

function VistaIngresos({ r }: { r: ReporteIngresos }) {
  const { resumen: s, filas } = r;
  const periodos = [...new Set(filas.map((f) => f.periodo))];
  const sedes = [...new Set(filas.map((f) => f.sede))];
  const total = (p: string) => filas.filter((f) => f.periodo === p).reduce((a, f) => a + f.valor, 0);
  const nombre = (p: string) => filas.find((f) => f.periodo === p)?.nombre ?? p;
  const corta = (p: string) => (nombre(p).startsWith("Semana") ? p.slice(8, 10) + "/" + p.slice(5, 7) : nombre(p).replace(/\/\d{4}$/, "").replace(/ de \d{4}$/, ""));
  return (
    <>
      <Indicadores
        items={[
          { rotulo: "Total recaudado", valor: pesos(s.valor), nota: `pagos aprobados en ${s.dias} ${s.dias === 1 ? "día" : "días"}` },
          { rotulo: "Salidas", valor: num(s.salidas, 0) },
          { rotulo: "Valor promedio por salida", valor: s.ticketPromedio != null ? pesos(Math.round(s.ticketPromedio)) : "—", nota: s.permanenciaPromedio != null ? `${duracion(Math.round(s.permanenciaPromedio))} de permanencia` : undefined },
          { rotulo: "Mejor periodo", valor: s.mejorPeriodo ? pesos(s.mejorPeriodo.valor) : "—", nota: s.mejorPeriodo?.nombre },
        ]}
      />
      <section className="bloque">
        <h2 className="bloque-titulo">Recaudo por periodo</h2>
        <Barras
          titulo="Recaudo por periodo"
          etiquetas={periodos.map(corta)}
          series={[{ nombre: "Recaudado", valores: periodos.map(total), clase: "barra-a" }]}
          formato={(v) => pesos(v)}
        />
        <p className="tenue reparto-metodos">
          Efectivo {pesos(s.porMetodo.efectivo)} · Tarjeta {pesos(s.porMetodo.tarjeta)} · Transferencia {pesos(s.porMetodo.transferencia)}
        </p>
      </section>
      {sedes.length > 1 && (
        <dl className="hoy reporte-sedes">
          {s.porSede.map((x) => (
            <div key={x.sede}><dt>{x.sede}</dt><dd>{pesos(x.valor)}</dd><span className="tenue">{x.salidas} salidas</span></div>
          ))}
        </dl>
      )}
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Periodo</th>
              {sedes.length > 1 && <th scope="col">Sede</th>}
              <th scope="col">Salidas</th>
              <th scope="col">Recaudado</th>
              <th scope="col">Efectivo</th>
              <th scope="col">Tarjeta</th>
              <th scope="col">Transferencia</th>
              <th scope="col">Promedio por salida</th>
              <th scope="col">Permanencia promedio</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.periodo + f.id_parqueadero} className={f.salidas === 0 ? "fila-tenue" : undefined}>
                <td>{f.nombre}</td>
                {sedes.length > 1 && <td>{f.sede}</td>}
                <td>{f.salidas}</td>
                <td>{pesos(f.valor)}</td>
                <td>{pesos(f.efectivo)}</td>
                <td>{pesos(f.tarjeta)}</td>
                <td>{pesos(f.transferencia)}</td>
                <td>{f.salidas ? pesos(Math.round(f.valor / f.salidas)) : "—"}</td>
                <td>{f.minutos_promedio != null ? duracion(Math.round(f.minutos_promedio)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
