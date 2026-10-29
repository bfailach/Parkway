import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { ALTURA_PISO, alturaPiso, Distribucion, GROSOR_LOSA, Rampa } from "./layout";
import { materialPeligro, PisoContexto, useMat, usePiso } from "./materiales";
import { usePaleta } from "./tema";
import { useTrafico } from "./rutas";

/**
 * La maqueta del parqueadero, sin entorno: una base flotante con el acceso,
 * las losas de cada piso con sus columnas y barandas, la rampa en espiral
 * que une los pisos y el núcleo de escaleras. Las plazas y los vehículos se
 * dibujan aparte (Plazas.tsx).
 */

const MARGEN_HUECO = 0.1;

// ---------------------------------------------------------------------
// Formas de las losas
// ---------------------------------------------------------------------

/** Contorno de la losa de un piso en el plano (x, -z). */
function formaLosa(d: Distribucion, piso: number) {
  const s = new THREE.Shape();
  const r = d.rampa;
  if (piso === 1 || !r) {
    const z1 = piso === 1 ? d.zSurBajo : d.zSurAlto;
    s.moveTo(d.x0, -d.zNorte);
    s.lineTo(d.x1, -d.zNorte);
    s.lineTo(d.x1, -z1);
    s.lineTo(d.x0, -z1);
    s.closePath();
    return s;
  }
  // Pisos altos: la esquina suroeste tiene un hueco circular para la rampa.
  const radio = r.exterior + MARGEN_HUECO;
  const finArco = -Math.acos(Math.min(1, (d.x0 - r.cx) / radio));
  s.moveTo(d.x0, -d.zNorte);
  s.lineTo(d.x1, -d.zNorte);
  s.lineTo(d.x1, -d.zSurAlto);
  s.lineTo(r.cx + radio, -r.cz);
  for (let i = 1; i <= 24; i++) {
    const a = (finArco * i) / 24;
    s.lineTo(r.cx + radio * Math.cos(a), -(r.cz + radio * Math.sin(a)));
  }
  s.closePath();
  return s;
}

function geometriaLosa(d: Distribucion, piso: number, grosor: number) {
  const g = new THREE.ExtrudeGeometry(formaLosa(d, piso), { depth: grosor, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

function geometriaSuperficie(d: Distribucion, piso: number) {
  const g = new THREE.ShapeGeometry(formaLosa(d, piso));
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------
// Señales en el piso
// ---------------------------------------------------------------------
const geoFlecha = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 1.1);
  s.lineTo(0.55, 0.35);
  s.lineTo(0.18, 0.35);
  s.lineTo(0.18, -1.1);
  s.lineTo(-0.18, -1.1);
  s.lineTo(-0.18, 0.35);
  s.lineTo(-0.55, 0.35);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2); // la punta mira hacia -z
  return g;
})();

/** Flecha pintada en el piso. `hacia` en radianes: 0 = norte (-z). */
function Flecha({ x, y, z, hacia }: { x: number; y: number; z: number; hacia: number }) {
  const m = useMat("flecha");
  return <mesh geometry={geoFlecha} material={m} position={[x, y + 0.012, z]} rotation={[0, hacia, 0]} />;
}

const NORTE = 0;
const SUR = Math.PI;
const ESTE = -Math.PI / 2;
const OESTE = Math.PI / 2;

function Senales({ d, piso }: { d: Distribucion; piso: number }) {
  const y = alturaPiso(piso);
  const flechas: { x: number; z: number; h: number }[] = [];
  // Vía de circulación: entra por el este del eje, sale por el oeste.
  const zSurVia = piso === 1 ? d.zSurBajo - 3 : d.zSurAlto - 8;
  for (let z = d.zNorte + 6; z < zSurVia; z += 11) {
    flechas.push({ x: d.viaEntra, z, h: NORTE }, { x: d.viaSale, z: z + 5, h: SUR });
  }
  // Carriles
  d.carriles.forEach((zc) => {
    flechas.push({ x: d.minX + 5, z: zc + 1.4, h: ESTE }, { x: d.maxX - 5, z: zc - 1.4, h: OESTE });
    if (d.largo > 34) flechas.push({ x: (d.minX + d.maxX) / 2, z: zc + 1.4, h: ESTE }, { x: (d.minX + d.maxX) / 2 - 4, z: zc - 1.4, h: OESTE });
  });
  return (
    <group>
      {flechas.map((f, i) => (
        <Flecha key={i} x={f.x} y={y} z={f.z} hacia={f.h} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------
// Columnas y barandas
// ---------------------------------------------------------------------
function Columna({ x, y, z, alto }: { x: number; y: number; z: number; alto: number }) {
  const concreto = useMat("concreto");
  const p = usePaleta();
  const { fantasma } = usePiso();
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, alto / 2, 0]} material={concreto} castShadow={!fantasma} receiveShadow>
        <boxGeometry args={[0.6, alto, 0.6]} />
      </mesh>
      <mesh position={[0, 0.55, 0]} material={materialPeligro(p, fantasma)}>
        <boxGeometry args={[0.64, 1.1, 0.64]} />
      </mesh>
    </group>
  );
}

/** Baranda de concreto entre dos puntos: postes, viga superior y bordillo. */
function Baranda({ a, b, y }: { a: [number, number]; b: [number, number]; y: number }) {
  const concreto = useMat("concreto");
  const { fantasma } = usePiso();
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const largo = Math.hypot(dx, dz);
  if (largo < 0.5) return null;
  const angulo = Math.atan2(-dz, dx);
  const postes = Math.max(1, Math.round(largo / 5.5));
  return (
    <group position={[a[0], y, a[1]]} rotation={[0, angulo, 0]}>
      <mesh position={[largo / 2, 1.05, 0]} material={concreto} castShadow={!fantasma}>
        <boxGeometry args={[largo, 0.32, 0.32]} />
      </mesh>
      <mesh position={[largo / 2, 0.12, 0]} material={concreto} castShadow={!fantasma}>
        <boxGeometry args={[largo, 0.24, 0.3]} />
      </mesh>
      {Array.from({ length: postes + 1 }, (_, i) => (
        <mesh key={i} position={[(largo * i) / postes, 0.6, 0]} material={concreto} castShadow={!fantasma}>
          <boxGeometry args={[0.3, 1.0, 0.3]} />
        </mesh>
      ))}
    </group>
  );
}

function puntosColumnas(d: Distribucion) {
  const xs: number[] = [];
  for (let x = d.x0 + 0.4; x < d.x1 - 2; x += 8.4) xs.push(x);
  xs.push(d.x1 - 0.4);
  const zs = [d.zNorte + 0.4, d.zSurAlto - 0.4];
  for (let c = 1; c < d.carriles.length; c++) zs.push((d.carriles[c - 1] + d.carriles[c]) / 2);
  const r = d.rampa;
  const puntos: [number, number][] = [];
  xs.forEach((x) =>
    zs.forEach((z) => {
      // No en la vía de circulación (salvo el borde) ni en el hueco de la rampa.
      const enVia = x > d.x0 + 1 && x < d.minX + 0.3;
      const enIsla = z !== zs[0] && z !== zs[1];
      if (enVia || (enIsla && x < d.minX)) return;
      if (r && Math.hypot(x - r.cx, z - r.cz) < r.exterior + 0.9) return;
      puntos.push([x, z]);
    })
  );
  return puntos;
}

// ---------------------------------------------------------------------
// Pisos
// ---------------------------------------------------------------------
function Piso({ d, piso }: { d: Distribucion; piso: number }) {
  const asfalto = useMat("asfalto");
  const concreto = useMat("concreto");
  const { fantasma } = usePiso();
  const y = alturaPiso(piso);
  const losa = useMemo(() => geometriaLosa(d, piso, piso === 1 ? 0.06 : GROSOR_LOSA), [d, piso]);
  const superficie = useMemo(() => geometriaSuperficie(d, piso), [d, piso]);
  const columnas = useMemo(() => puntosColumnas(d), [d]);
  const r = d.rampa;
  const hayArriba = piso < d.pisos;

  // Barandas de los pisos altos, abiertas hacia la rampa.
  const barandas: [[number, number], [number, number]][] = [];
  if (piso > 1) {
    const zs = d.zSurAlto;
    barandas.push([[d.x0, d.zNorte], [d.x1, d.zNorte]], [[d.x1, d.zNorte], [d.x1, zs]]);
    if (r) {
      const radio = r.exterior + MARGEN_HUECO;
      barandas.push([[d.x1, zs], [r.cx + radio + 0.4, zs]]);
      const zArco = r.cz - Math.sqrt(Math.max(0, radio * radio - (d.x0 - r.cx) ** 2));
      barandas.push([[d.x0, zArco - 0.4], [d.x0, d.zNorte]]);
    } else {
      barandas.push([[d.x1, zs], [d.x0, zs]], [[d.x0, zs], [d.x0, d.zNorte]]);
    }
  }

  return (
    <group>
      <mesh geometry={losa} material={piso === 1 ? asfalto : concreto} position={[0, y - (piso === 1 ? 0.06 : GROSOR_LOSA), 0]} receiveShadow castShadow={piso > 1 && !fantasma} />
      {piso > 1 && <mesh geometry={superficie} material={asfalto} position={[0, y + 0.004, 0]} receiveShadow />}
      <Senales d={d} piso={piso} />
      {hayArriba && columnas.map(([x, z], i) => <Columna key={i} x={x} y={y} z={z} alto={ALTURA_PISO - GROSOR_LOSA} />)}
      {barandas.map(([a, b], i) => (
        <Baranda key={i} a={a} b={b} y={y} />
      ))}
      {piso === 1 && d.pisos === 1 && (
        // Parqueadero a nivel: bordillo bajo alrededor.
        <group>
          {[
            [[d.x0, d.zNorte], [d.x1, d.zNorte]],
            [[d.x1, d.zNorte], [d.x1, d.zSurBajo]],
            [[d.x0, d.zSurBajo], [d.x0, d.zNorte]],
            [[d.x1, d.zSurBajo], [d.viaX + 4, d.zSurBajo]],
          ].map(([a, b], i) => {
            const dx = b[0] - a[0];
            const dz = b[1] - a[1];
            return (
              <mesh key={i} position={[(a[0] + b[0]) / 2, 0.12, (a[1] + b[1]) / 2]} material={concreto} castShadow>
                <boxGeometry args={[Math.abs(dx) + 0.3, 0.24, Math.abs(dz) + 0.3]} />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// Rampa en espiral
// ---------------------------------------------------------------------
function geometriaEspiral(r: Rampa, vueltas: number) {
  const pasos = Math.max(24, Math.round(vueltas * 64));
  const f0 = 0.12;
  const f1 = -2 * Math.PI * vueltas - 0.12;
  const arriba: number[] = [];
  const cuerpo: number[] = [];
  const idxArriba: number[] = [];
  const idxCuerpo: number[] = [];
  const alto = (f: number) => Math.min(vueltas * ALTURA_PISO, Math.max(0, (-f / (2 * Math.PI)) * ALTURA_PISO)) + 0.03;
  const pt = (rad: number, f: number, y: number) => [r.cx + rad * Math.cos(f), y, r.cz + rad * Math.sin(f)];
  for (let i = 0; i <= pasos; i++) {
    const f = f0 + ((f1 - f0) * i) / pasos;
    const y = alto(f);
    arriba.push(...pt(r.interior, f, y), ...pt(r.exterior, f, y));
    // Cuerpo: canto interior y exterior, de la superficie a la cara inferior.
    cuerpo.push(...pt(r.interior, f, y), ...pt(r.interior, f, y - 0.4), ...pt(r.exterior, f, y), ...pt(r.exterior, f, y - 0.4));
    if (i < pasos) {
      const a = i * 2;
      idxArriba.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      const b = i * 4;
      // canto interior
      idxCuerpo.push(b, b + 1, b + 4, b + 1, b + 5, b + 4);
      // canto exterior
      idxCuerpo.push(b + 2, b + 6, b + 3, b + 3, b + 6, b + 7);
      // cara inferior
      idxCuerpo.push(b + 1, b + 3, b + 5, b + 3, b + 7, b + 5);
    }
  }
  const gA = new THREE.BufferGeometry();
  gA.setAttribute("position", new THREE.Float32BufferAttribute(arriba, 3));
  gA.setIndex(idxArriba);
  gA.computeVertexNormals();
  const gC = new THREE.BufferGeometry();
  gC.setAttribute("position", new THREE.Float32BufferAttribute(cuerpo, 3));
  gC.setIndex(idxCuerpo);
  gC.computeVertexNormals();
  return { arriba: gA, cuerpo: gC };
}

/** Muro bajo del borde exterior, abierto donde la rampa se une a cada piso. */
function geometriaMuro(r: Rampa, vueltas: number) {
  const pasos = Math.max(24, Math.round(vueltas * 96));
  const f1 = -2 * Math.PI * vueltas;
  const pos: number[] = [];
  const idx: number[] = [];
  const abierto = (f: number) => {
    const a = ((f % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // 0..2π
    return a < 0.75 || a > 2 * Math.PI - 0.95;
  };
  const rad = r.exterior - 0.1;
  let base = -1;
  for (let i = 0; i <= pasos; i++) {
    const f = (f1 * i) / pasos;
    if (abierto(f)) {
      base = -1;
      continue;
    }
    const y = (-f / (2 * Math.PI)) * ALTURA_PISO;
    const n = pos.length / 3;
    pos.push(r.cx + rad * Math.cos(f), y - 0.4, r.cz + rad * Math.sin(f), r.cx + rad * Math.cos(f), y + 1.1, r.cz + rad * Math.sin(f));
    if (base >= 0) idx.push(base, n, base + 1, base + 1, n, n + 1);
    base = n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function RampaEspiral({ d }: { d: Distribucion }) {
  const r = d.rampa!;
  const vueltas = d.pisos - 1;
  const asfalto = useMat("asfaltoRampa");
  const concreto = useMat("concreto");
  const flecha = useMat("flecha");
  const { fantasma } = usePiso();
  const geo = useMemo(() => geometriaEspiral(r, vueltas), [r, vueltas]);
  const muro = useMemo(() => geometriaMuro(r, vueltas), [r, vueltas]);
  // El canto y el muro se ven por ambas caras.
  const muroMat = useMemo(() => {
    const m = (concreto as THREE.MeshStandardMaterial).clone();
    m.side = THREE.DoubleSide;
    return m;
  }, [concreto]);
  const alto = vueltas * ALTURA_PISO + 1.2;
  return (
    <group>
      <mesh geometry={geo.arriba} material={asfalto} receiveShadow castShadow={!fantasma} />
      <mesh geometry={geo.cuerpo} material={muroMat} castShadow={!fantasma} />
      <mesh geometry={muro} material={muroMat} castShadow={!fantasma} />
      {/* Muro central de la espiral */}
      <mesh position={[r.cx, alto / 2, r.cz]} material={muroMat} castShadow={!fantasma} receiveShadow>
        <cylinderGeometry args={[r.interior - 0.12, r.interior - 0.12, alto, 48, 1, true]} />
      </mesh>
      <mesh position={[r.cx, alto, r.cz]} rotation={[-Math.PI / 2, 0, 0]} material={concreto}>
        <ringGeometry args={[r.interior - 0.42, r.interior - 0.12, 48]} />
      </mesh>
      {/* Base circular */}
      <mesh position={[r.cx, 0.02, r.cz]} rotation={[-Math.PI / 2, 0, 0]} material={concreto} receiveShadow>
        <circleGeometry args={[r.exterior + 0.3, 48]} />
      </mesh>
      {/* Flechas de subida en cada vuelta */}
      {Array.from({ length: vueltas }, (_, i) => {
        const f = -2 * Math.PI * i - Math.PI;
        const y = (-f / (2 * Math.PI)) * ALTURA_PISO;
        return (
          <mesh
            key={i}
            geometry={geoFlecha}
            material={flecha}
            position={[r.cx + r.radio * Math.cos(f), y + 0.06, r.cz + r.radio * Math.sin(f)]}
            rotation={[0, -f, 0]}
            scale={0.8}
          />
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------
// Base, acceso y núcleo
// ---------------------------------------------------------------------
function Base({ d }: { d: Distribucion }) {
  const lado = useMat("baseLado");
  const arriba = useMat("baseArriba");
  const b = d.base;
  const ancho = b.x1 - b.x0;
  const fondo = b.z1 - b.z0;
  return (
    <group position={[(b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2]}>
      <RoundedBox args={[ancho, 1.6, fondo]} radius={0.5} smoothness={4} position={[0, -0.86, 0]} material={lado} receiveShadow />
      <mesh position={[0, -0.05, 0]} material={arriba} receiveShadow>
        <boxGeometry args={[ancho - 0.6, 0.04, fondo - 0.6]} />
      </mesh>
    </group>
  );
}

/** Talanquera: poste y brazo que se levanta cuando pasa un vehículo. */
function Talanquera({ x, z, haciaOeste, carril, d }: { x: number; z: number; haciaOeste: boolean; carril: number; d: Distribucion }) {
  const amarillo = useMat("peligroAmarillo");
  const rojo = useMat("rojo");
  const blanco = useMat("blanco");
  const brazo = useRef<THREE.Group>(null);
  const apertura = useRef(0);
  const trafico = useTrafico();
  const largo = 3.7;
  useFrame((_, dt) => {
    let cerca = false;
    trafico?.current.forEach((o) => {
      const p = o.position;
      if (p.y < 1 && Math.abs(p.x - carril) < 2.6 && Math.abs(p.z - d.barreraZ) < 6.5) cerca = true;
    });
    apertura.current += ((cerca ? 1 : 0) - apertura.current) * Math.min(1, dt * 3.5);
    if (brazo.current) brazo.current.rotation.z = (haciaOeste ? -1 : 1) * apertura.current * 1.35;
  });
  const s = haciaOeste ? -1 : 1;
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.5, 1.1, 0.5]} radius={0.08} smoothness={2} position={[0, 0.55, 0]} material={amarillo} castShadow />
      <group ref={brazo} position={[0, 1.0, 0]}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[s * (0.35 + (i + 0.5) * (largo / 6)), 0, 0]} material={i % 2 ? blanco : rojo} castShadow>
            <boxGeometry args={[largo / 6, 0.12, 0.12]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Acceso({ d }: { d: Distribucion }) {
  const asfalto = useMat("asfalto");
  const flecha = useMat("flecha");
  const pasto = useMat("pasto");
  const nucleo = useMat("nucleo");
  const vidrio = useMat("vidrioNucleo");
  const z0 = d.zSurBajo - 0.02;
  const z1 = d.base.z1 - 0.3;
  const zMedio = (z0 + z1) / 2;
  const largo = z1 - z0;
  const pastoX0 = d.viaX + 9;
  const pastoX1 = Math.min(d.x1 - 1, d.viaX + 24);
  return (
    <group>
      {/* Vía de acceso hasta el borde de la maqueta */}
      <mesh position={[d.viaX, -0.03, zMedio]} material={asfalto} receiveShadow>
        <boxGeometry args={[7.6, 0.06, largo]} />
      </mesh>
      {Array.from({ length: Math.floor(largo / 2.4) }, (_, i) => (
        <mesh key={i} position={[d.viaX, 0.006, z0 + 1 + i * 2.4]} material={flecha}>
          <boxGeometry args={[0.14, 0.01, 1.1]} />
        </mesh>
      ))}
      <Flecha x={d.viaEntra} y={0} z={d.barreraZ + 4.5} hacia={NORTE} />
      <Flecha x={d.viaSale} y={0} z={d.barreraZ + 4.5} hacia={SUR} />
      <Talanquera x={d.viaX + 3.7} z={d.barreraZ} haciaOeste carril={d.viaEntra} d={d} />
      <Talanquera x={d.viaX - 3.7} z={d.barreraZ} haciaOeste={false} carril={d.viaSale} d={d} />
      {/* Caseta del operador */}
      <group position={[d.viaX + 6.2, 0, d.barreraZ + 0.4]}>
        <RoundedBox args={[2.4, 2.5, 2.4]} radius={0.16} smoothness={3} position={[0, 1.25, 0]} material={nucleo} castShadow receiveShadow />
        <mesh position={[-1.21, 1.55, 0]} rotation={[0, -Math.PI / 2, 0]} material={vidrio}>
          <planeGeometry args={[1.7, 0.8]} />
        </mesh>
      </group>
      {/* Jardín junto al acceso */}
      {pastoX1 - pastoX0 > 3 && z1 - z0 > 3 && (
        <RoundedBox
          args={[pastoX1 - pastoX0, 0.18, z1 - z0 - 0.6]}
          radius={0.08}
          smoothness={2}
          position={[(pastoX0 + pastoX1) / 2, 0.03, zMedio]}
          material={pasto}
          receiveShadow
        />
      )}
    </group>
  );
}

/** Núcleo de escaleras y ascensor, al lado del edificio. */
function Nucleo({ d }: { d: Distribucion }) {
  const blanco = useMat("nucleo");
  const vidrio = useMat("vidrioNucleo");
  const { fantasma } = usePiso();
  const alto = d.pisos * ALTURA_PISO + 1.4;
  const x = d.x1 + 3.4;
  const z = d.zNorte + 3.6;
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[4.6, alto, 4.8]} radius={0.12} smoothness={3} position={[0, alto / 2, 0]} material={blanco} castShadow={!fantasma} receiveShadow />
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-2.31, alto * 0.55, -1.6 + i * 0.8]} rotation={[0, -Math.PI / 2, 0]} material={vidrio}>
          <planeGeometry args={[0.36, alto * 0.7]} />
        </mesh>
      ))}
      {/* Pasarela hacia cada piso */}
      {Array.from({ length: d.pisos }, (_, i) => (
        <mesh key={i} position={[-2.8, alturaPiso(i + 1) - 0.15, 0]} material={blanco} receiveShadow>
          <boxGeometry args={[1.6, 0.3, 2.2]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------
// Maqueta completa
// ---------------------------------------------------------------------
export function Maqueta({ d, pisoVisible }: { d: Distribucion; pisoVisible?: number | null }) {
  const filtrado = pisoVisible != null && d.pisos > 1;
  return (
    <group>
      <Base d={d} />
      <Acceso d={d} />
      {Array.from({ length: d.pisos }, (_, i) => i + 1).map((piso) => (
        <PisoContexto.Provider key={piso} value={{ fantasma: filtrado && piso !== pisoVisible }}>
          <Piso d={d} piso={piso} />
        </PisoContexto.Provider>
      ))}
      {d.rampa && (
        <PisoContexto.Provider value={{ fantasma: filtrado }}>
          <RampaEspiral d={d} />
        </PisoContexto.Provider>
      )}
      {d.pisos > 1 && (
        <PisoContexto.Provider value={{ fantasma: filtrado }}>
          <Nucleo d={d} />
        </PisoContexto.Provider>
      )}
    </group>
  );
}

