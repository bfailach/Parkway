/**
 * Convierte la lista de espacios de una sede en posiciones 3D.
 *
 * El parqueadero es un solo carril a lo largo del eje X, con una fila de
 * plazas a cada lado. Los automóviles se reparten entre las dos filas;
 * las motocicletas siguen en la fila sur y las bicicletas en la fila norte.
 * La entrada con la barrera queda en el extremo oeste del carril.
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
}

export interface Plaza extends EspacioPlano {
  x: number;
  z: number;
  ancho: number;
  fondo: number;
  /** 1 = fila norte (los vehículos miran hacia -z), -1 = fila sur. */
  fila: 1 | -1;
}

export const MEDIDAS: Record<string, { ancho: number; fondo: number }> = {
  AUTOMOVIL: { ancho: 2.7, fondo: 5.2 },
  MOTOCICLETA: { ancho: 1.4, fondo: 2.6 },
  BICICLETA: { ancho: 1.0, fondo: 2.2 },
};

export const MEDIO_CARRIL = 3.6;

export interface Distribucion {
  plazas: Plaza[];
  minX: number;
  maxX: number;
  largo: number;
  /** Posición de la barrera de entrada. */
  barreraX: number;
}

export function distribuir(espacios: EspacioPlano[]): Distribucion {
  const autos = espacios.filter((e) => e.tipo === "AUTOMOVIL");
  const motos = espacios.filter((e) => e.tipo === "MOTOCICLETA");
  const bicis = espacios.filter((e) => e.tipo === "BICICLETA");
  const mitad = Math.ceil(autos.length / 2);

  const norte = [...autos.slice(0, mitad), ...bicis];
  const sur = [...autos.slice(mitad), ...motos];

  const largoFila = (fila: EspacioPlano[]) => fila.reduce((s, e) => s + (MEDIDAS[e.tipo] ?? MEDIDAS.AUTOMOVIL).ancho, 0);
  const largo = Math.max(largoFila(norte), largoFila(sur), 10);
  const minX = -largo / 2;

  const colocar = (fila: EspacioPlano[], lado: 1 | -1): Plaza[] => {
    let x = minX;
    return fila.map((e) => {
      const m = MEDIDAS[e.tipo] ?? MEDIDAS.AUTOMOVIL;
      const p: Plaza = {
        ...e,
        x: x + m.ancho / 2,
        z: -lado * (MEDIO_CARRIL + m.fondo / 2),
        ancho: m.ancho,
        fondo: m.fondo,
        fila: lado,
      };
      x += m.ancho;
      return p;
    });
  };

  return {
    plazas: [...colocar(norte, 1), ...colocar(sur, -1)],
    minX,
    maxX: minX + largo,
    largo,
    barreraX: minX - 3.5,
  };
}

/** Color de carrocería estable para cada espacio (no cambia entre recargas). */
const COLORES = ["#d9dde2", "#9aa3ad", "#2b3138", "#b3202a", "#1f4e8c", "#c7c9cc", "#5a6470", "#e8e1d4", "#0f5e4a", "#f2c230"];
export function colorVehiculo(semilla: number) {
  return COLORES[(semilla * 7919) % COLORES.length];
}
