/**
 * Exportación a CSV de los reportes (RF13). Pensada para abrirse con doble
 * clic en Excel configurado en español de Colombia:
 * - UTF-8 con BOM, para que las tildes se vean bien;
 * - punto y coma como separador y coma decimal;
 * - fin de línea CRLF.
 * Las celdas de texto que empiezan por =, +, - o @ llevan un apóstrofo
 * delante para que Excel no las ejecute como fórmula (inyección de CSV).
 */
export interface ColumnaCsv<T> {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
  /** Decimales para los números (por defecto, los que tenga el valor). */
  decimales?: number;
}

const BOM = "﻿";

export function celdaCsv(v: string | number | null | undefined, decimales?: number): string {
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "";
  let t: string;
  if (typeof v === "number") {
    t = (decimales === undefined ? String(v) : v.toFixed(decimales)).replace(".", ",");
  } else {
    t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  }
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function aCsv<T>(columnas: ColumnaCsv<T>[], filas: T[]): string {
  const lineas = [
    columnas.map((c) => celdaCsv(c.titulo)).join(";"),
    ...filas.map((f) => columnas.map((c) => celdaCsv(c.valor(f), c.decimales)).join(";")),
  ];
  return BOM + lineas.join("\r\n") + "\r\n";
}
