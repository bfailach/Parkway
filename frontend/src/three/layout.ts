/**
 * Convierte la lista de espacios de una sede en posiciones 3D.
 *
 * Cada piso se arma con carriles paralelos al eje X, cada uno con una fila
 * de plazas a cada lado, en orden: automóviles, motocicletas y bicicletas.
 * Un piso pequeño queda en un carril; uno grande suma carriles hacia el
 * norte (-z). Al oeste corre la vía de circulación que une los carriles con
 * la entrada (al sur). Si la sede tiene varios pisos, una rampa en espiral
 * al suroeste los conecta: los carros la toman desde la vía de circulación
 * y salen al mismo punto un piso más arriba.
 *
 * Todos los pisos comparten la misma huella, que es la del piso más largo.
 */
export type EstadoEspacio = "LIBRE" | "RESERVADO" | "OCUPADO" | "FUERA_DE_SERVICIO";

export interface EspacioPlano {
  id_espacio: number;
  codigo: string;
  estado: EstadoEspacio;
  id_tipo: number;
  tipo: string;
  piso?: number | null;
  placa?: string | null;
  fecha_ingreso?: string | null;
  id_registro?: number | null;
  marca?: string | null;
  color?: string | null;
}

export interface Plaza extends EspacioPlano {
  piso: number;
  x: number;
  /** Altura del piso donde está la plaza. */
  y: number;
  z: number;
  ancho: number;
  fondo: number;
  /** 1 = fila norte del carril (los vehículos miran hacia -z), -1 = fila sur. */
  fila: 1 | -1;
  /** Carril al que pertenece dentro de su piso (0 = el más cercano a la entrada). */
  carril: number;
  /** Centro del carril en z. */
  zCarril: number;
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
/** Altura entre pisos y grosor de la losa. */
export const ALTURA_PISO = 3.6;
export const GROSOR_LOSA = 0.4;
/** Ancho de la vía de circulación del oeste. */
export const ANCHO_VIA = 8;
/** Rampa en espiral: radio del eje y ancho de la calzada. */
export const RADIO_RAMPA = 5.4;
export const ANCHO_RAMPA = 4;

export interface Rampa {
  cx: number;
  cz: number;
  radio: number;
  interior: number;
  exterior: number;
}

export interface Distribucion {
  plazas: Plaza[];
  pisos: number;
  minX: number;
  maxX: number;
  largo: number;
  /** Centro de cada carril en z (el primero es 0); comunes a todos los pisos. */
  carriles: number[];
  /** Límites de la zona de plazas en z. */
  zNorte: number;
  zSur: number;
  /** Losas: borde oeste y este, y borde sur del piso 1 y de los pisos altos. */
  x0: number;
  x1: number;
  zSurBajo: number;
  zSurAlto: number;
  /** Eje de la vía de circulación y sus dos sentidos. */
  viaX: number;
  viaEntra: number;
  viaSale: number;
  rampa: Rampa | null;
  barreraZ: number;
  /** Donde aparecen y desaparecen los vehículos (borde de la maqueta). */
  calleZ: number;
  /** Rectángulo de la base de la maqueta. */
  base: { x0: number; x1: number; z0: number; z1: number };
  /** Centro y tamaño para encuadrar la cámara. */
  centro: [number, number, number];
  extension: number;
  /** Para mantener compatibilidad con la historia de la portada. */
  barreraX: number;
}

const medida = (e: EspacioPlano) => MEDIDAS[e.tipo] ?? MEDIDAS.AUTOMOVIL;
export const alturaPiso = (piso: number) => (piso - 1) * ALTURA_PISO;
const ORDEN = ["AUTOMOVIL", "MOTOCICLETA", "BICICLETA"];

/** Reparte los espacios de un piso en filas de largo parecido. */
function filasDelPiso(espacios: EspacioPlano[]) {
  const lista = [...espacios].sort((a, b) => {
    const t = ((ORDEN.indexOf(a.tipo) + 4) % 4) - ((ORDEN.indexOf(b.tipo) + 4) % 4);
    return t || a.codigo.localeCompare(b.codigo, "es", { numeric: true });
  });
  const total = lista.reduce((s, e) => s + medida(e).ancho, 0);
  // Siempre un número par de filas (dos por carril).
  let filasN = Math.max(2, Math.ceil(total / LARGO_MAXIMO_FILA));
  if (filasN % 2) filasN += 1;
  const objetivo = total / filasN;
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
  return filas;
}

const largoDe = (fila: EspacioPlano[]) => fila.reduce((s, e) => s + medida(e).ancho, 0);

export function distribuir(espacios: EspacioPlano[]): Distribucion {
  const porPiso = new Map<number, EspacioPlano[]>();
  espacios.forEach((e) => {
    const p = Math.max(1, Number(e.piso) || 1);
    if (!porPiso.has(p)) porPiso.set(p, []);
    porPiso.get(p)!.push(e);
  });
  const pisos = Math.max(1, ...porPiso.keys());
  const filasPorPiso = new Map<number, EspacioPlano[][]>();
  for (let p = 1; p <= pisos; p++) filasPorPiso.set(p, filasDelPiso(porPiso.get(p) ?? []));

  const largo = Math.max(10, ...[...filasPorPiso.values()].flat().map(largoDe));
  const minX = -largo / 2;
  const maxX = minX + largo;
  const nCarriles = Math.max(1, ...[...filasPorPiso.values()].map((f) => f.length / 2));
  const carriles = Array.from({ length: nCarriles }, (_, i) => -i * PASO_CARRIL);

  const plazas: Plaza[] = [];
  filasPorPiso.forEach((filas, piso) => {
    filas.forEach((fila, i) => {
      const carril = Math.floor(i / 2);
      const lado: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const zc = carriles[carril];
      let x = minX;
      fila.forEach((e) => {
        const m = medida(e);
        plazas.push({
          ...e,
          piso,
          x: x + m.ancho / 2,
          y: alturaPiso(piso),
          z: zc - lado * (MEDIO_CARRIL + m.fondo / 2),
          ancho: m.ancho,
          fondo: m.fondo,
          fila: lado,
          carril,
          zCarril: zc,
        });
        x += m.ancho;
      });
    });
  });

  const fondoMax = MEDIDAS.AUTOMOVIL.fondo;
  const zNorte = carriles[carriles.length - 1] - MEDIO_CARRIL - fondoMax - 1.5;
  const zSur = MEDIO_CARRIL + fondoMax + 1.5;
  const viaX = minX - ANCHO_VIA / 2;
  const x0 = minX - ANCHO_VIA;
  const x1 = maxX + 1.2;

  let rampa: Rampa | null = null;
  let zSurBajo = zSur + 5;
  let zSurAlto = zSur;
  if (pisos > 1) {
    const cz = zSur + 3.2;
    rampa = {
      cx: viaX - RADIO_RAMPA,
      cz,
      radio: RADIO_RAMPA,
      interior: RADIO_RAMPA - ANCHO_RAMPA / 2,
      exterior: RADIO_RAMPA + ANCHO_RAMPA / 2,
    };
    zSurBajo = cz + rampa.exterior + 1;
    zSurAlto = cz;
  }
  const barreraZ = zSurBajo + 1.6;
  const base = {
    x0: Math.min(x0, rampa ? rampa.cx - rampa.exterior : x0) - 4,
    x1: x1 + (pisos > 1 ? 9 : 5),
    z0: zNorte - 4,
    z1: barreraZ + 8,
  };
  const altura = alturaPiso(pisos);
  return {
    plazas,
    pisos,
    minX,
    maxX,
    largo,
    carriles,
    zNorte,
    zSur,
    x0,
    x1,
    zSurBajo,
    zSurAlto,
    viaX,
    viaEntra: viaX + 1.7,
    viaSale: viaX - 1.7,
    rampa,
    barreraZ,
    calleZ: base.z1 + 0.5,
    base,
    centro: [(base.x0 + base.x1) / 2, altura / 2, (base.z0 + base.z1) / 2],
    extension: Math.max(base.x1 - base.x0, (base.z1 - base.z0) * 1.25, altura * 3),
    barreraX: viaX,
  };
}

/** Color de carrocería estable para cada espacio sin color registrado. */
const COLORES = ["#e9ecef", "#9aa3ad", "#2b3138", "#b3202a", "#1f4e8c", "#c7c9cc", "#5a6470", "#e8e1d4", "#0f5e4a", "#f2c230"];
export function colorVehiculo(semilla: number) {
  return COLORES[(Math.abs(semilla) * 7919) % COLORES.length];
}
