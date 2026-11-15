import { useCallback, useEffect, useRef, useState } from "react";
import { escucharAvisos, useEnVivo } from "./tiempoReal";

export interface OpcionesConsulta {
  /**
   * Sede cuyos cambios recargan la consulta. Sin sede, la recarga
   * cualquier cambio en cualquier sede.
   */
  sede?: number;
  /** false para consultas que no dependen de los espacios (por ejemplo, el horario). */
  tiempoReal?: boolean;
}

/** Con el tiempo real conectado, se consulta igual cada minuto por si se pierde un aviso. */
const RESPALDO_MS = 60_000;
/** Varios avisos seguidos producen una sola recarga. */
const ESPERA_AVISO_MS = 200;

/**
 * Ejecuta una consulta a la API y la mantiene al día (RF12).
 *
 * Si se indica `intervaloMs`, la consulta es "en vivo": se recarga cuando
 * el backend avisa por WebSocket que cambiaron los espacios de la sede.
 * Mientras el WebSocket no esté conectado, vuelve a consultar cada
 * `intervaloMs`, como respaldo.
 */
export function useConsulta<T>(fn: () => Promise<T>, deps: unknown[], intervaloMs?: number, opciones: OpcionesConsulta = {}) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const enVivo = useEnVivo();
  const escucha = !!intervaloMs && opciones.tiempoReal !== false;

  const recargar = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setDatos(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    setCargando(true);
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Avisos del WebSocket.
  useEffect(() => {
    if (!escucha) return;
    let temporizador: number | null = null;
    const quitar = escucharAvisos((aviso) => {
      if (aviso.tipo === "espacios" && opciones.sede !== undefined && aviso.sede !== opciones.sede) return;
      if (temporizador !== null) return;
      temporizador = window.setTimeout(() => {
        temporizador = null;
        recargar();
      }, ESPERA_AVISO_MS);
    });
    return () => {
      quitar();
      if (temporizador !== null) window.clearTimeout(temporizador);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escucha, opciones.sede, ...deps]);

  // Consulta periódica: de respaldo si hay tiempo real, normal si no.
  useEffect(() => {
    if (!intervaloMs) return;
    const cada = escucha && enVivo ? Math.max(intervaloMs, RESPALDO_MS) : intervaloMs;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") recargar();
    }, cada);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervaloMs, escucha, enVivo, ...deps]);

  return { datos, error, cargando, recargar };
}
