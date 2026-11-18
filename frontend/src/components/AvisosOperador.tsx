import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActividadPersonal, api, Parqueadero } from "../lib/api";
import { nombreTipo, pesos } from "../lib/formato";
import { escucharAvisos, useEnVivo } from "../lib/tiempoReal";
import { Dialogo } from "./Dialogo";

/**
 * Avisos al personal (operador y administrador) dentro de la plataforma.
 *
 * Cuando se confirma una operación en una de sus sedes, el servidor avisa por
 * WebSocket { tipo: "actividad", sede, operacion } sin datos personales, y
 * esta pantalla pide el detalle a la API con su sesión. Avisa:
 *   - ingresos con QR (se quedan en pantalla hasta cerrarlos),
 *   - ingresos y salidas registrados por otros,
 *   - reservas nuevas, canceladas y vencidas,
 *   - ocupación alta y sede llena por tipo de vehículo,
 *   - anulaciones de pago, cobros nuevos, correcciones de ingreso o de cobro,
 *     reclamos de clientes y espacios fuera de servicio.
 * Las acciones propias no se avisan. Si la conexión en tiempo real se cae, se
 * consulta cada 20 segundos, y al reconectar se recupera lo que llegó.
 */
type Categoria = "qr" | "movimientos" | "reservas" | "ocupacion" | "cobros";
type Preferencias = Record<Categoria, boolean> & { sonido: boolean };
type Destino = "activos" | "historial" | "reservas" | "disponibilidad";

const ETIQUETAS: Record<Categoria, [string, string]> = {
  qr: ["Ingresos con QR", "Cuando un cliente registra su propio ingreso escaneando el código de la sede."],
  movimientos: ["Ingresos y salidas de otros", "Los que registran los demás operadores de tus sedes."],
  reservas: ["Reservas", "Nuevas, canceladas y vencidas porque el cliente no llegó."],
  ocupacion: ["Ocupación alta y sede llena", "Cuando un tipo de vehículo pasa del 90 % o se queda sin cupos."],
  cobros: ["Cobros y espacios", "Pagos anulados, cobros corregidos, reclamos y espacios fuera de servicio."],
};

// ---------------------------------------------------------------------
// Preferencias (por usuario, en este navegador)
// ---------------------------------------------------------------------
const oyentesPrefs = new Set<() => void>();
const clavePrefs = (idUsuario: number) => `parkway.avisos.${idUsuario}`;
const prefsPorDefecto = (admin: boolean): Preferencias => ({
  qr: true,
  movimientos: !admin, // el administrador ve todas las sedes: por defecto, sin cada ingreso y salida
  reservas: true,
  ocupacion: true,
  cobros: true,
  sonido: true,
});
const cache = new Map<string, Preferencias>();

function leerPrefs(idUsuario: number, admin: boolean): Preferencias {
  const clave = clavePrefs(idUsuario);
  const guardadas = cache.get(clave);
  if (guardadas) return guardadas;
  let p = prefsPorDefecto(admin);
  try {
    p = { ...p, ...JSON.parse(localStorage.getItem(clave) ?? "{}") };
  } catch {
    /* almacenamiento no disponible */
  }
  cache.set(clave, p);
  return p;
}

function guardarPrefs(idUsuario: number, p: Preferencias) {
  cache.set(clavePrefs(idUsuario), p);
  try {
    localStorage.setItem(clavePrefs(idUsuario), JSON.stringify(p));
  } catch {
    /* almacenamiento no disponible */
  }
  oyentesPrefs.forEach((f) => f());
}

function usePrefs(idUsuario: number, admin: boolean) {
  return useSyncExternalStore(
    (f) => {
      oyentesPrefs.add(f);
      return () => oyentesPrefs.delete(f);
    },
    () => leerPrefs(idUsuario, admin)
  );
}

// ---------------------------------------------------------------------
// Texto de cada aviso
// ---------------------------------------------------------------------
interface Aviso {
  id: string;
  idSede: number;
  titulo: string;
  texto: string;
  importante: boolean; // se queda hasta que lo cierren
  ver?: Destino;
}

const quien = (a: ActividadPersonal) => a.actor ?? "Alguien";
const hora = (f: string) => new Date(f).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
const TIPOS: Record<string, string> = { AUTOMOVIL: "automóviles", MOTOCICLETA: "motocicletas", BICICLETA: "bicicletas" };

function categoria(a: ActividadPersonal): Categoria | null {
  if ((a.operacion === "INGRESO" && a.origen === "QR") || a.operacion === "ANULAR_INGRESO") return "qr";
  if (a.operacion === "INGRESO" || a.operacion === "SALIDA" || a.operacion === "CORREGIR_INGRESO") return "movimientos";
  if (["RESERVA", "CANCELAR_RESERVA", "EXPIRACION"].includes(a.operacion)) return "reservas";
  if (["ANULAR_PAGO", "COBRO_NUEVO", "ESTADO_ESPACIO", "CORREGIR_COBRO", "RECLAMO", "RESPONDER_RECLAMO"].includes(a.operacion)) return "cobros";
  return null;
}

function redactar(a: ActividadPersonal, sede: string, idSede: number): Aviso | null {
  const base = { id: `t${a.id}`, idSede };
  const placa = a.placa ?? "";
  switch (a.operacion) {
    case "INGRESO":
      return a.origen === "QR"
        ? {
            ...base,
            titulo: `Ingreso con QR · ${placa}`,
            texto: `${quien(a)} entró con el QR a ${sede}: ${[a.tipo ? nombreTipo(a.tipo).toLowerCase() : null, a.marca, a.color?.toLowerCase()].filter(Boolean).join(", ")}, espacio ${a.espacio} (${hora(a.fecha)}). Verifique el vehículo.`,
            importante: true,
            ver: "activos",
          }
        : { ...base, titulo: `Ingreso · ${placa}`, texto: `${quien(a)} lo registró en ${sede}, espacio ${a.espacio}.`, importante: false, ver: "activos" };
    case "ANULAR_INGRESO":
      return { ...base, titulo: `Ingreso con QR anulado · ${placa}`, texto: `${quien(a)} lo anuló en ${sede}${a.motivo ? `: ${a.motivo}` : "."} El espacio ${a.espacio} quedó libre.`, importante: false, ver: "historial" };
    case "SALIDA":
      return { ...base, titulo: `Salida · ${placa}`, texto: `${quien(a)} registró la salida en ${sede}${a.valor != null ? `. Cobro: ${pesos(a.valor)}` : ""}.`, importante: false, ver: "historial" };
    case "RESERVA":
      return { ...base, titulo: `Nueva reserva · ${placa}`, texto: `${quien(a)} reservó el espacio ${a.espacio} en ${sede}.`, importante: false, ver: "reservas" };
    case "CANCELAR_RESERVA":
      return { ...base, titulo: `Reserva cancelada · ${placa}`, texto: `El espacio ${a.espacio} de ${sede} quedó libre.`, importante: false, ver: "reservas" };
    case "EXPIRACION":
      return { ...base, titulo: `Reserva vencida · ${placa}`, texto: `El cliente no llegó a tiempo; el espacio ${a.espacio} de ${sede} quedó libre.`, importante: false, ver: "reservas" };
    case "ANULAR_PAGO":
      return { ...base, titulo: `Pago anulado · ${placa}`, texto: `${quien(a)} anuló un pago${a.valor != null ? ` de ${pesos(a.valor)}` : ""} en ${sede}${a.motivo ? `: ${a.motivo}` : "."}`, importante: true, ver: "historial" };
    case "COBRO_NUEVO":
      return { ...base, titulo: `Nuevo cobro · ${placa}`, texto: `${quien(a)} registró de nuevo el cobro de una visita en ${sede}.`, importante: false, ver: "historial" };
    case "CORREGIR_INGRESO":
      return {
        ...base,
        titulo: `Ingreso corregido · ${placa}`,
        texto: `${quien(a)} lo corrigió en ${sede}: antes ${a.placa_anterior !== placa ? `${a.placa_anterior}, ` : ""}${a.tipo_anterior}. Ahora en el espacio ${a.espacio}${a.motivo ? ` (${a.motivo})` : ""}.`,
        importante: false,
        ver: "activos",
      };
    case "CORREGIR_COBRO":
      return {
        ...base,
        titulo: `Cobro corregido · ${placa}`,
        texto: `${quien(a)} corrigió el cobro de una visita en ${sede}${a.devolucion ? `: devolución de ${pesos(a.devolucion)}` : ""}${a.motivo ? ` (${a.motivo})` : ""}.`,
        importante: true,
        ver: "historial",
      };
    case "RECLAMO":
      return { ...base, titulo: `Reclamo de un cliente · ${placa}`, texto: `${quien(a)} reportó un problema con el cobro en ${sede}${a.motivo ? `: “${a.motivo}”` : "."}`, importante: true, ver: "historial" };
    case "RESPONDER_RECLAMO":
      return { ...base, titulo: `Reclamo respondido · ${placa}`, texto: `${quien(a)} respondió el reclamo de una visita en ${sede}.`, importante: false, ver: "historial" };
    case "ESTADO_ESPACIO": {
      const fuera = a.estado_espacio === "FUERA_DE_SERVICIO";
      return { ...base, titulo: `Espacio ${a.espacio} ${fuera ? "fuera de servicio" : "habilitado"}`, texto: `${quien(a)} lo cambió en ${sede}.`, importante: fuera, ver: "disponibilidad" };
    }
    default:
      return null;
  }
}

function sonar() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.value = 880;
    vol.gain.setValueAtTime(0.08, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    /* sin audio disponible */
  }
}

function notificarNavegador(titulo: string, texto: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    new Notification(titulo, { body: texto, icon: "/favicon.svg", tag: titulo });
  } catch {
    /* algunos navegadores solo permiten notificaciones desde un service worker */
  }
}

// ---------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------
interface Props {
  idUsuario: number;
  admin: boolean;
  sedes: Parqueadero[];
  onVer: (idSede: number, vista: Destino) => void;
}

export function AvisosOperador({ idUsuario, admin, sedes, onVer }: Props) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const prefs = usePrefs(idUsuario, admin);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const enVivo = useEnVivo();
  const vistos = useRef(new Set<number>());
  const desde = useRef(new Map<number, string>()); // solo se avisa desde que se abrió la pantalla
  const ocupacion = useRef(new Map<string, "alta" | "llena">()); // "sede:tipo" -> último aviso dado
  const sedesRef = useRef(sedes);
  sedesRef.current = sedes;

  function mostrar(nuevos: Aviso[]) {
    if (!nuevos.length) return;
    setAvisos((a) => [...a.filter((x) => !nuevos.some((n) => n.id === x.id)), ...nuevos].slice(-5));
    for (const n of nuevos) {
      if (!n.importante) window.setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== n.id)), 10_000);
      notificarNavegador(n.titulo, n.texto);
    }
    if (prefsRef.current.sonido) sonar();
  }

  async function revisarActividad(idSede: number) {
    const sede = sedesRef.current.find((s) => s.id_parqueadero === idSede);
    if (!sede) return; // no es una sede de este usuario
    const inicio = desde.current.get(idSede) ?? new Date().toISOString();
    try {
      const lista = (await api.actividad(idSede, inicio)).filter((a) => !vistos.current.has(a.id)).reverse();
      if (!lista.length) return;
      lista.forEach((a) => vistos.current.add(a.id));
      desde.current.set(idSede, lista[lista.length - 1].fecha);
      const p = prefsRef.current;
      const textos = lista
        .filter((a) => {
          const c = categoria(a);
          return c !== null && p[c];
        })
        .map((a) => redactar(a, sede.nombre, idSede))
        .filter((x): x is Aviso => x !== null);
      // Si llegan muchos juntos, los importantes van uno por uno y el resto se resume.
      const importantes = textos.filter((t) => t.importante);
      const resto = textos.filter((t) => !t.importante);
      if (resto.length > 3) {
        mostrar([
          ...importantes,
          {
            id: `grupo${Date.now()}`,
            idSede,
            titulo: `${resto.length} movimientos en ${sede.nombre}`,
            texto: `${resto.slice(0, 3).map((t) => t.titulo).join(" · ")}…`,
            importante: false,
            ver: "activos",
          },
        ]);
      } else mostrar(textos);
    } catch {
      /* se reintenta con el siguiente aviso o la siguiente consulta */
    }
  }

  async function revisarOcupacion(idSede: number) {
    const sede = sedesRef.current.find((s) => s.id_parqueadero === idSede);
    if (!sede || !prefsRef.current.ocupacion) return;
    try {
      const r = await api.resumen(idSede);
      const nuevos: Aviso[] = [];
      for (const t of r.porTipo) {
        const operativos = t.total - t.fuera_de_servicio;
        if (operativos <= 0) continue;
        const clave = `${idSede}:${t.id_tipo}`;
        const usado = 1 - t.libres / operativos;
        const anterior = ocupacion.current.get(clave);
        const tipo = TIPOS[t.tipo] ?? t.tipo.toLowerCase();
        if (t.libres === 0) {
          if (anterior !== "llena") {
            ocupacion.current.set(clave, "llena");
            nuevos.push({ id: `lleno${clave}`, idSede, titulo: `${sede.nombre}: sin cupos para ${tipo}`, texto: `Los ${operativos} espacios de ${tipo} están ocupados o reservados.`, importante: true, ver: "disponibilidad" });
          }
        } else if (usado >= 0.9) {
          if (!anterior) {
            ocupacion.current.set(clave, "alta");
            nuevos.push({ id: `alta${clave}`, idSede, titulo: `${sede.nombre}: ocupación alta en ${tipo}`, texto: `Quedan ${t.libres} de ${operativos} espacios (${Math.round(usado * 100)} % ocupado).`, importante: false, ver: "disponibilidad" });
          } else if (anterior === "llena") ocupacion.current.set(clave, "alta");
        } else if (usado < 0.85) {
          ocupacion.current.delete(clave); // vuelve a avisar si sube otra vez
        }
      }
      mostrar(nuevos);
    } catch {
      /* sin datos: se revisa en el siguiente aviso */
    }
  }

  // Marca de inicio por sede y estado inicial de ocupación (sin avisar lo que ya estaba).
  useEffect(() => {
    const ahora = new Date().toISOString();
    for (const s of sedes) {
      if (desde.current.has(s.id_parqueadero)) continue;
      desde.current.set(s.id_parqueadero, ahora);
      api
        .resumen(s.id_parqueadero)
        .then((r) => {
          for (const t of r.porTipo) {
            const operativos = t.total - t.fuera_de_servicio;
            if (operativos <= 0) continue;
            const usado = 1 - t.libres / operativos;
            if (t.libres === 0) ocupacion.current.set(`${s.id_parqueadero}:${t.id_tipo}`, "llena");
            else if (usado >= 0.9) ocupacion.current.set(`${s.id_parqueadero}:${t.id_tipo}`, "alta");
          }
        })
        .catch(() => undefined);
    }
  }, [sedes]);

  // Avisos en tiempo real.
  useEffect(
    () =>
      escucharAvisos((a) => {
        if (a.tipo === "actividad") {
          revisarActividad(a.sede);
          revisarOcupacion(a.sede);
        } else if (a.tipo === "reconectado") sedesRef.current.forEach((s) => revisarActividad(s.id_parqueadero));
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Respaldo sin conexión en tiempo real.
  useEffect(() => {
    if (enVivo) return;
    const t = window.setInterval(() => sedesRef.current.forEach((s) => revisarActividad(s.id_parqueadero)), 20_000);
    return () => window.clearInterval(t);
  }, [enVivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = (id: string) => setAvisos((a) => a.filter((x) => x.id !== id));

  return (
    <div className="avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        // Los importantes se anuncian de inmediato a los lectores de pantalla (role="alert").
        <div key={a.id} className={`aviso${a.importante ? " aviso-importante" : ""}`} role={a.importante ? "alert" : undefined}>
          <div>
            <strong>{a.titulo}</strong>
            <p>{a.texto}</p>
            {a.ver && (
              <button
                type="button"
                className="enlace aviso-ver"
                onClick={() => {
                  onVer(a.idSede, a.ver!);
                  cerrar(a.id);
                }}
              >
                Ver
              </button>
            )}
          </div>
          <button type="button" className="aviso-cerrar" aria-label="Cerrar aviso" onClick={() => cerrar(a.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Botón de la barra para elegir qué avisos recibe el personal. */
export function BotonAvisos({ idUsuario, admin }: { idUsuario: number; admin: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const prefs = usePrefs(idUsuario, admin);
  const cambiar = (k: keyof Preferencias, v: boolean) => guardarPrefs(idUsuario, { ...prefs, [k]: v });
  const [permiso, setPermiso] = useState(typeof Notification === "undefined" ? "no" : Notification.permission);
  return (
    <>
      <button type="button" className="boton-icono" aria-label="Avisos" title="Elegir avisos" onClick={() => setAbierto(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </button>
      <Dialogo abierto={abierto} titulo="Avisos" onCerrar={() => setAbierto(false)}>
        <p className="campo-ayuda">Elige qué movimientos de tus sedes quieres ver mientras usas Parkway. Tus propias acciones no se avisan.</p>
        <div className="formulario">
          {(Object.keys(ETIQUETAS) as Categoria[]).map((k) => (
            <label key={k} className="interruptor">
              <span className="interruptor-texto">
                <strong>{ETIQUETAS[k][0]}</strong>
                <span>{ETIQUETAS[k][1]}</span>
              </span>
              <input type="checkbox" role="switch" checked={prefs[k]} onChange={(e) => cambiar(k, e.target.checked)} />
              <span className="interruptor-pista" aria-hidden="true" />
            </label>
          ))}
          <label className="interruptor">
            <span className="interruptor-texto">
              <strong>Sonido</strong>
              <span>Un tono corto con cada aviso.</span>
            </span>
            <input type="checkbox" role="switch" checked={prefs.sonido} onChange={(e) => cambiar("sonido", e.target.checked)} />
            <span className="interruptor-pista" aria-hidden="true" />
          </label>
          {permiso === "default" && (
            <button type="button" className="boton boton-secundario" onClick={() => Notification.requestPermission().then(setPermiso)}>
              Recibir avisos aunque esté en otra pestaña
            </button>
          )}
        </div>
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-primario" onClick={() => setAbierto(false)}>
            Listo
          </button>
        </div>
      </Dialogo>
    </>
  );
}
