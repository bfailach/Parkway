import { createContext, useContext } from "react";
import * as THREE from "three";
import { PaletaEscena, usePaleta } from "./tema";

/**
 * Materiales de la maqueta, compartidos entre todas las piezas.
 *
 * Cuando se filtra un piso en el plano 3D, los demás pisos se dibujan con
 * la versión "fantasma" de cada material: el mismo color, casi
 * transparente y sin sombras, para que el piso elegido se vea completo.
 */
export type NombreMaterial =
  | "baseArriba"
  | "baseLado"
  | "anden"
  | "asfalto"
  | "asfaltoRampa"
  | "concreto"
  | "concretoOscuro"
  | "linea"
  | "flecha"
  | "peligroNegro"
  | "peligroAmarillo"
  | "nucleo"
  | "vidrioNucleo"
  | "pasto"
  | "rojo"
  | "blanco"
  | "cono";

const OPACIDAD_FANTASMA = 0.12;
const cache = new Map<string, THREE.Material>();

function color(p: PaletaEscena, n: NombreMaterial) {
  switch (n) {
    case "rojo":
      return "#e2424f";
    case "blanco":
      return "#f4f4f2";
    case "cono":
      return "#ff7a1a";
    default:
      return p[n];
  }
}

export function materialEscena(p: PaletaEscena, n: NombreMaterial, fantasma = false): THREE.Material {
  const clave = `${p.claro ? "c" : "o"}-${n}-${fantasma ? "f" : "n"}`;
  let m = cache.get(clave);
  if (m) return m;
  const c = color(p, n);
  const rugosidad = n === "vidrioNucleo" ? 0.2 : n.startsWith("asfalto") ? 0.95 : 0.8;
  const estandar = new THREE.MeshStandardMaterial({ color: c, roughness: rugosidad, metalness: 0 });
  if (n === "linea" || n === "flecha") {
    estandar.emissive = new THREE.Color(c);
    estandar.emissiveIntensity = p.claro ? 0.12 : 0.3;
  }
  if (n === "vidrioNucleo" && !p.claro) {
    estandar.emissive = new THREE.Color(c);
    estandar.emissiveIntensity = 0.8;
  }
  if (fantasma) {
    estandar.transparent = true;
    estandar.opacity = OPACIDAD_FANTASMA;
    estandar.depthWrite = false;
  }
  m = estandar;
  cache.set(clave, m);
  return m;
}

/** Material único para los vehículos de los pisos atenuados. */
export function materialFantasmaVehiculo(p: PaletaEscena) {
  const clave = `${p.claro ? "c" : "o"}-vehiculo-f`;
  let m = cache.get(clave);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: p.claro ? "#8b929b" : "#9aa3ad",
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    cache.set(clave, m);
  }
  return m;
}

/** Contexto de cada piso: si está atenuado por el filtro de pisos. */
export const PisoContexto = createContext<{ fantasma: boolean }>({ fantasma: false });
export const usePiso = () => useContext(PisoContexto);

/** Material de la maqueta según el tema y el piso donde se usa. */
export function useMat(n: NombreMaterial) {
  const p = usePaleta();
  const { fantasma } = usePiso();
  return materialEscena(p, n, fantasma);
}

const texturasPeligro = new Map<boolean, THREE.CanvasTexture>();

/** Franjas diagonales amarillas y negras de las columnas. */
export function franjasPeligro(p: PaletaEscena) {
  const existente = texturasPeligro.get(p.claro);
  if (existente) return existente;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = p.peligroAmarillo;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = p.peligroNegro;
  for (let i = -64; i < 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 16, 64);
    g.lineTo(i + 80, 0);
    g.lineTo(i + 64, 0);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  texturasPeligro.set(p.claro, t);
  return t;
}

/** Material de las franjas de peligro (o concreto fantasma en pisos atenuados). */
export function materialPeligro(p: PaletaEscena, fantasma: boolean): THREE.Material {
  if (fantasma) return materialEscena(p, "concreto", true);
  const clave = `${p.claro ? "c" : "o"}-peligro`;
  let m = cache.get(clave);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: franjasPeligro(p), roughness: 0.7 });
    cache.set(clave, m);
  }
  return m;
}
