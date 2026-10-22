import { useSyncExternalStore } from "react";

/**
 * Apariencia y accesibilidad. Son preferencias de cada navegador: se
 * guardan en localStorage (si está disponible) y se aplican como atributos
 * en <html>, que es lo que leen los estilos (styles.css).
 *
 * - tema: oscuro o claro.
 * - texto: tamaño de letra.
 * - contraste: textos secundarios y bordes más marcados, enlaces subrayados.
 * - movimiento: "reducido" detiene animaciones y la cámara 3D automática.
 * - lectura: reemplaza la tipografía condensada de los títulos.
 * - simbolos: el plano marca cada estado con un símbolo, no solo con color.
 * - plano2d: muestra el plano 2D en lugar del 3D.
 */
export interface Apariencia {
  tema: "oscuro" | "claro";
  texto: "normal" | "grande" | "muy-grande";
  contraste: boolean;
  movimiento: "sistema" | "reducido";
  lectura: boolean;
  simbolos: boolean;
  plano2d: boolean;
}

const CLAVE = "parkway.apariencia";

const POR_DEFECTO: Apariencia = {
  tema: "oscuro",
  texto: "normal",
  contraste: false,
  movimiento: "sistema",
  lectura: false,
  simbolos: false,
  plano2d: false,
};

function leer(): Apariencia {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    if (guardada && typeof guardada === "object") return { ...POR_DEFECTO, ...guardada };
  } catch {
    /* almacenamiento no disponible */
  }
  return { ...POR_DEFECTO };
}

let actual = leer();
const oyentes = new Set<() => void>();

function aplicar(a: Apariencia) {
  const html = document.documentElement;
  html.dataset.theme = a.tema === "claro" ? "light" : "dark";
  html.dataset.texto = a.texto;
  html.dataset.contraste = a.contraste ? "alto" : "normal";
  html.dataset.movimiento = movimientoReducido(a) ? "reducido" : "normal";
  html.dataset.lectura = a.lectura ? "facil" : "normal";
  html.dataset.simbolos = a.simbolos ? "si" : "no";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", a.tema === "claro" ? "#f4f5f7" : "#000000");
}

export function movimientoReducido(a: Apariencia = actual) {
  if (a.movimiento === "reducido") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function cambiarApariencia(cambios: Partial<Apariencia>) {
  actual = { ...actual, ...cambios };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    /* almacenamiento no disponible */
  }
  aplicar(actual);
  oyentes.forEach((f) => f());
}

export function restablecerAccesibilidad() {
  cambiarApariencia({ ...POR_DEFECTO, tema: actual.tema });
}

export const leerApariencia = () => actual;

export function useApariencia(): Apariencia {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => actual
  );
}

aplicar(actual);
