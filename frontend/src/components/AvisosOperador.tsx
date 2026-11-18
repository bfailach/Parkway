import { useEffect, useRef, useState } from "react";
import { api, IngresoQr, Parqueadero } from "../lib/api";
import { escucharAvisos, useEnVivo } from "../lib/tiempoReal";

/**
 * Avisos al personal de portería: cuando un cliente registra su ingreso con
 * el QR de una de sus sedes, aparece un aviso en la plataforma con la placa,
 * el espacio y el cliente, sin que el operador tenga que buscarlo.
 *
 * El WebSocket solo dice "hubo un ingreso con QR en la sede N"; los datos se
 * piden a la API con la sesión del operador. Si la conexión en tiempo real se
 * cae, se consulta cada 20 segundos, y al reconectar se recuperan los que
 * llegaron mientras tanto.
 */
interface Aviso {
  id: number;
  idSede: number;
  sede: string;
  ingreso: IngresoQr;
}

const TIPO: Record<string, string> = { AUTOMOVIL: "automóvil", MOTOCICLETA: "motocicleta", BICICLETA: "bicicleta" };

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
    new Notification(titulo, { body: texto, icon: "/favicon.svg" });
  } catch {
    /* algunos navegadores solo permiten notificaciones desde un service worker */
  }
}

export function AvisosOperador({ sedes, onVer }: { sedes: Parqueadero[]; onVer: (idSede: number) => void }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const enVivo = useEnVivo();
  const vistos = useRef(new Set<number>());
  // Solo se avisa lo que ocurre desde que se abrió la pantalla.
  const desde = useRef(new Map<number, string>());
  const sedesRef = useRef(sedes);
  sedesRef.current = sedes;

  async function revisar(idSede: number) {
    const sede = sedesRef.current.find((s) => s.id_parqueadero === idSede);
    if (!sede) return; // no es una sede de este operador
    const inicio = desde.current.get(idSede) ?? new Date().toISOString();
    try {
      const lista = await api.ingresosQr(idSede, inicio);
      const nuevos = lista.filter((i) => !vistos.current.has(i.id_registro)).reverse();
      if (!nuevos.length) return;
      nuevos.forEach((i) => vistos.current.add(i.id_registro));
      desde.current.set(idSede, nuevos[nuevos.length - 1].fecha);
      setAvisos((a) => [...a, ...nuevos.map((i) => ({ id: i.id_registro, idSede, sede: sede.nombre, ingreso: i }))].slice(-4));
      sonar();
      for (const i of nuevos) {
        notificarNavegador(`Ingreso con QR · ${i.placa}`, `${i.cliente ?? "Un cliente"} entró a ${sede.nombre}, espacio ${i.codigo_espacio}.`);
      }
    } catch {
      /* se reintenta con el siguiente aviso o la siguiente consulta */
    }
  }

  // Marca de inicio por sede.
  useEffect(() => {
    const ahora = new Date().toISOString();
    for (const s of sedes) if (!desde.current.has(s.id_parqueadero)) desde.current.set(s.id_parqueadero, ahora);
  }, [sedes]);

  // Avisos en tiempo real.
  useEffect(
    () =>
      escucharAvisos((a) => {
        if (a.tipo === "ingreso-qr") revisar(a.sede);
        else if (a.tipo === "reconectado") sedesRef.current.forEach((s) => revisar(s.id_parqueadero));
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Respaldo sin conexión en tiempo real.
  useEffect(() => {
    if (enVivo) return;
    const t = window.setInterval(() => sedesRef.current.forEach((s) => revisar(s.id_parqueadero)), 20_000);
    return () => window.clearInterval(t);
  }, [enVivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = (id: number) => setAvisos((a) => a.filter((x) => x.id !== id));

  return (
    <div className="avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className="aviso aviso-qr">
          <div>
            <strong>Ingreso con QR · {a.ingreso.placa}</strong>
            <p>
              {a.ingreso.cliente ?? "Un cliente"} entró con su {TIPO[a.ingreso.tipo] ?? a.ingreso.tipo.toLowerCase()} a {a.sede}. Espacio{" "}
              <b>{a.ingreso.codigo_espacio}</b> ·{" "}
              {new Date(a.ingreso.fecha).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}
            </p>
            <button
              type="button"
              className="enlace"
              onClick={() => {
                onVer(a.idSede);
                cerrar(a.id);
              }}
            >
              Ver en el parqueadero
            </button>
          </div>
          <button type="button" className="aviso-cerrar" aria-label="Cerrar aviso" onClick={() => cerrar(a.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
