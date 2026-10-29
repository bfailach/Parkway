/**
 * Límites de espacios de una sede, iguales a los del backend
 * (parqueaderoValidator.ts). Son cifras realistas para Bogotá: un piso de
 * un edificio de parqueaderos recibe entre 50 y 150 carros.
 */
export const LIMITE_POR_PISO: Record<number, number> = { 1: 150, 2: 80, 3: 60 };
export const LIMITE_POR_SEDE: Record<number, number> = { 1: 600, 2: 300, 3: 200 };
export const LIMITE_TOTAL_SEDE = 800;
export const MAX_PISOS = 6;

/**
 * Cupos de bicicleta recomendados: el 10 % de los de automóvil y al menos
 * 12 si hay menos de 120 de automóvil. Es lo que la Ley 1811 de 2016 exige a
 * los edificios públicos; aquí se muestra como recomendación.
 */
export function bicicletasRecomendadas(automoviles: number) {
  if (automoviles <= 0) return 0;
  return automoviles < 120 ? 12 : Math.ceil(automoviles * 0.1);
}
