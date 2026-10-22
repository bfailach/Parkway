/**
 * Convierte la lista de espacios de una sede en posiciones 3D.
 *
 * El parqueadero se arma con carriles paralelos al eje X, cada uno con una
 * fila de plazas a cada lado. Las plazas se reparten en filas de largo
 * parecido, en orden: automóviles, motocicletas y bicicletas. Una sede
 * pequeña queda en un solo carril; una grande suma carriles hacia el norte
 * (-z), unidos por una vía de circulación en el extremo oeste, donde está
 * la entrada. Así el plano crece con los espacios que tenga cada sede.
 */
export type EstadoEspacio = "LIBRE" | "RESERVADO" | "OCUPADO" | "FUERA_DE_SERVICIO";

export interface EspacioPlano {
  id_espacio: number;
  codigo: string;
  estado: EstadoEspacio;
  id_tipo: number;
  tipo: string;
  placa?: string | null;
  fecha_ingreso?: string | null;
  id_registro?: number | null;
  marca?: string | null;
  color?: string | null;
}

export interface Plaza extends EspacioPlano {
  x: number;
  z: number;
  ancho: number;
  fondo: number;
  /** 1 = fila norte del carril (los vehículos miran hacia -z), -1 = fila sur. */
  fila: 1 | -1;
  /** Carril al que pertenece (0 = el de la entrada). */
  carril: number;
}

export const MEDIDAS: Record<string, { ancho: number; fondo: number }> = {
  AUTOMOVIL: { ancho: 2.7, fondo: 5.2 },
  MOTOCICLETA: { ancho: 1.4, fondo: 2.6 },
  BICICLETA: { ancho: 1.0, fondo: 2.2 },
};

export const MEDIO_CARRIL = 3.6;
/** Distancia entre los centros de dos carriles: dos filas de carros y una isla. */
export const PASO_CARRIL = 2 * (MEDIO_CARRIL + MEDIDAS.AUTOMOVIL.fondo) + 1.2;
/** Largo máximo de una fila antes de abrir otra (unas 20 plazas de carro). */
const LARGO_MAXIMO_FILA = 56;

export interface Distribucion {
  plazas: Plaza[];
  minX: number;
  maxX: number;
  largo: number;
  /** Centro de cada carril en z (el primero es 0). */
  carriles: number[];
  /** Límites del lote en z. */
  zNorte: number;
  zSur: number;
  /** Posición de la barrera de entrada. */
  barreraX: number;
}

const medida = (e: EspacioPlano) => MEDIDAS[e.tipo] ?? MEDIDAS.AUTOMOVIL;

export function distribuir(espacios: EspacioPlano[]): Distribucion {
  const orden = ["AUTOMOVIL", "MOTOCICLETA", "BICICLETA"];
  const lista = [...espacios].sort((a, b) => {
    const t = (orden.indexOf(a.tipo) + 4) % 4 - (orden.indexOf(b.tipo) + 4) % 4;
    return t || a.codigo.localeCompare(b.codigo, "es", { numeric: true });
  });

  const total = lista.reduce((s, e) => s + medida(e).ancho, 0);
  // Siempre un número par de filas (dos por carril).
  let filasN = Math.max(2, Math.ceil(total / LARGO_MAXIMO_FILA));
  if (filasN % 2) filasN += 1;
  const objetivo = total / filasN;

  // Reparto en filas de largo parecido, sin pasar del objetivo.
  const filas: EspacioPlano[][] = Array.from({ length: filasN }, () => []);
  let f = 0;
  let largoFila = 0;
  lista.forEach((e) => {
    const w = medida(e).ancho;
    if (f < filasN - 1 && largoFila > 0 && largoFila + w > objetivo + 0.01) {
      f += 1;
      largoFila = 0;
    }
    filas[f].push(e);
    largoFila += w;
  });

  const largoDe = (fila: EspacioPlano[]) => fila.reduce((s, e) => s + medida(e).ancho, 0);
  const largo = Math.max(10, ...filas.map(largoDe));
  const minX = -largo / 2;
  const carriles = Array.from({ length: filasN / 2 }, (_, i) => -i * PASO_CARRIL);

  const plazas: Plaza[] = [];
  filas.forEach((fila, i) => {
    const carril = Math.floor(i / 2);
    const lado: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const zc = carriles[carril];
    let x = minX;
    fila.forEach((e) => {
      const m = medida(e);
      plazas.push({ ...e, x: x + m.ancho / 2, z: zc - lado * (MEDIO_CARRIL + m.fondo / 2), ancho: m.ancho, fondo: m.fondo, fila: lado, carril });
      x += m.ancho;
    });
  });

  const fondoMax = MEDIDAS.AUTOMOVIL.fondo;
  return {
    plazas,
    minX,
    maxX: minX + largo,
    largo,
    carriles,
    zNorte: carriles[carriles.length - 1] - MEDIO_CARRIL - fondoMax - 1.5,
    zSur: MEDIO_CARRIL + fondoMax + 1.5,
    barreraX: minX - 3.5,
  };
}

/** Color de carrocería estable para cada espacio sin color registrado. */
const COLORES = ["#e9ecef", "#9aa3ad", "#2b3138", "#b3202a", "#1f4e8c", "#c7c9cc", "#5a6470", "#e8e1d4", "#0f5e4a", "#f2c230"];
export function colorVehiculo(semilla: number) {
  return COLORES[(Math.abs(semilla) * 7919) % COLORES.length];
}
