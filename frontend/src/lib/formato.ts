const moneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const hora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
const fechaHora = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const pesos = (v: number | null | undefined) => (v == null ? "Sin tarifa" : moneda.format(v));
export const horaCorta = (iso: string | null) => (iso ? hora.format(new Date(iso)) : "");
export const fechaCorta = (iso: string | null) => (iso ? fechaHora.format(new Date(iso)) : "");

/** 95 -> "1 h 35 min" */
export function duracion(min: number | null | undefined): string {
  if (min == null) return "";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [d ? `${d} d` : "", h ? `${h} h` : "", `${m} min`].filter(Boolean).join(" ");
}

const NOMBRE_TIPO: Record<string, string> = {
  AUTOMOVIL: "Automóvil",
  MOTOCICLETA: "Motocicleta",
  BICICLETA: "Bicicleta",
};
export const nombreTipo = (t: string) => NOMBRE_TIPO[t] ?? t;

const PLURAL_TIPO: Record<string, string> = {
  AUTOMOVIL: "Automóviles",
  MOTOCICLETA: "Motocicletas",
  BICICLETA: "Bicicletas",
};
export const pluralTipo = (t: string) => PLURAL_TIPO[t] ?? t;

/** Mismas reglas de formato que el backend (validators/ingresoValidator.ts). */
export const FORMATO_PLACA: Record<number, { regex: RegExp; ejemplo: string; max: number }> = {
  1: { regex: /^[A-Z]{3}\d{3}$/, ejemplo: "ABC123", max: 6 },
  2: { regex: /^[A-Z]{3}\d{2}[A-Z]$/, ejemplo: "ABC12D", max: 6 },
  3: { regex: /^[A-Z0-9]{3,10}$/, ejemplo: "BIC0042", max: 10 },
};

export const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");
