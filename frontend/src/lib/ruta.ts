import { useEffect, useState } from "react";

/**
 * Rutas por hash (#/, #/ingresar). Permite usar los botones de atrás y
 * adelante del navegador sin agregar una librería de enrutamiento.
 */
export type Ruta = "portada" | "ingresar" | "panel" | "qr";

const leer = (): Ruta => {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("ingresar")) return "ingresar";
  if (h.startsWith("panel")) return "panel";
  if (h.startsWith("qr/")) return "qr";
  return "portada";
};

export function useRuta(): [Ruta, (r: Ruta) => void] {
  const [ruta, setRuta] = useState<Ruta>(leer);
  useEffect(() => {
    const f = () => setRuta(leer());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const ir = (r: Ruta) => {
    const destino = r === "portada" ? "#/" : `#/${r}`;
    if (window.location.hash !== destino) window.location.hash = destino;
    else setRuta(r);
    window.scrollTo(0, 0);
  };
  return [ruta, ir];
}

/** Token del enlace de un QR de entrada (#/qr/<token>), si la ruta actual lo tiene. */
export function tokenDeQr(): string | null {
  const m = window.location.hash.match(/^#\/?qr\/([A-Za-z0-9_\-.]+)/);
  return m ? m[1] : null;
}
