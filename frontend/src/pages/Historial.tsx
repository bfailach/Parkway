import { FormEvent, useState } from "react";
import { api, FiltrosHistorial, Parqueadero, TipoVehiculo } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { duracion, fechaCorta, nombreTipo, pesos } from "../lib/formato";
import { Placa } from "../components/Placa";
import { Selector } from "../components/Selector";
import { COLORES, MARCAS } from "../components/CampoOpciones";

const hoy = (dias = 0) => {
  const d = new Date(Date.now() - dias * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

interface Formulario {
  placa: string;
  idTipo: string;
  marca: string;
  color: string;
  desde: string;
  hasta: string;
  horasMin: string;
  horasMax: string;
  valorMin: string;
  valorMax: string;
  orden: "fecha" | "valor" | "tiempo";
}

const VACIO: Formulario = {
  placa: "",
  idTipo: "",
  marca: "",
  color: "",
  desde: hoy(6),
  hasta: hoy(),
  horasMin: "",
  horasMax: "",
  valorMin: "",
  valorMax: "",
  orden: "fecha",
};

const numero = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));
const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 8);

/**
 * Historial de salidas con filtros por placa, tipo de vehículo, marca,
 * color, fechas, horas de permanencia y valor pagado. Se puede ver por
 * visita o agrupado por vehículo (visitas, tiempo total y dinero gastado
 * en la sede); en la vista agrupada, los rangos se aplican a los totales.
 */
export function Historial({ sede, tipos }: { sede: Parqueadero; tipos: TipoVehiculo[] }) {
  const [form, setForm] = useState<Formulario>(VACIO);
  const [filtros, setFiltros] = useState<Formulario>(VACIO);
  const [agrupar, setAgrupar] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [masFiltros, setMasFiltros] = useState(false);

  const consulta: FiltrosHistorial = {
    idParqueadero: sede.id_parqueadero,
    placa: filtros.placa || undefined,
    idTipo: filtros.idTipo ? Number(filtros.idTipo) : undefined,
    marca: filtros.marca || undefined,
    color: filtros.color || undefined,
    desde: filtros.desde || undefined,
    hasta: filtros.hasta || undefined,
    minutosMin: numero(filtros.horasMin) != null ? Math.round(numero(filtros.horasMin)! * 60) : undefined,
    minutosMax: numero(filtros.horasMax) != null ? Math.round(numero(filtros.horasMax)! * 60) : undefined,
    valorMin: numero(filtros.valorMin),
    valorMax: numero(filtros.valorMax),
    orden: filtros.orden,
  };

  const visitas = useConsulta(() => (agrupar ? Promise.resolve(null) : api.historial(consulta)), [sede.id_parqueadero, filtros, agrupar]);
  const porVehiculo = useConsulta(() => (agrupar ? api.historialPorVehiculo(consulta) : Promise.resolve(null)), [sede.id_parqueadero, filtros, agrupar]);
  const error = visitas.error ?? porVehiculo.error;

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const err =
      form.desde && form.hasta && form.desde > form.hasta
        ? "La fecha inicial debe ser anterior a la final"
        : [form.horasMin, form.horasMax].some((h) => h && !(Number(h.replace(",", ".")) >= 0))
          ? "Las horas deben ser un número, por ejemplo 1,5"
          : numero(form.horasMin) != null && numero(form.horasMax) != null && numero(form.horasMin)! > numero(form.horasMax)!
            ? "Las horas mínimas superan a las máximas"
            : numero(form.valorMin) != null && numero(form.valorMax) != null && numero(form.valorMin)! > numero(form.valorMax)!
              ? "El valor mínimo supera al máximo"
              : null;
    setErrorForm(err);
    if (!err) setFiltros(form);
  }

  function limpiar() {
    setForm(VACIO);
    setFiltros(VACIO);
    setErrorForm(null);
  }

  const activos = [
    filtros.placa,
    filtros.idTipo,
    filtros.marca,
    filtros.color,
    filtros.horasMin,
    filtros.horasMax,
    filtros.valorMin,
    filtros.valorMax,
  ].filter(Boolean).length;
  const marcas = form.idTipo ? MARCAS[Number(form.idTipo)] ?? [] : [...MARCAS[1], ...MARCAS[2].filter((m) => !MARCAS[1].includes(m))];
  const set = (c: Partial<Formulario>) => setForm({ ...form, ...c });

  const lista = visitas.datos ?? [];
  const grupos = porVehiculo.datos ?? [];
  const total = agrupar ? grupos.reduce((s, g) => s + g.valor_total, 0) : lista.reduce((s, r) => s + (r.valor_calculado ?? 0), 0);
  const minutosTotal = agrupar ? grupos.reduce((s, g) => s + g.minutos_total, 0) : lista.reduce((s, r) => s + (r.minutos ?? 0), 0);
  const cargado = agrupar ? porVehiculo.datos : visitas.datos;
  const filas = agrupar ? grupos.length : lista.length;

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Historial de salidas</h1>
          <p className="pagina-sub">{sede.nombre}</p>
        </div>
        <div className="conmutador" role="tablist" aria-label="Vista del historial">
          <button role="tab" aria-selected={!agrupar} onClick={() => setAgrupar(false)}>Por visita</button>
          <button role="tab" aria-selected={agrupar} onClick={() => setAgrupar(true)}>Por vehículo</button>
        </div>
      </header>

      <form className="filtros-historial" onSubmit={aplicar}>
        <div className="filtros">
          <label className="campo">
            <span className="campo-rotulo">Placa o código</span>
            <input value={form.placa} onChange={(e) => set({ placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="Todas" />
          </label>
          <div className="campo">
            <span className="campo-rotulo">Vehículo</span>
            <Selector
              etiqueta="Tipo de vehículo"
              valor={form.idTipo}
              opciones={[{ valor: "", texto: "Todos" }, ...tipos.map((t) => ({ valor: String(t.id_tipo), texto: nombreTipo(t.nombre) }))]}
              onChange={(v) => set({ idTipo: v, marca: v === "3" ? "" : form.marca })}
            />
          </div>
          <label className="campo">
            <span className="campo-rotulo">Desde</span>
            <input type="date" value={form.desde} onChange={(e) => set({ desde: e.target.value })} />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Hasta</span>
            <input type="date" value={form.hasta} onChange={(e) => set({ hasta: e.target.value })} />
          </label>
          <div className="campo">
            <span className="campo-rotulo">Ordenar por</span>
            <Selector
              etiqueta="Ordenar por"
              valor={form.orden}
              opciones={[
                { valor: "fecha", texto: "Más recientes" },
                { valor: "valor", texto: agrupar ? "Más dinero gastado" : "Mayor valor" },
                { valor: "tiempo", texto: agrupar ? "Más tiempo total" : "Más tiempo" },
              ]}
              onChange={(v) => set({ orden: v as Formulario["orden"] })}
            />
          </div>
        </div>

        <button type="button" className="enlace" aria-expanded={masFiltros} aria-controls="mas-filtros" onClick={() => setMasFiltros(!masFiltros)}>
          {masFiltros ? "Menos filtros" : "Más filtros: marca, color, horas y valor"}
          {activos > 0 && ` (${activos} ${activos === 1 ? "activo" : "activos"})`}
        </button>

        {masFiltros && (
          <div className="filtros" id="mas-filtros">
            <div className="campo">
              <span className="campo-rotulo">Marca</span>
              <Selector
                etiqueta="Marca"
                valor={form.marca}
                disabled={form.idTipo === "3"}
                opciones={[{ valor: "", texto: "Todas" }, ...marcas.map((m) => ({ valor: m, texto: m }))]}
                onChange={(v) => set({ marca: v })}
              />
            </div>
            <div className="campo">
              <span className="campo-rotulo">Color</span>
              <Selector
                etiqueta="Color"
                valor={form.color}
                opciones={[{ valor: "", texto: "Todos" }, ...COLORES.map((c) => ({ valor: c, texto: c }))]}
                onChange={(v) => set({ color: v })}
              />
            </div>
            <fieldset className="campo rango">
              <legend className="campo-rotulo">{agrupar ? "Horas en total" : "Horas de permanencia"}</legend>
              <div className="rango-campos">
                <input inputMode="decimal" aria-label="Horas mínimas" placeholder="Mín." value={form.horasMin} onChange={(e) => set({ horasMin: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })} />
                <span aria-hidden="true">a</span>
                <input inputMode="decimal" aria-label="Horas máximas" placeholder="Máx." value={form.horasMax} onChange={(e) => set({ horasMax: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })} />
              </div>
            </fieldset>
            <fieldset className="campo rango">
              <legend className="campo-rotulo">{agrupar ? "Dinero gastado ($)" : "Valor pagado ($)"}</legend>
              <div className="rango-campos">
                <input inputMode="numeric" aria-label="Valor mínimo" placeholder="Mín." value={form.valorMin} onChange={(e) => set({ valorMin: soloDigitos(e.target.value) })} />
                <span aria-hidden="true">a</span>
                <input inputMode="numeric" aria-label="Valor máximo" placeholder="Máx." value={form.valorMax} onChange={(e) => set({ valorMax: soloDigitos(e.target.value) })} />
              </div>
            </fieldset>
          </div>
        )}

        <div className="acciones-filtros">
          <button className="boton boton-primario">Filtrar</button>
          <button type="button" className="boton boton-texto" onClick={limpiar}>Limpiar filtros</button>
        </div>
      </form>

      {errorForm && <p className="alerta alerta-error" role="alert">{errorForm}</p>}
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}

      {cargado && filas > 0 && (
        <dl className="hoy resumen-historial" aria-label="Resumen de los resultados">
          <div><dt>{agrupar ? "Vehículos" : "Salidas"}</dt><dd>{filas}</dd></div>
          {agrupar && <div><dt>Visitas</dt><dd>{grupos.reduce((s, g) => s + g.visitas, 0)}</dd></div>}
          <div><dt>Tiempo total</dt><dd>{duracion(minutosTotal)}</dd></div>
          <div><dt>Valor total</dt><dd>{pesos(total)}</dd></div>
        </dl>
      )}

      {cargado && filas === 0 ? (
        <div className="vacio"><p>No hay salidas con estos filtros. Amplíe el rango de fechas o quite algún filtro.</p></div>
      ) : agrupar ? (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Placa</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Dueño</th>
                <th scope="col" className="num">Visitas</th>
                <th scope="col">Tiempo total</th>
                <th scope="col">Última salida</th>
                <th scope="col" className="num">Dinero gastado</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.placa}>
                  <td><Placa placa={g.placa} /></td>
                  <td>
                    {nombreTipo(g.tipo)}
                    <span className="celda-sub tenue">{[g.marca, g.color].filter(Boolean).join(", ")}</span>
                  </td>
                  <td>{g.cliente ?? <span className="tenue">Visitante</span>}</td>
                  <td className="num">{g.visitas}</td>
                  <td>{duracion(g.minutos_total)}</td>
                  <td>{fechaCorta(g.ultima_salida)}</td>
                  <td className="num">{pesos(g.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Placa</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Espacio</th>
                <th scope="col">Ingreso</th>
                <th scope="col">Salida</th>
                <th scope="col">Permanencia</th>
                <th scope="col" className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id_registro}>
                  <td><Placa placa={r.placa} /></td>
                  <td>
                    {nombreTipo(r.tipo)}
                    <span className="celda-sub tenue">{[r.marca, r.color].filter(Boolean).join(", ")}</span>
                  </td>
                  <td className="codigo">{r.codigo_espacio}</td>
                  <td>{fechaCorta(r.fecha_ingreso)}</td>
                  <td>{fechaCorta(r.fecha_salida)}</td>
                  <td>{duracion(r.minutos)}</td>
                  <td className="num">{pesos(r.valor_calculado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
