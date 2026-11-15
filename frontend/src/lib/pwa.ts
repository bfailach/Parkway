import { useSyncExternalStore } from "react";

/**
 * Aplicación instalable (PWA). Parkway se instala desde el navegador en
 * Android, iPhone y escritorio, y se abre a pantalla completa como una app.
 * Es el mismo frontend y el mismo servidor: no hay código para Android.
 */

/** Evento que Chrome dispara cuando la app se puede instalar. */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let eventoInstalar: EventoInstalar | null = null;
let instalada = typeof window !== "undefined" && esPantallaCompleta();
const observadores = new Set<() => void>();
const avisar = () => observadores.forEach((f) => f());

function esPantallaCompleta() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone y iPad no tienen botón de instalar: se agrega desde "Compartir". */
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

if (typeof window !== "undefined") {
  // Se escucha desde el arranque: Chrome lo dispara una sola vez, muy pronto.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    eventoInstalar = e as EventoInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    eventoInstalar = null;
    instalada = true;
    avisar();
  });
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
}

/** Registra el service worker. Solo en producción: en desarrollo interferiría con Vite. */
export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin service worker la aplicación funciona igual; solo no se puede instalar.
    });
  });
}

function suscribir(f: () => void) {
  observadores.add(f);
  return () => {
    observadores.delete(f);
  };
}

export interface EstadoInstalacion {
  /** Ya se abrió como app instalada. */
  instalada: boolean;
  /** El navegador ofrece instalarla con un clic (Chrome, Edge, Android). */
  disponible: boolean;
  /** iPhone o iPad: se muestran las instrucciones de "Agregar a inicio". */
  ios: boolean;
}

let instantanea: EstadoInstalacion = { instalada: false, disponible: false, ios: false };
function leer(): EstadoInstalacion {
  const nuevo = { instalada, disponible: !!eventoInstalar, ios: typeof navigator !== "undefined" && esIOS() };
  if (nuevo.instalada !== instantanea.instalada || nuevo.disponible !== instantanea.disponible || nuevo.ios !== instantanea.ios) {
    instantanea = nuevo;
  }
  return instantanea;
}

export function useInstalacion(): EstadoInstalacion {
  return useSyncExternalStore(suscribir, leer, () => instantanea);
}

/** Abre el diálogo de instalación del navegador. Devuelve true si el usuario aceptó. */
export async function instalar(): Promise<boolean> {
  if (!eventoInstalar) return false;
  const e = eventoInstalar;
  await e.prompt();
  const { outcome } = await e.userChoice;
  eventoInstalar = null;
  avisar();
  return outcome === "accepted";
}

/** false mientras el dispositivo no tiene internet. */
export function useEnLinea(): boolean {
  return useSyncExternalStore(suscribir, () => navigator.onLine, () => true);
}
