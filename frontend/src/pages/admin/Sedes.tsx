import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, DatosSede, EspacioMapa, Horario, Operador, SedeAdmin, TipoVehiculo } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { NOMBRE_DIA, nombreTipo, pesos, pluralTipo, resumenHorario } from "../../lib/formato";
import { crearControl, soportaWebGL } from "../../three/control";
import { useApariencia } from "../../lib/apariencia";
import { MapaEspacios } from "../../components/MapaEspacios";

const Escena = lazy(() => import("../../three/Escena"));

/**
 * Administración de sedes (solo administrador).
 * Crear o editar una sede: nombre y ubicación, cantidad de espacios por
 * tipo de vehículo, tarifas, horario de atención, operadores con acceso y
 * espacios fuera de servicio. La vista previa 3D se arma con la cantidad
 * de espacios del formulario, igual que el plano real de la sede.
 */
export function Sedes({ tipos, onCambio }: { tipos: TipoVehiculo[]; onCambio: () => void }) {
  const sedes = useConsulta(() => api.admin.sedes(), []);
  const operadores = useConsulta(() => api.admin.operadores(), []);
  const [editando, setEditando] = useState<number | "nueva" | null>(null);

  if (editando !== null) {
    return (
      <EditorSede
        id={editando === "nueva" ? null : editando}
        tipos={tipos}
        operadores={operadores.datos ?? []}
        onSalir={(cambio) => {
          setEditando(null);
          if (cambio) {
            sedes.recargar();
            operadores.recargar();
            onCambio();
          }
        }}
      />
    );
  }

  const nombreOperador = (id: number) => operadores.datos?.find((o) => o.id_usuario === id)?.nombre ?? `#${id}`;

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Sedes</h1>
          <p className="pagina-sub">Crea sedes, define sus espacios, tarifas y horario, y elige qué operadores trabajan en cada una.</p>
        </div>
        <button className="boton boton-primario" onClick={() => setEditando("nueva")}>Nueva sede</button>
      </header>
      {sedes.error && <p className="alerta alerta-error" role="alert">{sedes.error}</p>}
      <ul className="sedes-lista">
        {(sedes.datos ?? []).map((s) => (
          <li key={s.id_parqueadero} className="sede-tarjeta">
            <div className="sede-tarjeta-cabeza">
              <div>
                <h2 className="bloque-titulo">{s.nombre}</h2>
                <p className="tenue">{s.direccion}, {s.ciudad}</p>
              </div>
              <button className="boton boton-secundario" onClick={() => setEditando(s.id_parqueadero)}>Editar</button>
            </div>
            <dl className="sede-datos">
              {tipos.map((t) =>
                s.espacios[t.id_tipo] ? (
                  <div key={t.id_tipo}>
                    <dt>{pluralTipo(t.nombre)}</dt>
                    <dd>{s.espacios[t.id_tipo]}</dd>
                  </div>
                ) : null
              )}
              <div><dt>Fuera de servicio</dt><dd>{s.fuera_de_servicio}</dd></div>
            </dl>
            <p className="sede-linea"><span className="tenue">Horario:</span> {resumenHorario(s.horarios)}</p>
            <p className="sede-linea">
              <span className="tenue">Tarifa automóvil:</span>{" "}
              {pesos(s.tarifas.find((t) => t.id_tipo === 1)?.valor_hora ?? null)} la hora
            </p>
            <p className="sede-linea">
              <span className="tenue">Operadores:</span>{" "}
              {s.operadores.length ? s.operadores.map(nombreOperador).join(", ") : "Ninguno asignado"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------
interface DiaForm {
  abierto: boolean;
  abre: string;
  cierra: string;
  medianoche: boolean;
}

interface Form {
  nombre: string;
  direccion: string;
  ciudad: string;
  latitud: string;
  longitud: string;
  espacios: Record<number, string>;
  tarifas: Record<number, { valor_hora: string; valor_fraccion: string; valor_dia: string }>;
  dias: Record<number, DiaForm>;
  operadores: number[];
}

const TARIFA_SUGERIDA: Record<number, { valor_hora: string; valor_fraccion: string; valor_dia: string }> = {
  1: { valor_hora: "4000", valor_fraccion: "1500", valor_dia: "30000" },
  2: { valor_hora: "2000", valor_fraccion: "800", valor_dia: "15000" },
  3: { valor_hora: "1000", valor_fraccion: "400", valor_dia: "6000" },
};
const DIAS = [1, 2, 3, 4, 5, 6, 7];

function formVacio(): Form {
  return {
    nombre: "",
    direccion: "",
    ciudad: "Bogotá",
    latitud: "",
    longitud: "",
    espacios: { 1: "20", 2: "6", 3: "4" },
    tarifas: { ...TARIFA_SUGERIDA },
    dias: Object.fromEntries(DIAS.map((d) => [d, { abierto: d <= 6, abre: "06:00", cierra: "22:00", medianoche: false }])),
    operadores: [],
  };
}

function formDe(s: SedeAdmin): Form {
  const f = formVacio();
  f.nombre = s.nombre;
  f.direccion = s.direccion ?? "";
  f.ciudad = s.ciudad ?? "Bogotá";
  f.latitud = s.latitud != null ? String(s.latitud) : "";
  f.longitud = s.longitud != null ? String(s.longitud) : "";
  f.espacios = { 1: String(s.espacios[1] ?? 0), 2: String(s.espacios[2] ?? 0), 3: String(s.espacios[3] ?? 0) };
  s.tarifas.forEach((t) => (f.tarifas[t.id_tipo] = { valor_hora: String(t.valor_hora), valor_fraccion: String(t.valor_fraccion), valor_dia: String(t.valor_dia) }));
  DIAS.forEach((d) => {
    const h = s.horarios.find((x) => x.dia === d);
    f.dias[d] = h
      ? { abierto: true, abre: h.abre, cierra: h.cierra === "24:00" ? "23:59" : h.cierra, medianoche: h.cierra === "24:00" }
      : { abierto: false, abre: "06:00", cierra: "22:00", medianoche: false };
  });
  f.operadores = s.operadores;
  return f;
}

function aDatos(f: Form): DatosSede {
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const espacios = { 1: Number(f.espacios[1] || 0), 2: Number(f.espacios[2] || 0), 3: Number(f.espacios[3] || 0) };
  return {
    nombre: f.nombre,
    direccion: f.direccion,
    ciudad: f.ciudad,
    latitud: n(f.latitud),
    longitud: n(f.longitud),
    espacios,
    tarifas: [1, 2, 3]
      .filter((t) => espacios[t as 1] > 0)
      .map((t) => ({
        idTipo: t,
        valor_hora: Number(f.tarifas[t]?.valor_hora || NaN),
        valor_fraccion: Number(f.tarifas[t]?.valor_fraccion || NaN),
        valor_dia: Number(f.tarifas[t]?.valor_dia || NaN),
      })),
    horarios: DIAS.filter((d) => f.dias[d].abierto).map<Horario>((d) => ({
      dia: d,
      abre: f.dias[d].abre,
      cierra: f.dias[d].medianoche ? "24:00" : f.dias[d].cierra,
    })),
    operadores: f.operadores,
  };
}

/** Plazas de vista previa a partir de las cantidades del formulario. */
function plazasDePrueba(f: Form, existentes: SedeAdmin["lista_espacios"]): EspacioMapa[] {
  const nombres: Record<number, string> = { 1: "AUTOMOVIL", 2: "MOTOCICLETA", 3: "BICICLETA" };
  const prefijo: Record<number, string> = { 1: "A", 2: "M", 3: "B" };
  const lista: EspacioMapa[] = [];
  [1, 2, 3].forEach((t) => {
    const n = Math.min(300, Math.max(0, Number(f.espacios[t] || 0)));
    const reales = (existentes ?? []).filter((e) => e.id_tipo === t);
    for (let i = 0; i < n; i++) {
      const real = reales[i];
      lista.push({
        id_espacio: real?.id_espacio ?? -(t * 1000 + i + 1),
        codigo: real?.codigo ?? `${prefijo[t]}-${String(i + 1).padStart(n > 99 ? 3 : 2, "0")}`,
        estado: real?.estado ?? "LIBRE",
        id_tipo: t,
        tipo: nombres[t],
        id_registro: null,
        placa: null,
        fecha_ingreso: null,
      });
    }
  });
  return lista;
}

function EditorSede({ id, tipos, operadores, onSalir }: { id: number | null; tipos: TipoVehiculo[]; operadores: Operador[]; onSalir: (cambio: boolean) => void }) {
  const [form, setForm] = useState<Form | null>(id === null ? formVacio() : null);
  const [sede, setSede] = useState<SedeAdmin | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambio, setCambio] = useState(false);
  const webgl = useMemo(soportaWebGL, []);
  const { plano2d } = useApariencia();
  const control = useRef(crearControl("panel"));

  async function cargar(idSede: number) {
    const s = await api.admin.sede(idSede);
    setSede(s);
    setForm(formDe(s));
  }

  useEffect(() => {
    if (id !== null) cargar(id).catch((e) => setMensaje({ tipo: "error", texto: e.message }));
  }, [id]);

  // La vista previa se actualiza un momento después de dejar de escribir.
  const [previa, setPrevia] = useState<EspacioMapa[]>([]);
  useEffect(() => {
    if (!form) return;
    const t = window.setTimeout(() => setPrevia(plazasDePrueba(form, sede?.lista_espacios)), 300);
    return () => window.clearTimeout(t);
  }, [form?.espacios, sede]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return <div className="pagina">{mensaje ? <p className="alerta alerta-error">{mensaje.texto}</p> : <p className="tenue">Cargando sede...</p>}</div>;
  const f = form;
  const set = (c: Partial<Form>) => setForm({ ...f, ...c });
  const err = (k: string) => errores[k];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    setMensaje(null);
    try {
      const datos = aDatos(f);
      const s = id === null ? await api.admin.crearSede(datos) : await api.admin.editarSede(id, datos);
      setSede(s);
      setForm(formDe(s));
      setCambio(true);
      setMensaje({ tipo: "ok", texto: id === null ? `Creamos ${s.nombre} con ${s.capacidad_total} espacios.` : "Guardamos los cambios de la sede." });
      if (id === null) onSalir(true);
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrores(ex.campos);
        setMensaje({ tipo: "error", texto: ex.message });
      } else setMensaje({ tipo: "error", texto: "No se pudo guardar la sede" });
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEspacio(e: EspacioMapa) {
    if (!sede || e.id_espacio < 0) return;
    if (e.estado === "OCUPADO" || e.estado === "RESERVADO") {
      setMensaje({ tipo: "error", texto: `El espacio ${e.codigo} está ${e.estado === "OCUPADO" ? "ocupado" : "reservado"}. Espere a que se libere.` });
      return;
    }
    try {
      await api.admin.estadoEspacio(e.id_espacio, e.estado === "FUERA_DE_SERVICIO" ? "LIBRE" : "FUERA_DE_SERVICIO");
      setCambio(true);
      await cargar(sede.id_parqueadero);
      setMensaje(null);
    } catch (ex) {
      setMensaje({ tipo: "error", texto: ex instanceof Error ? ex.message : "No se pudo cambiar el espacio" });
    }
  }

  const total = [1, 2, 3].reduce((s, t) => s + Number(f.espacios[t] || 0), 0);
  const listaEspacios: EspacioMapa[] = (sede?.lista_espacios ?? []).map((e) => ({ ...e, id_registro: null, placa: null, fecha_ingreso: null }));

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <button className="boton boton-texto boton-volver" onClick={() => onSalir(cambio)}>← Volver a las sedes</button>
          <h1 className="pagina-titulo">{id === null ? "Nueva sede" : f.nombre || "Editar sede"}</h1>
        </div>
      </header>

      <form className="editor-sede" onSubmit={guardar} noValidate>
        <div className="editor-columna">
          {mensaje && <p className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status">{mensaje.texto}</p>}

          <section className="panel-form" aria-labelledby="t-datos">
            <h2 className="bloque-titulo" id="t-datos">Datos y ubicación</h2>
            <label className="campo">
              <span className="campo-rotulo">Nombre</span>
              <input value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} maxLength={80} placeholder="Sede Usaquén" aria-invalid={!!err("nombre")} />
              {err("nombre") && <span className="campo-error">{err("nombre")}</span>}
            </label>
            <div className="fila-campos">
              <label className="campo">
                <span className="campo-rotulo">Dirección</span>
                <input value={f.direccion} onChange={(e) => set({ direccion: e.target.value })} maxLength={150} placeholder="Calle 119 # 6-20" aria-invalid={!!err("direccion")} />
                {err("direccion") && <span className="campo-error">{err("direccion")}</span>}
              </label>
              <label className="campo">
                <span className="campo-rotulo">Ciudad</span>
                <input value={f.ciudad} onChange={(e) => set({ ciudad: e.target.value })} maxLength={60} aria-invalid={!!err("ciudad")} />
                {err("ciudad") && <span className="campo-error">{err("ciudad")}</span>}
              </label>
            </div>
            <div className="fila-campos">
              <label className="campo">
                <span className="campo-rotulo">Latitud <span className="opcional">(opcional)</span></span>
                <input inputMode="decimal" value={f.latitud} onChange={(e) => set({ latitud: e.target.value.replace(/[^\d.,-]/g, "") })} placeholder="4.6951" aria-invalid={!!err("latitud")} />
                {err("latitud") && <span className="campo-error">{err("latitud")}</span>}
              </label>
              <label className="campo">
                <span className="campo-rotulo">Longitud <span className="opcional">(opcional)</span></span>
                <input inputMode="decimal" value={f.longitud} onChange={(e) => set({ longitud: e.target.value.replace(/[^\d.,-]/g, "") })} placeholder="-74.0318" aria-invalid={!!err("longitud")} />
                {err("longitud") && <span className="campo-error">{err("longitud")}</span>}
              </label>
            </div>
            <p className="campo-ayuda">
              En Google Maps, haga clic derecho sobre la sede y copie las coordenadas.
              {f.latitud && f.longitud && !err("latitud") && (
                <>
                  {" "}
                  <a className="enlace" href={`https://www.openstreetmap.org/?mlat=${f.latitud}&mlon=${f.longitud}#map=18/${f.latitud}/${f.longitud}`} target="_blank" rel="noreferrer">
                    Ver en el mapa
                  </a>
                </>
              )}
            </p>
          </section>

          <section className="panel-form" aria-labelledby="t-espacios">
            <h2 className="bloque-titulo" id="t-espacios">Espacios y tarifas</h2>
            {err("espacios") && <p className="campo-error">{err("espacios")}</p>}
            <div className="tabla-contenedor">
              <table className="tabla tabla-editor">
                <thead>
                  <tr>
                    <th scope="col">Vehículo</th>
                    <th scope="col">Espacios</th>
                    <th scope="col">Hora</th>
                    <th scope="col">15 min</th>
                    <th scope="col">Día</th>
                  </tr>
                </thead>
                <tbody>
                  {tipos.map((t) => {
                    const n = Number(f.espacios[t.id_tipo] || 0);
                    const tar = f.tarifas[t.id_tipo] ?? TARIFA_SUGERIDA[t.id_tipo];
                    const campoTarifa = (k: "valor_hora" | "valor_fraccion" | "valor_dia", etiqueta: string) => (
                      <td>
                        <input
                          inputMode="numeric"
                          aria-label={`${etiqueta} ${nombreTipo(t.nombre)}`}
                          value={tar[k]}
                          disabled={n === 0}
                          onChange={(e) => set({ tarifas: { ...f.tarifas, [t.id_tipo]: { ...tar, [k]: e.target.value.replace(/\D/g, "").slice(0, 7) } } })}
                          aria-invalid={!!err(`tarifas.${t.id_tipo}.${k}`)}
                          title={err(`tarifas.${t.id_tipo}.${k}`)}
                        />
                      </td>
                    );
                    return (
                      <tr key={t.id_tipo}>
                        <th scope="row">{pluralTipo(t.nombre)}</th>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={300}
                            aria-label={`Espacios de ${pluralTipo(t.nombre).toLowerCase()}`}
                            value={f.espacios[t.id_tipo]}
                            onChange={(e) => set({ espacios: { ...f.espacios, [t.id_tipo]: e.target.value.replace(/\D/g, "").slice(0, 3) } })}
                            aria-invalid={!!err(`espacios.${t.id_tipo}`)}
                          />
                        </td>
                        {campoTarifa("valor_hora", "Valor de la hora")}
                        {campoTarifa("valor_fraccion", "Valor de 15 minutos")}
                        {campoTarifa("valor_dia", "Valor del día")}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {Object.entries(errores)
              .filter(([k]) => k.startsWith("tarifas.") || k.startsWith("espacios."))
              .map(([k, v]) => (
                <p key={k} className="campo-error">
                  {nombreTipo(tipos.find((t) => t.id_tipo === Number(k.split(".")[1]))?.nombre ?? "")}: {v}
                </p>
              ))}
            <p className="campo-ayuda">
              {total} espacios en total. Al reducir la cantidad se quitan los espacios libres de número más alto que nunca se
              usaron; los que tienen historial se conservan.
            </p>
          </section>

          <section className="panel-form" aria-labelledby="t-horario">
            <h2 className="bloque-titulo" id="t-horario">Horario de atención</h2>
            <p className="campo-ayuda">Los clientes solo pueden reservar dentro de este horario.</p>
            <div className="atajos-horario">
              <button type="button" className="boton boton-secundario" onClick={() => set({ dias: Object.fromEntries(DIAS.map((d) => [d, { abierto: true, abre: "00:00", cierra: "23:59", medianoche: true }])) })}>
                24 horas, todos los días
              </button>
              <button type="button" className="boton boton-secundario" onClick={() => set({ dias: Object.fromEntries(DIAS.map((d) => [d, { abierto: d <= 6, abre: "06:00", cierra: "22:00", medianoche: false }])) })}>
                Lunes a sábado, 6:00 a 22:00
              </button>
            </div>
            {err("horarios") && <p className="campo-error">{err("horarios")}</p>}
            <ul className="horario-dias">
              {DIAS.map((d) => {
                const dia = f.dias[d];
                const cambiarDia = (c: Partial<DiaForm>) => set({ dias: { ...f.dias, [d]: { ...dia, ...c } } });
                return (
                  <li key={d} className={dia.abierto ? "" : "dia-cerrado"}>
                    <label className="dia-nombre">
                      <input type="checkbox" checked={dia.abierto} onChange={(e) => cambiarDia({ abierto: e.target.checked })} />
                      {NOMBRE_DIA[d]}
                    </label>
                    {dia.abierto ? (
                      <>
                        <input type="time" aria-label={`Abre el ${NOMBRE_DIA[d]}`} value={dia.abre} onChange={(e) => cambiarDia({ abre: e.target.value })} />
                        <span aria-hidden="true">a</span>
                        <input type="time" aria-label={`Cierra el ${NOMBRE_DIA[d]}`} value={dia.cierra} disabled={dia.medianoche} onChange={(e) => cambiarDia({ cierra: e.target.value })} />
                        <label className="dia-medianoche">
                          <input type="checkbox" checked={dia.medianoche} onChange={(e) => cambiarDia({ medianoche: e.target.checked })} />
                          hasta medianoche
                        </label>
                      </>
                    ) : (
                      <span className="tenue">Cerrado</span>
                    )}
                    {err(`horarios.${d}`) && <span className="campo-error">{err(`horarios.${d}`)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel-form" aria-labelledby="t-operadores">
            <h2 className="bloque-titulo" id="t-operadores">Operadores con acceso</h2>
            <p className="campo-ayuda">Solo estos operadores pueden registrar ingresos y salidas en la sede. El administrador tiene acceso a todas.</p>
            {err("operadores") && <p className="campo-error">{err("operadores")}</p>}
            <ul className="lista-operadores">
              {operadores.map((o) => (
                <li key={o.id_usuario}>
                  <label>
                    <input
                      type="checkbox"
                      checked={f.operadores.includes(o.id_usuario)}
                      onChange={(e) => set({ operadores: e.target.checked ? [...f.operadores, o.id_usuario] : f.operadores.filter((x) => x !== o.id_usuario) })}
                    />
                    <span>
                      <strong>{o.nombre}</strong>
                      <span className="tenue">{o.correo}{o.turno ? `, turno ${o.turno.toLowerCase()}` : ""}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <div className="acciones-form acciones-fijas">
            <button type="button" className="boton boton-texto" onClick={() => onSalir(cambio)}>Cancelar</button>
            <button className="boton boton-primario" disabled={guardando}>{guardando ? "Guardando..." : id === null ? "Crear sede" : "Guardar cambios"}</button>
          </div>
        </div>

        <aside className="editor-previa">
          <h2 className="bloque-titulo">Vista previa</h2>
          <p className="campo-ayuda">El plano 3D se arma con los espacios del formulario.</p>
          <div className="visor-3d visor-previa">
            {webgl && !plano2d && previa.length > 0 ? (
              <Suspense fallback={<div className="visor-cargando">Cargando vista previa...</div>}>
                <Escena className="visor-3d-lienzo" espacios={previa} control={control} />
              </Suspense>
            ) : previa.length > 0 ? (
              <MapaEspacios espacios={previa} />
            ) : (
              <div className="visor-cargando">Agregue espacios para ver el plano</div>
            )}
          </div>
          {sede && (
            <section className="fuera-servicio" aria-labelledby="t-fuera">
              <h3 className="bloque-titulo" id="t-fuera">Fuera de servicio</h3>
              <p className="campo-ayuda">Haga clic en un espacio para marcarlo fuera de servicio o habilitarlo de nuevo. Los ocupados y reservados no se pueden cambiar.</p>
              <MapaEspacios espacios={listaEspacios} onSeleccionar={alternarEspacio} />
            </section>
          )}
        </aside>
      </form>
    </div>
  );
}
