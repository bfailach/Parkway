import { useEffect, useRef, useState } from "react";
import { api, EstadoCliente, PreferenciasNotificacion } from "../lib/api";
import { calcularCobro } from "../lib/tarifa";
import { duracion, pesos } from "../lib/formato";

/**
 * Avisos del cliente: tiempo y valor acumulado de su vehículo, aviso al
 * pasar un monto, aviso antes de que venza la reserva y aviso al entrar o
 * salir. Cada aviso aparece en la página y, si el cliente lo autorizó y la
 * pestaña no está a la vista, también como notificación del navegador.
 * La configuración la guarda el cliente en "Notificaciones".
 */
export const EVENTO_PREFERENCIAS = "parkway:preferencias";
export const EVENTO_AVISO = "parkway:aviso";

interface Aviso {
  id: number;
  titulo: string;
  texto: string;
}

let siguienteId = 1;

/** Muestra un aviso desde cualquier parte de la aplicación. */
export function avisar(titulo: string, texto: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_AVISO, { detail: { titulo, texto } }));
}

function notificarNavegador(titulo: string, texto: string, prefs: PreferenciasNotificacion | null) {
  if (!prefs?.navegador || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // con la pestaña a la vista basta el aviso en la página
  try {
    new Notification(titulo, { body: texto, icon: "/favicon.svg", tag: titulo });
  } catch {
    /* algunos navegadores solo permiten notificaciones desde un service worker */
  }
}

export function Notificador() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const prefs = useRef<PreferenciasNotificacion | null>(null);
  const memoria = useRef({
    iniciado: false,
    dentro: new Map<number, string>(), // id_registro -> placa
    tramo: new Map<number, number>(), // id_registro -> último tramo avisado
    monto: new Set<number>(),
    reservas: new Set<number>(),
  });

  // Cola de avisos en la página
  useEffect(() => {
    const alAvisar = (e: Event) => {
      const { titulo, texto } = (e as CustomEvent<{ titulo: string; texto: string }>).detail;
      const id = siguienteId++;
      setAvisos((a) => [...a.slice(-3), { id, titulo, texto }]);
      window.setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 9000);
      notificarNavegador(titulo, texto, prefs.current);
    };
    window.addEventListener(EVENTO_AVISO, alAvisar);
    return () => window.removeEventListener(EVENTO_AVISO, alAvisar);
  }, []);

  // Preferencias
  useEffect(() => {
    api.cliente.preferencias().then((p) => (prefs.current = p)).catch(() => {});
    const alCambiar = (e: Event) => (prefs.current = (e as CustomEvent<PreferenciasNotificacion>).detail);
    window.addEventListener(EVENTO_PREFERENCIAS, alCambiar);
    return () => window.removeEventListener(EVENTO_PREFERENCIAS, alCambiar);
  }, []);

  // Revisión periódica del estado del cliente
  useEffect(() => {
    let vivo = true;
    async function revisar() {
      let estado: EstadoCliente;
      try {
        estado = await api.cliente.estado();
      } catch {
        return;
      }
      if (!vivo) return;
      const p = prefs.current;
      const m = memoria.current;
      const ahora = Date.now();
      const activos = p?.activas !== false;

      // Entradas y salidas
      const actuales = new Map(estado.dentro.map((r) => [r.id_registro, r.placa]));
      if (m.iniciado && activos && p?.alEntrarSalir !== false) {
        estado.dentro.forEach((r) => {
          if (!m.dentro.has(r.id_registro)) avisar(`${r.placa} entró al parqueadero`, `Está en el espacio ${r.codigo_espacio} de ${r.sede}.`);
        });
        for (const [id, placa] of m.dentro) {
          if (actuales.has(id)) continue;
          const visita = (await api.cliente.historial().catch(() => [])).find((h) => h.id_registro === id);
          avisar(
            `${placa} salió del parqueadero`,
            visita ? `Estuvo ${duracion(visita.minutos)} y pagó ${pesos(visita.valor_calculado)}.` : "La salida ya está en tu historial."
          );
        }
      }
      m.dentro = actuales;

      // Tiempo y valor de cada vehículo dentro
      estado.dentro.forEach((r) => {
        const minutos = Math.max(1, Math.ceil((ahora - new Date(r.fecha_ingreso).getTime()) / 60000));
        const valor = r.valor_hora != null ? calcularCobro(minutos, r).total : null;
        const cada = p?.cadaMinutos ?? 30;
        if (cada > 0) {
          const tramo = Math.floor(minutos / cada);
          const anterior = m.tramo.get(r.id_registro);
          if (anterior === undefined) m.tramo.set(r.id_registro, tramo);
          else if (tramo > anterior) {
            m.tramo.set(r.id_registro, tramo);
            if (activos) avisar(`${r.placa}: ${duracion(minutos)}`, `Lleva ${duracion(minutos)} en ${r.sede}. Valor hasta ahora: ${pesos(valor)}.`);
          }
        }
        if (activos && p?.montoAviso && valor != null && valor >= p.montoAviso && !m.monto.has(r.id_registro)) {
          m.monto.add(r.id_registro);
          if (m.iniciado) avisar(`${r.placa} superó ${pesos(p.montoAviso)}`, `El valor acumulado es ${pesos(valor)} después de ${duracion(minutos)}.`);
        }
      });

      // Reservas a punto de vencer
      const antes = p?.minutosAntesReserva ?? 10;
      estado.reservas.forEach((rs) => {
        const restante = new Date(rs.fecha_fin).getTime() - ahora;
        if (activos && antes > 0 && restante > 0 && restante <= antes * 60000 && !m.reservas.has(rs.id_reserva)) {
          m.reservas.add(rs.id_reserva);
          avisar(`Tu reserva vence en ${Math.ceil(restante / 60000)} min`, `El espacio ${rs.codigo_espacio} de ${rs.sede} se libera a las ${new Date(rs.fecha_fin).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}.`);
        }
      });
      m.iniciado = true;
    }

    revisar();
    const id = window.setInterval(revisar, 20000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className="aviso">
          <div>
            <strong>{a.titulo}</strong>
            <p>{a.texto}</p>
          </div>
          <button type="button" className="aviso-cerrar" aria-label="Cerrar aviso" onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
