import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ejecuta una consulta a la API y la repite cada `intervaloMs` (si se indica)
 * para mantener la disponibilidad actualizada sin recargar la página.
 */
export function useConsulta<T>(fn: () => Promise<T>, deps: unknown[], intervaloMs?: number) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

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
    if (!intervaloMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") recargar();
    }, intervaloMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { datos, error, cargando, recargar };
}
