/**
 * Diagnóstico para revisar la app en un teléfono sin herramientas de
 * desarrollo. Con ?diagnostico en la dirección
 * (https://.../?diagnostico) aparece un panel con lo que soporta el
 * navegador y los errores que ocurrieron. En uso normal no hace nada visible.
 */
export const conDiagnostico = typeof window !== "undefined" && /[?&#]diagnostico\b/.test(window.location.search + window.location.hash);

const errores: string[] = [];
const oyentes = new Set<() => void>();

export function anotarError(origen: string, error: unknown) {
  const texto = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  errores.push(`${new Date().toLocaleTimeString("es-CO")} ${origen}: ${texto}`.slice(0, 300));
  oyentes.forEach((f) => f());
}

export function erroresAnotados() {
  return [...errores];
}

export function alCambiarErrores(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => anotarError("error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => anotarError("promesa", e.reason));
}

/** Información del navegador y de su soporte de 3D. */
export function datosDelNavegador() {
  const datos: Record<string, string> = {
    Navegador: navigator.userAgent,
    Pantalla: `${window.innerWidth} × ${window.innerHeight} px, densidad ${window.devicePixelRatio}`,
    "Ancho del contenido": `${document.documentElement.scrollWidth} px`,
    "Puntero táctil": String(window.matchMedia?.("(pointer: coarse)").matches),
    "App instalada": String(window.matchMedia?.("(display-mode: standalone)").matches),
  };
  try {
    const c = document.createElement("canvas");
    const gl2 = c.getContext("webgl2") as WebGL2RenderingContext | null;
    const gl = gl2 ?? (c.getContext("webgl") as WebGLRenderingContext | null);
    datos.WebGL = gl2 ? "WebGL2" : gl ? "Solo WebGL1" : "No disponible";
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      datos["Tarjeta gráfica"] = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      datos["Texturas flotantes"] = String(!!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")));
      datos["Tamaño máximo de textura"] = String(gl.getParameter(gl.MAX_TEXTURE_SIZE));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch (e) {
    datos.WebGL = `Error: ${(e as Error).message}`;
  }
  return datos;
}
