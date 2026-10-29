import { createContext, useContext } from "react";

/**
 * Paleta de la escena 3D. La sede se ve como una maqueta flotante sobre un
 * fondo liso, sin entorno: concreto claro, asfalto gris, líneas amarillas y
 * luz suave con sombras difusas. Hay una versión clara (por defecto en el
 * tema claro) y una oscura (maqueta de noche).
 */
export interface PaletaEscena {
  claro: boolean;
  fondo: string;
  /** Color del degradado del fondo, arriba y abajo. */
  fondoArriba: string;
  fondoAbajo: string;
  baseArriba: string;
  baseLado: string;
  anden: string;
  asfalto: string;
  asfaltoRampa: string;
  concreto: string;
  concretoOscuro: string;
  linea: string;
  flecha: string;
  peligroNegro: string;
  peligroAmarillo: string;
  nucleo: string;
  vidrioNucleo: string;
  pasto: string;
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
  intensidadSombra: number;
  entorno: number;
}

export const PALETA_CLARA: PaletaEscena = {
  claro: true,
  fondo: "#ebe7df",
  fondoArriba: "#f4f1eb",
  fondoAbajo: "#dcd6cb",
  baseArriba: "#cfc8ba",
  baseLado: "#b7b0a2",
  anden: "#cfc9bd",
  asfalto: "#5b6068",
  asfaltoRampa: "#62676f",
  concreto: "#cdcac4",
  concretoOscuro: "#aeaaa3",
  linea: "#f2c230",
  flecha: "#f7f7f5",
  peligroNegro: "#24262a",
  peligroAmarillo: "#f2c230",
  nucleo: "#f5f3ef",
  vidrioNucleo: "#3a4350",
  pasto: "#a3bf88",
  vidrio: "#26303c",
  llanta: "#1d2024",
  rin: "#d4d9df",
  interior: "#2a2e33",
  sombra: 0.32,
  testigoBrillo: 0.9,
  cieloArriba: "#ffffff",
  cieloAbajo: "#b9b1a2",
  luzAmbiente: 1.05,
  luzSol: 2.3,
  colorSol: "#fff3e0",
  intensidadSombra: 0.55,
  entorno: 0.9,
};

export const PALETA_OSCURA: PaletaEscena = {
  claro: false,
  fondo: "#0c0f14",
  fondoArriba: "#151a22",
  fondoAbajo: "#07090c",
  baseArriba: "#2b3038",
  baseLado: "#1a1d23",
  anden: "#33383f",
  asfalto: "#1f2329",
  asfaltoRampa: "#23272e",
  concreto: "#555a62",
  concretoOscuro: "#41454c",
  linea: "#d9ad2b",
  flecha: "#c9ced6",
  peligroNegro: "#141518",
  peligroAmarillo: "#d9ad2b",
  nucleo: "#8d939c",
  vidrioNucleo: "#ffd58a",
  pasto: "#2e5a35",
  vidrio: "#0f151d",
  llanta: "#16181b",
  rin: "#b9c0c9",
  interior: "#121417",
  sombra: 0.75,
  testigoBrillo: 1.6,
  cieloArriba: "#8094bb",
  cieloAbajo: "#0b0c10",
  luzAmbiente: 0.7,
  luzSol: 1.3,
  colorSol: "#dfe8ff",
  intensidadSombra: 0.7,
  entorno: 0.6,
};

export const TemaEscena = createContext<PaletaEscena>(PALETA_CLARA);
export const usePaleta = () => useContext(TemaEscena);
