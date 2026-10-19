import * as THREE from "three";

/**
 * Texturas generadas en un <canvas>: la placa amarilla de Bogotá y las
 * ventanas iluminadas de los edificios. No se descargan imágenes.
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

/** Fachada con ventanas: algunas encendidas en tonos cálidos, otras apagadas. */
export function texturaFachada(semilla: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0d11";
  g.fillRect(0, 0, 128, 256);
  let s = semilla * 9301 + 49297;
  const azar = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let y = 8; y < 256; y += 16) {
    for (let x = 6; x < 128; x += 14) {
      const r = azar();
      if (r < 0.32) {
        g.fillStyle = r < 0.08 ? "#9fd3ff" : r < 0.2 ? "#ffcf86" : "#ffb35c";
        g.globalAlpha = 0.55 + azar() * 0.45;
        g.fillRect(x, y, 8, 9);
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
