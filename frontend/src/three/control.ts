import { Plaza } from "./layout";

/**
 * Estado compartido entre la página y la escena 3D. Vive en un módulo
 * aparte, sin Three.js, para que la página cargue rápido y la escena se
 * descargue después en su propio archivo.
 */
export type ModoEscena = "portada" | "historia" | "vivo" | "panel";

export interface ControlEscena {
  modo: ModoEscena;
  /** Avance de la historia, de 0 a 1. */
  progreso: number;
  /** Posición del mouse normalizada, de -1 a 1. */
  raton: { x: number; y: number };
}

export const crearControl = (modo: ModoEscena): ControlEscena => ({ modo, progreso: 0, raton: { x: 0, y: 0 } });

/** Placa del carro que protagoniza la historia de la portada. */
export const PLACA_HISTORIA = "PKW026";

/** Plaza que el sistema asignaría ahora: el primer automóvil libre desde la entrada. */
export function plazaAsignada(plazas: Plaza[]): Plaza | undefined {
  const autos = plazas.filter((p) => p.tipo === "AUTOMOVIL").sort((a, b) => a.x - b.x);
  return autos.find((p) => p.estado === "LIBRE") ?? autos[Math.floor(autos.length / 2)];
}

export function soportaWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
