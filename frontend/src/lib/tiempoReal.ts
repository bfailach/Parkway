import { useSyncExternalStore } from "react";

/**
 * Conexión WebSocket con el backend (RF12).
 *
 * Una sola conexión para toda la aplicación. El servidor envía
 * { tipo: "espacios", sede } cada vez que se confirma un cambio en los
 * espacios de una sede, y las pantallas vuelven a pedir sus datos. Si la
 * conexión se cae, se reintenta con espera creciente y, mientras tanto,
 * useConsulta vuelve a consultar cada pocos segundos.
 */
export type Aviso = { tipo: "espacios"; sede: number } | { tipo: "reconectado" };
type Oyente = (aviso: Aviso) => void;

const RUTA = "/api/tiempo-real";
const oyentes = new Set<Oyente>();
const observadores = new Set<() => void>();
let socket: WebSocket | null = null;
let conectado = false;
let espera = 1000;
let reintento: number | null = null;

function cambiarEstado(valor: boolean) {
  if (conectado === valor) return;
  conectado = valor;
  observadores.forEach((f) => f());
}

function emitir(aviso: Aviso) {
  oyentes.forEach((f) => f(aviso));
}

function conectar() {
  if (socket || typeof WebSocket === "undefined") return;
  const url = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${RUTA}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    programarReintento();
    return;
  }
  socket = ws;
  let huboConexion = false;

  ws.onopen = () => {
    huboConexion = true;
    espera = 1000;
    cambiarEstado(true);
  };
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(String(e.data));
      if (m.tipo === "espacios" && Number.isInteger(m.sede)) emitir({ tipo: "espacios", sede: m.sede });
      else if (m.tipo === "reconectado") emitir({ tipo: "reconectado" });
    } catch {
      // Mensaje no reconocido: se ignora.
    }
  };
  ws.onclose = () => {
    socket = null;
    cambiarEstado(false);
    // Lo que cambió mientras no había conexión se recupera al volver.
    if (huboConexion) emitir({ tipo: "reconectado" });
    programarReintento();
  };
}

function programarReintento() {
  if (reintento !== null || oyentes.size === 0) return;
  reintento = window.setTimeout(() => {
    reintento = null;
    conectar();
  }, espera);
  espera = Math.min(espera * 2, 30_000);
}

// Al volver a la pestaña o recuperar la red, se reconecta sin esperar.
if (typeof window !== "undefined") {
  const ahora = () => {
    if (socket || oyentes.size === 0) return;
    if (reintento !== null) window.clearTimeout(reintento);
    reintento = null;
    espera = 1000;
    conectar();
  };
  window.addEventListener("online", ahora);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && ahora());
}

/** Escucha los avisos. La conexión se abre con el primer oyente. */
export function escucharAvisos(f: Oyente): () => void {
  oyentes.add(f);
  conectar();
  return () => {
    oyentes.delete(f);
  };
}

/** true mientras la conexión en tiempo real está abierta. */
export function useEnVivo(): boolean {
  return useSyncExternalStore(
    (f) => {
      observadores.add(f);
      return () => observadores.delete(f);
    },
    () => conectado,
    () => false
  );
}
