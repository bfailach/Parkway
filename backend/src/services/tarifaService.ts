/**
 * Cálculo del valor a cobrar (RF07).
 *
 * Reglas:
 * 1. Se cobra cada minuto iniciado. La permanencia mínima es 1 minuto.
 * 2. Por cada día completo (1440 minutos) se cobra el valor_dia.
 * 3. Para el tiempo restante del último día:
 *      horas completas x valor_hora
 *    + fracciones de 15 minutos iniciadas x valor_fraccion
 * 4. El valor del tiempo restante nunca supera el valor_dia.
 *
 * Ejemplo con automóvil (hora 4.000, fracción 1.500, día 30.000):
 *   1 h 20 min = 4.000 + 2 x 1.500 = 7.000
 */
export interface Tarifa {
  valor_hora: number;
  valor_fraccion: number;
  valor_dia: number;
}

export const MINUTOS_DIA = 1440;
export const MINUTOS_FRACCION = 15;

export function calcularMinutos(ingreso: Date, salida: Date): number {
  const ms = salida.getTime() - ingreso.getTime();
  return Math.max(1, Math.ceil(ms / 60000));
}

export function calcularValor(minutos: number, tarifa: Tarifa): number {
  if (!Number.isFinite(minutos) || minutos < 1) minutos = 1;
  const vh = Number(tarifa.valor_hora);
  const vf = Number(tarifa.valor_fraccion);
  const vd = Number(tarifa.valor_dia);

  const dias = Math.floor(minutos / MINUTOS_DIA);
  const resto = minutos % MINUTOS_DIA;

  const horas = Math.floor(resto / 60);
  const fracciones = Math.ceil((resto % 60) / MINUTOS_FRACCION);
  const valorResto = Math.min(horas * vh + fracciones * vf, vd);

  return dias * vd + valorResto;
}
