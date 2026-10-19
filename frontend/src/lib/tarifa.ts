/**
 * Cálculo del cobro, con las mismas reglas del backend
 * (backend/src/services/tarifaService.ts):
 * horas completas x valor_hora + fracciones de 15 min iniciadas x valor_fraccion,
 * con tope de valor_dia por cada día.
 */
export interface Tarifa {
  valor_hora: number;
  valor_fraccion: number;
  valor_dia: number;
}

export interface Desglose {
  total: number;
  dias: number;
  horas: number;
  fracciones: number;
  topeAplicado: boolean;
}

export function calcularCobro(minutos: number, t: Tarifa): Desglose {
  const m = Math.max(1, Math.round(minutos));
  const dias = Math.floor(m / 1440);
  const resto = m % 1440;
  const horas = Math.floor(resto / 60);
  const fracciones = Math.ceil((resto % 60) / 15);
  const sinTope = horas * t.valor_hora + fracciones * t.valor_fraccion;
  const topeAplicado = sinTope > t.valor_dia;
  return { total: dias * t.valor_dia + Math.min(sinTope, t.valor_dia), dias, horas, fracciones, topeAplicado };
}
