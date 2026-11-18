/**
 * Cálculo del cobro, con las mismas reglas del backend
 * (backend/src/services/tarifaService.ts):
 * horas completas x valor_hora + fracciones de 15 min iniciadas x valor_fraccion,
 * con tope de valor_dia por cada día y, por el Decreto 026 de 2026, nunca
 * más que el tope por minuto × los minutos (tope_minuto, lo envía el backend).
 */
export interface Tarifa {
  valor_hora: number;
  valor_fraccion: number;
  valor_dia: number;
  tope_minuto?: number | null;
}

export interface Desglose {
  total: number;
  dias: number;
  horas: number;
  fracciones: number;
  topeAplicado: boolean;
  /** true si el valor se recortó al máximo legal (tope por minuto × minutos). */
  topeLegalAplicado: boolean;
  /** Máximo legal para estos minutos, si se conoce el tope. */
  maximoLegal: number | null;
}

export function calcularCobro(minutos: number, t: Tarifa): Desglose {
  const m = Math.max(1, Math.round(minutos));
  const dias = Math.floor(m / 1440);
  const resto = m % 1440;
  const horas = Math.floor(resto / 60);
  const fracciones = Math.ceil((resto % 60) / 15);
  const sinTope = horas * t.valor_hora + fracciones * t.valor_fraccion;
  const topeAplicado = sinTope > t.valor_dia;
  const segunTarifa = dias * t.valor_dia + Math.min(sinTope, t.valor_dia);
  const maximoLegal = t.tope_minuto != null ? Number(t.tope_minuto) * m : null;
  const topeLegalAplicado = maximoLegal != null && segunTarifa > maximoLegal;
  return { total: topeLegalAplicado ? maximoLegal : segunTarifa, dias, horas, fracciones, topeAplicado, topeLegalAplicado, maximoLegal };
}
