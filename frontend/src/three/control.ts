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
  // Solo el carril de la entrada, que es el que recorre la historia.
  const autos = plazas.filter((p) => p.tipo === "AUTOMOVIL" && p.carril === 0).sort((a, b) => a.x - b.x);
  return autos.find((p) => p.estado === "LIBRE") ?? autos[Math.floor(autos.length / 2)];
}

export interface Capacidades3D {
  /** three.js necesita WebGL2: sin él no se dibuja la escena. */
  webgl2: boolean;
  /**
   * Texturas de punto flotante para los efectos (sombreado suave y brillo).
   * Firefox en muchos celulares Android ofrece WebGL2 sin ellas: ahí la
   * escena se dibuja sin efectos en lugar de quedar en negro.
   */
  efectos: boolean;
}

let capacidades: Capacidades3D | null = null;

/**
 * Qué puede dibujar el navegador. La prueba se hace una sola vez y el
 * contexto de prueba se libera: los navegadores admiten pocos contextos
 * WebGL a la vez y, si se acumulan, apagan los más antiguos.
 */
export function capacidades3D(): Capacidades3D {
  if (capacidades) return capacidades;
  capacidades = { webgl2: false, efectos: false };
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") as WebGL2RenderingContext | null;
    if (gl) {
      const flotante = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
      capacidades = { webgl2: true, efectos: flotante };
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // Sin WebGL: las páginas muestran el fondo sin maqueta.
  }
  return capacidades;
}

/** Indica si el navegador puede dibujar la escena 3D (necesita WebGL2). */
export function soportaWebGL() {
  return capacidades3D().webgl2;
}
