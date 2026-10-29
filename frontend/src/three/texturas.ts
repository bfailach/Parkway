import * as THREE from "three";

/**
 * Texturas generadas en un <canvas>: la placa amarilla de Bogotá y la
 * sombra difusa de los vehículos. No se descargan imágenes.
 */

const cachePlacas = new Map<string, THREE.CanvasTexture>();

export function texturaPlaca(placa: string): THREE.CanvasTexture {
  const clave = placa.toUpperCase();
  const existente = cachePlacas.get(clave);
  if (existente) return existente;

  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f5c518";
  g.fillRect(0, 0, 256, 128);
  g.lineWidth = 10;
  g.strokeStyle = "#111";
  g.strokeRect(5, 5, 246, 118);
  g.fillStyle = "#111";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const texto = clave.length === 6 ? `${clave.slice(0, 3)} ${clave.slice(3)}` : clave;
  let tam = 80;
  g.font = `800 ${tam}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
  while (g.measureText(texto).width > 222 && tam > 30) {
    tam -= 2;
    g.font = `800 ${tam}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
  }
  g.fillText(texto, 128, 56);
  g.font = `700 17px "Big Shoulders Display", "Arial Narrow", sans-serif`;
  g.fillText("B O G O T Á  D . C .", 128, 108);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cachePlacas.set(clave, t);
  return t;
}

let sombra: THREE.CanvasTexture | null = null;

/** Sombra difusa bajo cada vehículo (más liviana que calcular sombras reales). */
export function texturaSombra(): THREE.CanvasTexture {
  if (sombra) return sombra;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  sombra = new THREE.CanvasTexture(c);
  return sombra;
}
