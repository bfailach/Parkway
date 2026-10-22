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
  3: { regex: /^BICI\d{3,7}$/, ejemplo: "BICI001", max: 11 },
};

export const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const NOMBRE_DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** "06:00" -> "6:00", "24:00" -> "medianoche" */
export const horaTexto = (h: string) => (h === "24:00" ? "medianoche" : h.replace(/^0(\d)/, "$1"));

/** Resume un horario semanal: "Lun a sáb 6:00 a 22:00 · Dom 8:00 a 20:00". */
export function resumenHorario(horarios: { dia: number; abre: string; cierra: string }[]): string {
  if (!horarios.length) return "Sin horario";
  if (horarios.length === 7 && horarios.every((h) => h.abre === "00:00" && h.cierra === "24:00")) return "Abierta las 24 horas";
  const grupos: { desde: number; hasta: number; abre: string; cierra: string }[] = [];
  horarios.forEach((h) => {
    const g = grupos[grupos.length - 1];
    if (g && g.hasta === h.dia - 1 && g.abre === h.abre && g.cierra === h.cierra) g.hasta = h.dia;
    else grupos.push({ desde: h.dia, hasta: h.dia, abre: h.abre, cierra: h.cierra });
  });
  const corto = (d: number) => NOMBRE_DIA[d].slice(0, 3).toLowerCase();
  return grupos
    .map((g) => {
      const dias = g.desde === g.hasta ? corto(g.desde) : `${corto(g.desde)} a ${corto(g.hasta)}`;
      return `${dias.charAt(0).toUpperCase()}${dias.slice(1)} ${horaTexto(g.abre)} a ${horaTexto(g.cierra)}`;
    })
    .join(" · ");
}
