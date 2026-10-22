import { createContext, useContext } from "react";

/**
 * Paleta de la escena 3D. Imita una maqueta de presentación: superficies
 * mate de un solo tono, luz suave y sombras difusas. Hay una versión
 * oscura (estudio en penumbra) y una clara (estudio blanco).
 */
export interface PaletaEscena {
  claro: boolean;
  fondo: string;
  niebla: [number, number];
  suelo: string;
  lote: string;
  linea: string;
  lineaBrillo: number;
  muro: string;
  edificio: string;
  edificioAcento: string;
  cerro: string;
  arbol: string;
  tronco: string;
  vidrio: string;
  llanta: string;
  rin: string;
  interior: string;
  sombra: number;
  testigoBrillo: number;
  cieloArriba: string;
  cieloAbajo: string;
  luzAmbiente: number;
  luzSol: number;
  colorSol: string;
  entorno: number;
}

export const PALETA_OSCURA: PaletaEscena = {
  claro: false,
  fondo: "#090b0f",
  niebla: [70, 300],
  suelo: "#0f1216",
  lote: "#15181d",
  linea: "#cfd5dd",
  lineaBrillo: 0.18,
  muro: "#1c2027",
  edificio: "#171b21",
  edificioAcento: "#20252d",
  cerro: "#0d1219",
  arbol: "#1c3328",
  tronco: "#2a2f36",
  vidrio: "#0f151d",
  llanta: "#16181b",
  rin: "#b9c0c9",
  interior: "#121417",
  sombra: 0.75,
  testigoBrillo: 1.6,
  cieloArriba: "#8094bb",
  cieloAbajo: "#0b0c10",
  luzAmbiente: 0.55,
  luzSol: 1.1,
  colorSol: "#dfe8ff",
  entorno: 0.7,
};

export const PALETA_CLARA: PaletaEscena = {
  claro: true,
  fondo: "#e9edf2",
  niebla: [80, 320],
  suelo: "#e3e7ec",
  lote: "#d9dee5",
  linea: "#ffffff",
  lineaBrillo: 0.25,
  muro: "#c9d0d9",
  edificio: "#f4f6f8",
  edificioAcento: "#ffffff",
  cerro: "#cfd6df",
  arbol: "#9fc4a8",
  tronco: "#a0a7b0",
  vidrio: "#26303c",
  llanta: "#1d2024",
  rin: "#d4d9df",
  interior: "#2a2e33",
  sombra: 0.32,
  testigoBrillo: 0.9,
  cieloArriba: "#ffffff",
  cieloAbajo: "#b8c1cd",
  luzAmbiente: 0.95,
  luzSol: 2.1,
  colorSol: "#ffffff",
  entorno: 0.9,
};

export const TemaEscena = createContext<PaletaEscena>(PALETA_OSCURA);
export const usePaleta = () => useContext(TemaEscena);
