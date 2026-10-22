/**
 * Siluetas de los vehículos por marca.
 *
 * Cada carro se dibuja con el contorno lateral del modelo más conocido de
 * su marca, al estilo de los íconos de carros de las apps de transporte:
 * formas suaves, vidrios oscuros y sin detalles sobrantes.
 *
 * Coordenadas del perfil: [z, y] en metros, con el frente en +z.
 * - perfil: borde superior de la carrocería, del bómper delantero al trasero.
 * - cabina: polígono de la cabina (delante abajo, delante arriba, atrás
 *   arriba, atrás abajo). Los vidrios se calculan a partir de ella.
 */
export interface ModeloCarro {
  id: string;
  nombre: string;
  ancho: number;
  radioRueda: number;
  ejeDelantero: number;
  ejeTrasero: number;
  /** Altura del piso de la carrocería. */
  piso: number;
  perfil: [number, number][];
  cabina: [number, number][] | null;
  /** La cabina se suaviza (techos redondos, como el del Escarabajo). */
  cabinaCurva?: boolean;
  faros: "rectos" | "redondos";
  alturaFaros: number;
  alturaStops: number;
  extras?: ("aleron" | "repuesto" | "barras" | "descapotable" | "stopsRedondos")[];
}

export const MODELOS_CARRO: Record<string, ModeloCarro> = {
  sedan: {
    id: "sedan",
    nombre: "Toyota Corolla",
    ancho: 1.78,
    radioRueda: 0.32,
    ejeDelantero: 1.38,
    ejeTrasero: -1.3,
    piso: 0.26,
    perfil: [[2.28, 0.3], [2.33, 0.55], [2.24, 0.72], [1.85, 0.8], [0.9, 0.86], [-1.5, 0.9], [-2.12, 0.88], [-2.3, 0.7], [-2.28, 0.32]],
    cabina: [[0.98, 0.84], [0.05, 1.4], [-1.02, 1.4], [-1.62, 0.89]],
    faros: "rectos",
    alturaFaros: 0.66,
    alturaStops: 0.78,
  },
  hatch: {
    id: "hatch",
    nombre: "Kia Picanto",
    ancho: 1.6,
    radioRueda: 0.3,
    ejeDelantero: 1.15,
    ejeTrasero: -1.15,
    piso: 0.26,
    perfil: [[1.78, 0.3], [1.82, 0.55], [1.72, 0.74], [1.3, 0.84], [0.8, 0.9], [-1.55, 0.95], [-1.78, 0.86], [-1.8, 0.32]],
    cabina: [[0.86, 0.88], [0.12, 1.48], [-1.42, 1.48], [-1.74, 0.93]],
    faros: "rectos",
    alturaFaros: 0.7,
    alturaStops: 1.05,
  },
  muscle: {
    id: "muscle",
    nombre: "Chevrolet Camaro",
    ancho: 1.92,
    radioRueda: 0.36,
    ejeDelantero: 1.46,
    ejeTrasero: -1.38,
    piso: 0.26,
    perfil: [[2.36, 0.3], [2.38, 0.6], [2.3, 0.75], [1.6, 0.81], [0.55, 0.86], [-1.6, 0.92], [-2.2, 0.95], [-2.36, 0.78], [-2.33, 0.34]],
    cabina: [[0.62, 0.84], [-0.32, 1.22], [-1.18, 1.22], [-1.76, 0.9]],
    faros: "rectos",
    alturaFaros: 0.62,
    alturaStops: 0.8,
  },
  fastback: {
    id: "fastback",
    nombre: "Ford Mustang",
    ancho: 1.9,
    radioRueda: 0.36,
    ejeDelantero: 1.46,
    ejeTrasero: -1.36,
    piso: 0.26,
    perfil: [[2.36, 0.3], [2.37, 0.6], [2.28, 0.76], [1.5, 0.82], [0.5, 0.88], [-1.9, 0.9], [-2.3, 0.88], [-2.37, 0.66], [-2.33, 0.34]],
    cabina: [[0.56, 0.86], [-0.24, 1.27], [-0.86, 1.27], [-2.1, 0.9]],
    faros: "rectos",
    alturaFaros: 0.64,
    alturaStops: 0.74,
  },
  coupe: {
    id: "coupe",
    nombre: "Nissan GT-R",
    ancho: 1.9,
    radioRueda: 0.36,
    ejeDelantero: 1.42,
    ejeTrasero: -1.36,
    piso: 0.24,
    perfil: [[2.33, 0.3], [2.36, 0.58], [2.25, 0.76], [1.4, 0.84], [0.72, 0.9], [-1.6, 0.96], [-2.25, 0.98], [-2.35, 0.8], [-2.32, 0.34]],
    cabina: [[0.76, 0.88], [-0.05, 1.33], [-0.95, 1.33], [-1.76, 0.95]],
    faros: "rectos",
    alturaFaros: 0.66,
    alturaStops: 0.82,
    extras: ["aleron", "stopsRedondos"],
  },
  roadster: {
    id: "roadster",
    nombre: "Mazda MX-5",
    ancho: 1.73,
    radioRueda: 0.31,
    ejeDelantero: 1.18,
    ejeTrasero: -1.14,
    piso: 0.24,
    perfil: [[1.95, 0.3], [1.98, 0.5], [1.86, 0.66], [1.2, 0.74], [0.36, 0.8], [-1.2, 0.82], [-1.85, 0.8], [-1.98, 0.62], [-1.95, 0.32]],
    cabina: null,
    faros: "rectos",
    alturaFaros: 0.6,
    alturaStops: 0.7,
    extras: ["descapotable"],
  },
  escarabajo: {
    id: "escarabajo",
    nombre: "Volkswagen Escarabajo",
    ancho: 1.62,
    radioRueda: 0.33,
    ejeDelantero: 1.2,
    ejeTrasero: -1.2,
    piso: 0.3,
    perfil: [[1.95, 0.34], [2.0, 0.5], [1.84, 0.7], [1.32, 0.82], [0.76, 0.86], [-0.9, 0.92], [-1.6, 0.84], [-1.96, 0.62], [-1.95, 0.36]],
    cabina: [[0.82, 0.85], [0.18, 1.42], [-0.58, 1.5], [-1.4, 0.9]],
    cabinaCurva: true,
    faros: "redondos",
    alturaFaros: 0.74,
    alturaStops: 0.72,
  },
  r4: {
    id: "r4",
    nombre: "Renault 4",
    ancho: 1.52,
    radioRueda: 0.31,
    ejeDelantero: 1.2,
    ejeTrasero: -1.2,
    piso: 0.3,
    perfil: [[1.83, 0.32], [1.86, 0.62], [1.78, 0.76], [1.3, 0.8], [0.86, 0.84], [-1.8, 0.88], [-1.86, 0.84], [-1.85, 0.34]],
    cabina: [[0.9, 0.82], [0.52, 1.52], [-1.78, 1.52], [-1.84, 0.86]],
    faros: "redondos",
    alturaFaros: 0.66,
    alturaStops: 0.7,
  },
  todoterreno: {
    id: "todoterreno",
    nombre: "Suzuki Jimny",
    ancho: 1.65,
    radioRueda: 0.38,
    ejeDelantero: 1.14,
    ejeTrasero: -1.1,
    piso: 0.42,
    perfil: [[1.75, 0.44], [1.8, 0.78], [1.72, 0.92], [1.2, 0.96], [0.76, 0.98], [-1.74, 1.0], [-1.8, 0.96], [-1.8, 0.46]],
    cabina: [[0.82, 0.96], [0.56, 1.68], [-1.72, 1.68], [-1.78, 0.98]],
    faros: "redondos",
    alturaFaros: 0.84,
    alturaStops: 0.78,
    extras: ["repuesto"],
  },
  suv: {
    id: "suv",
    nombre: "Hyundai Tucson",
    ancho: 1.86,
    radioRueda: 0.37,
    ejeDelantero: 1.34,
    ejeTrasero: -1.34,
    piso: 0.36,
    perfil: [[2.22, 0.38], [2.26, 0.7], [2.15, 0.88], [1.6, 0.96], [0.96, 1.02], [-1.9, 1.08], [-2.2, 1.02], [-2.25, 0.75], [-2.22, 0.4]],
    cabina: [[1.02, 1.0], [0.25, 1.6], [-1.76, 1.6], [-2.12, 1.06]],
    faros: "rectos",
    alturaFaros: 0.86,
    alturaStops: 1.0,
    extras: ["barras"],
  },
};

/** Modelo más conocido de cada marca. */
const MARCA_A_MODELO: Record<string, string> = {
  chevrolet: "muscle",
  renault: "r4",
  mazda: "roadster",
  kia: "hatch",
  toyota: "sedan",
  nissan: "coupe",
  hyundai: "suv",
  volkswagen: "escarabajo",
  ford: "fastback",
  suzuki: "todoterreno",
};

export function modeloCarro(marca?: string | null): ModeloCarro {
  const clave = (marca ?? "").trim().toLowerCase();
  return MODELOS_CARRO[MARCA_A_MODELO[clave] ?? "sedan"];
}

export type ModeloMoto = "deportiva" | "naked" | "urbana";

const MARCA_A_MOTO: Record<string, ModeloMoto> = {
  yamaha: "deportiva", // YZF-R1
  suzuki: "deportiva", // GSX-R
  kawasaki: "deportiva", // Ninja
  honda: "naked", // CB
  bajaj: "naked", // Pulsar
  ktm: "naked", // Duke
  tvs: "naked", // Apache
  akt: "urbana",
  hero: "urbana", // Splendor
  victory: "urbana",
};

export function modeloMoto(marca?: string | null): ModeloMoto {
  return MARCA_A_MOTO[(marca ?? "").trim().toLowerCase()] ?? "naked";
}

/** Color del vehículo según el nombre guardado en la base de datos. */
const COLOR_POR_NOMBRE: Record<string, string> = {
  blanco: "#eef0f2",
  gris: "#8a9099",
  plata: "#c3c8ce",
  negro: "#24272c",
  rojo: "#c42a33",
  azul: "#2858a8",
  verde: "#2f6b4c",
  amarillo: "#efc22f",
  naranja: "#e4782d",
  "café": "#6e4c36",
  cafe: "#6e4c36",
  beige: "#d9caa9",
  vinotinto: "#6a1b2a",
};

export function colorDeNombre(nombre?: string | null): string | null {
  if (!nombre) return null;
  return COLOR_POR_NOMBRE[nombre.trim().toLowerCase()] ?? null;
}
