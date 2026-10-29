import { createContext, MutableRefObject, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ALTURA_PISO, Distribucion, Plaza } from "./layout";

/**
 * Recorridos de los vehículos dentro de la maqueta.
 *
 * Entrada: el vehículo aparece en el borde de la maqueta, pasa la barrera,
 * sube por la rampa si su plaza está en otro piso, avanza por la vía de
 * circulación hasta su carril y entra de frente a la plaza.
 * Salida: sale de reversa, toma el carril hacia la vía, baja por la rampa
 * si hace falta y sale por la barrera.
 *
 * Cada recorrido son tramos suaves (curvas Catmull-Rom). Un tramo puede ir
 * en reversa: el vehículo avanza por la curva mirando hacia atrás.
 */
export interface Tramo {
  curva: THREE.CatmullRomCurve3;
  reversa: boolean;
  largo: number;
}

export interface Ruta {
  tramos: Tramo[];
  largo: number;
  /** Distancia desde el inicio hasta el punto donde el vehículo espera la barrera. */
  barrera: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Quita puntos demasiado cercanos al anterior, que harían giros bruscos. */
function limpiar(puntos: THREE.Vector3[], minimo = 1.1) {
  const r: THREE.Vector3[] = [];
  puntos.forEach((p, i) => {
    const ultimo = r[r.length - 1];
    if (!ultimo || ultimo.distanceTo(p) >= minimo || i === puntos.length - 1) {
      if (ultimo && i === puntos.length - 1 && ultimo.distanceTo(p) < minimo && r.length > 1) r.pop();
      r.push(p);
    }
  });
  return r;
}

function tramo(puntos: THREE.Vector3[], reversa = false): Tramo {
  const curva = new THREE.CatmullRomCurve3(limpiar(puntos), false, "centripetal", 0.5);
  return { curva, reversa, largo: curva.getLength() };
}

/** Puntos de la espiral entre dos pisos (subiendo o bajando). */
function espiral(d: Distribucion, desde: number, hasta: number) {
  const r = d.rampa!;
  const puntos: THREE.Vector3[] = [];
  const f0 = -2 * Math.PI * (desde - 1);
  const f1 = -2 * Math.PI * (hasta - 1);
  const pasos = Math.max(8, Math.round((Math.abs(f1 - f0) / (2 * Math.PI)) * 28));
  for (let i = 0; i <= pasos; i++) {
    const f = f0 + ((f1 - f0) * i) / pasos;
    puntos.push(V(r.cx + r.radio * Math.cos(f), (-f / (2 * Math.PI)) * ALTURA_PISO, r.cz + r.radio * Math.sin(f)));
  }
  return puntos;
}

function rutaDe(tramos: Tramo[], barrera: number): Ruta {
  return { tramos, largo: tramos.reduce((s, t) => s + t.largo, 0), barrera };
}

/** Recorrido de un vehículo que llega a la plaza. */
export function rutaEntrada(d: Distribucion, p: Plaza): Ruta {
  const y = p.y;
  const zc = p.zCarril;
  const xi = d.viaEntra;
  const pts: THREE.Vector3[] = [V(xi, 0, d.calleZ), V(xi, 0, d.barreraZ + 3.5), V(xi, 0, d.barreraZ - 2.5)];
  if (p.piso > 1 && d.rampa) {
    const r = d.rampa;
    pts.push(V(xi, 0, r.cz + 6), V(d.viaX + 0.4, 0, r.cz + 2.4));
    pts.push(...espiral(d, 1, p.piso));
    pts.push(V(d.viaX + 0.4, y, r.cz - 2.4), V(xi, y, r.cz - 6));
  }
  if (pts[pts.length - 1].z > zc + 6) pts.push(V(xi, y, zc + 5));
  pts.push(V(xi + 2.4, y, zc + 1.6));
  if (p.x - 4.4 > xi + 4) pts.push(V(p.x - 4.4, y, zc + 1.4));
  if (p.fila === 1) {
    if (p.x - 1.8 > xi + 3.2) pts.push(V(p.x - 1.8, y, zc + 0.5));
    pts.push(V(p.x - 0.12, y, zc - 2.2));
  } else {
    if (p.x - 3.2 > xi + 3.2) pts.push(V(p.x - 3.2, y, zc - 0.5));
    pts.push(V(p.x - 0.2, y, zc + 2.3));
  }
  pts.push(V(p.x, y, p.z));
  const t = tramo(pts);
  return rutaDe([t], distanciaHasta(t, V(xi, 0, d.barreraZ + 3.5)));
}

/** Recorrido de un vehículo que deja la plaza. */
export function rutaSalida(d: Distribucion, p: Plaza): Ruta {
  const y = p.y;
  const zc = p.zCarril;
  const xo = d.viaSale;
  const lado = p.fila === 1 ? -1 : 1; // hacia el carril desde la plaza
  const reversa = tramo([V(p.x, y, p.z), V(p.x + 0.4, y, zc + lado * 1.9), V(p.x + 2.8, y, zc + lado * 0.7)], true);
  const pts: THREE.Vector3[] = [V(p.x + 2.8, y, zc + lado * 0.7)];
  if (p.x - 1.4 > xo + 4.5) pts.push(V(p.x - 1.4, y, zc - 1.4));
  pts.push(V(xo + 3, y, zc - 1.4), V(xo, y, zc + 3.4));
  if (p.piso > 1 && d.rampa) {
    const r = d.rampa;
    pts.push(V(xo, y, r.cz - 6), V(d.viaX - 0.4, y, r.cz - 2.4));
    pts.push(...espiral(d, p.piso, 1));
    pts.push(V(d.viaX - 0.4, 0, r.cz + 2.4), V(xo, 0, r.cz + 6));
  }
  pts.push(V(xo, 0, d.barreraZ - 2.5), V(xo, 0, d.barreraZ + 3.5), V(xo, 0, d.calleZ));
  const adelante = tramo(pts);
  return rutaDe([reversa, adelante], reversa.largo + distanciaHasta(adelante, V(xo, 0, d.barreraZ - 2.5)));
}

/** Distancia a lo largo del tramo hasta el punto más cercano a `objetivo`. */
function distanciaHasta(t: Tramo, objetivo: THREE.Vector3) {
  let mejor = 0;
  let dist = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i <= 200; i++) {
    t.curva.getPointAt(i / 200, p);
    const dd = p.distanceToSquared(objetivo);
    if (dd < dist) {
      dist = dd;
      mejor = i / 200;
    }
  }
  return mejor * t.largo;
}

/**
 * Posición y orientación a una distancia `s` del inicio de la ruta.
 * La orientación incluye la inclinación en la rampa.
 */
export function ubicar(ruta: Ruta, s: number, obj: THREE.Object3D) {
  let resto = Math.min(Math.max(0, s), ruta.largo);
  let t = ruta.tramos[0];
  for (const x of ruta.tramos) {
    t = x;
    if (resto <= x.largo || x === ruta.tramos[ruta.tramos.length - 1]) break;
    resto -= x.largo;
  }
  const u = Math.min(0.9999, Math.max(0.0001, resto / Math.max(t.largo, 0.001)));
  t.curva.getPointAt(u, obj.position);
  const tan = t.curva.getTangentAt(u, AUX);
  if (t.reversa) tan.negate();
  const yaw = Math.atan2(tan.x, tan.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, tan.y)));
  obj.rotation.set(-pitch, yaw, 0, "YXZ");
}
const AUX = new THREE.Vector3();

// ---------------------------------------------------------------------
// Tráfico: vehículos en movimiento, para que la barrera se levante.
// ---------------------------------------------------------------------
export type RegistroTrafico = MutableRefObject<Set<THREE.Object3D>>;
export const TraficoContexto = createContext<RegistroTrafico | null>(null);
export const useTrafico = () => useContext(TraficoContexto);

/** Velocidad de crucero dentro de la maqueta, en metros por segundo. */
const VELOCIDAD = 8.5;

/**
 * Mueve un objeto por la ruta a velocidad de maqueta: acelera al salir,
 * frena antes de la barrera hasta que se levanta y al llegar al final.
 */
export function useRecorrido(ruta: Ruta | null, ref: MutableRefObject<THREE.Object3D | null>, alTerminar?: () => void) {
  const s = useRef(0);
  const v = useRef(0);
  const terminado = useRef(false);
  const trafico = useTrafico();
  const espera = useRef(0);
  const registrado = useRef<THREE.Object3D | null>(null);
  useEffect(() => () => {
    if (registrado.current) trafico?.current.delete(registrado.current);
  }, [trafico]);
  useMemo(() => {
    s.current = 0;
    v.current = 0;
    terminado.current = false;
    espera.current = 0;
  }, [ruta]);

  useFrame((_, dtReal) => {
    const obj = ref.current;
    if (!obj || !ruta || terminado.current) return;
    const dt = Math.min(dtReal, 0.1);
    trafico?.current.add(obj);
    registrado.current = obj;
    const faltaFinal = ruta.largo - s.current;
    const faltaBarrera = ruta.barrera - s.current;
    // Pausa breve frente a la barrera mientras se levanta.
    let objetivo = VELOCIDAD;
    if (faltaBarrera > 0 && faltaBarrera < 6) objetivo = Math.max(1.2, faltaBarrera * 1.2);
    if (faltaBarrera <= 0.05 && faltaBarrera > -0.2 && espera.current < 0.7) {
      espera.current += dt;
      objetivo = 0;
    }
    objetivo = Math.min(objetivo, Math.max(0.6, faltaFinal * 1.4));
    // En reversa, despacio.
    const enReversa = ruta.tramos[0].reversa && s.current < ruta.tramos[0].largo;
    if (enReversa) objetivo = Math.min(objetivo, 2.4);
    v.current += (objetivo - v.current) * Math.min(1, dt * 2.5);
    s.current = Math.min(ruta.largo, s.current + v.current * dt);
    ubicar(ruta, s.current, obj);
    if (ruta.largo - s.current < 0.02) {
      terminado.current = true;
      trafico?.current.delete(obj);
      alTerminar?.();
    }
  });
}
