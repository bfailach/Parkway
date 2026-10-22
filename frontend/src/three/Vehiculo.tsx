import { forwardRef, useMemo } from "react";
import * as THREE from "three";
import { texturaPlaca, texturaSombra } from "./texturas";
import { ModeloCarro, modeloCarro, ModeloMoto, modeloMoto } from "./modelos";
import { PaletaEscena, usePaleta } from "./tema";

/**
 * Vehículos de la escena, con formas suaves al estilo de los íconos de
 * carros de las apps de transporte.
 *
 * Los carros se construyen extruyendo la silueta lateral del modelo más
 * conocido de la marca (modelos.ts): la carrocería, la cabina y los
 * vidrios. Las geometrías se calculan una vez por modelo y se comparten
 * entre todos los vehículos iguales. Todos miran hacia +z.
 */
interface Props {
  tipo: string;
  color: string;
  marca?: string | null;
  placa?: string | null;
  luces?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

// ---------------------------------------------------------------------
// Materiales compartidos (por paleta y por color)
// ---------------------------------------------------------------------
const cacheMateriales = new Map<string, THREE.Material>();
function material(clave: string, crear: () => THREE.Material) {
  let m = cacheMateriales.get(clave);
  if (!m) {
    m = crear();
    cacheMateriales.set(clave, m);
  }
  return m;
}

const pintura = (color: string) =>
  material(`pintura-${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.25 }));

function materiales(p: PaletaEscena) {
  const k = p.claro ? "c" : "o";
  return {
    vidrio: material(`vidrio-${k}`, () => new THREE.MeshPhysicalMaterial({ color: p.vidrio, roughness: 0.08, metalness: 0.3, clearcoat: 1, side: THREE.DoubleSide })),
    llanta: material(`llanta-${k}`, () => new THREE.MeshStandardMaterial({ color: p.llanta, roughness: 0.85 })),
    rin: material(`rin-${k}`, () => new THREE.MeshStandardMaterial({ color: p.rin, roughness: 0.3, metalness: 0.85 })),
    interior: material(`interior-${k}`, () => new THREE.MeshStandardMaterial({ color: p.interior, roughness: 0.8 })),
    faro: material("faro", () => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6e0", emissiveIntensity: 3.2 })),
    faroApagado: material(`faroApagado-${k}`, () => new THREE.MeshStandardMaterial({ color: "#e9edf1", roughness: 0.15, metalness: 0.4 })),
    stop: material("stop", () => new THREE.MeshStandardMaterial({ color: "#ff2a3d", emissive: "#ff1a2e", emissiveIntensity: 2.4 })),
    stopApagado: material("stopApagado", () => new THREE.MeshStandardMaterial({ color: "#8c1520", roughness: 0.3 })),
    sombra: material(`sombra-${k}`, () => new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, opacity: p.sombra, depthWrite: false, color: "#000000" })),
  };
}

// ---------------------------------------------------------------------
// Geometrías de los carros
// ---------------------------------------------------------------------
const BISEL = 0.07;
const cacheGeometrias = new Map<string, ReturnType<typeof construirCarro>>();

/** Curva suave que pasa por los puntos del perfil. */
function suavizar(puntos: [number, number][], n: number, cerrada = false) {
  const curva = new THREE.CatmullRomCurve3(
    puntos.map(([z, y]) => new THREE.Vector3(z, y, 0)),
    cerrada,
    "centripetal"
  );
  return curva.getPoints(n).map((v) => new THREE.Vector2(v.x, v.y));
}

/** Extruye una forma dibujada en el plano (z, y) a lo ancho del vehículo (x). */
function extruir(forma: THREE.Shape, ancho: number, bisel = BISEL) {
  const g = new THREE.ExtrudeGeometry(forma, {
    depth: Math.max(0.01, ancho - 2 * bisel),
    bevelEnabled: true,
    bevelThickness: bisel,
    bevelSize: bisel,
    bevelSegments: 3,
    curveSegments: 16,
  });
  g.translate(0, 0, -(ancho - 2 * bisel) / 2);
  g.rotateY(-Math.PI / 2); // x de la forma -> z del mundo
  g.computeVertexNormals();
  return g;
}

/** Vidrio plano entre dos puntos del contorno de la cabina, hacia afuera. */
function panel(a: [number, number], b: [number, number], centro: THREE.Vector2, ancho: number) {
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo = Math.hypot(dz, dy);
  let n = new THREE.Vector2(dy, -dz).normalize(); // perpendicular en (z, y)
  const medio = new THREE.Vector2((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  if (n.dot(medio.clone().sub(centro)) < 0) n = n.multiplyScalar(-1);
  const pos = medio.add(n.multiplyScalar(0.035 + BISEL * 0.5));
  return {
    posicion: [0, pos.y, pos.x] as [number, number, number],
    rotacion: Math.atan2(dz, dy),
    ancho,
    alto: largo * 0.84,
  };
}

function construirCarro(m: ModeloCarro) {
  const r = m.radioRueda;
  const arco = r + 0.13; // el bisel achica el arco 7 cm

  // Carrocería: perfil superior suave + piso con los arcos de las ruedas.
  const arriba = suavizar(m.perfil, 60);
  const forma = new THREE.Shape();
  forma.moveTo(arriba[0].x, arriba[0].y);
  arriba.slice(1).forEach((p) => forma.lineTo(p.x, p.y));
  const atras = arriba[arriba.length - 1];
  forma.lineTo(atras.x, m.piso);
  forma.lineTo(m.ejeTrasero - arco, m.piso);
  forma.absarc(m.ejeTrasero, r, arco, Math.PI, 0, true);
  forma.lineTo(m.ejeDelantero - arco, m.piso);
  forma.absarc(m.ejeDelantero, r, arco, Math.PI, 0, true);
  forma.lineTo(arriba[0].x, m.piso);
  forma.closePath();
  const carroceria = extruir(forma, m.ancho);

  const frente = Math.max(...m.perfil.map((p) => p[0]));
  const cola = Math.min(...m.perfil.map((p) => p[0]));

  // Cabina, techo y vidrios
  let cabina: THREE.BufferGeometry | null = null;
  let ventanas: THREE.BufferGeometry | null = null;
  let paneles: ReturnType<typeof panel>[] = [];
  let parales: { z: number; y: number; alto: number }[] = [];
  const anchoCabina = m.ancho * 0.84;
  if (m.cabina) {
    const contorno = m.cabinaCurva ? suavizar(m.cabina, 40, true) : m.cabina.map(([z, y]) => new THREE.Vector2(z, y));
    const fc = new THREE.Shape(contorno);
    cabina = extruir(fc, anchoCabina, 0.05);

    // Ventanas laterales: la cabina reducida hacia su centro.
    const centro = contorno.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / contorno.length);
    const reducida = contorno.map((p) => new THREE.Vector2(centro.x + (p.x - centro.x) * 0.86, centro.y + (p.y - centro.y) * 0.72 + 0.02));
    ventanas = extruir(new THREE.Shape(reducida), anchoCabina + 0.03, 0.005);

    const c = m.cabina;
    paneles = [panel(c[0], c[1], centro, anchoCabina * 0.86), panel(c[2], c[3], centro, anchoCabina * 0.86)];
    const altoVentana = (Math.max(...reducida.map((p) => p.y)) - Math.min(...reducida.map((p) => p.y))) * 0.98;
    parales = [{ z: (c[1][0] + c[2][0]) / 2, y: centro.y + 0.02, alto: altoVentana }];
  }

  return { carroceria, cabina, ventanas, paneles, parales, anchoCabina, frente, cola };
}

function geometriaCarro(m: ModeloCarro) {
  let g = cacheGeometrias.get(m.id);
  if (!g) {
    g = construirCarro(m);
    cacheGeometrias.set(m.id, g);
  }
  return g;
}

const geoRueda = new Map<number, THREE.CylinderGeometry>();
function rueda(r: number) {
  let g = geoRueda.get(r);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r, 0.26, 28);
    g.rotateZ(Math.PI / 2);
    geoRueda.set(r, g);
  }
  return g;
}
const geoRin = new THREE.CylinderGeometry(1, 1, 0.02, 24).rotateZ(Math.PI / 2);
const geoFaroRedondo = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20).rotateX(Math.PI / 2);
const geoSombra = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function Placa({ placa, z, y, ancho = 0.52, atras }: { placa: string; z: number; y: number; ancho?: number; atras: boolean }) {
  const tex = useMemo(() => texturaPlaca(placa), [placa]);
  return (
    <mesh position={[0, y, z]} rotation={[0, atras ? Math.PI : 0, 0]}>
      <planeGeometry args={[ancho, ancho / 2]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.3} roughness={0.5} />
    </mesh>
  );
}

function Sombra({ largo, ancho }: { largo: number; ancho: number }) {
  const p = usePaleta();
  return <mesh geometry={geoSombra} material={materiales(p).sombra} position={[0, 0.015, 0]} scale={[ancho * 1.5, 1, largo * 1.25]} />;
}

function Automovil({ color, marca, placa, luces }: { color: string; marca?: string | null; placa?: string | null; luces: boolean }) {
  const p = usePaleta();
  const mat = materiales(p);
  const m = modeloCarro(marca);
  const g = geometriaCarro(m);
  const cuerpo = pintura(color);
  const xRueda = m.ancho / 2 - 0.16;
  const extras = m.extras ?? [];
  const faro = luces ? mat.faro : mat.faroApagado;
  const stop = luces ? mat.stop : mat.stopApagado;

  return (
    <group>
      <Sombra largo={g.frente - g.cola} ancho={m.ancho} />
      <mesh geometry={g.carroceria} material={cuerpo} />
      {g.cabina && <mesh geometry={g.cabina} material={cuerpo} />}
      {g.ventanas && <mesh geometry={g.ventanas} material={mat.vidrio} />}
      {g.paneles.map((v, i) => (
        <mesh key={i} position={v.posicion} rotation={[v.rotacion, 0, 0]} material={mat.vidrio}>
          <planeGeometry args={[v.ancho, v.alto]} />
        </mesh>
      ))}
      {g.parales.map((pa, i) => (
        <mesh key={i} position={[0, pa.y, pa.z]} material={cuerpo}>
          <boxGeometry args={[g.anchoCabina + 0.05, pa.alto, 0.09]} />
        </mesh>
      ))}

      {/* Descapotable (MX-5): parabrisas, cabina abierta y arcos */}
      {extras.includes("descapotable") && (
        <group>
          <mesh position={[0, 0.98, 0.2]} rotation={[-0.95, 0, 0]} material={mat.vidrio}>
            <planeGeometry args={[m.ancho * 0.8, 0.48]} />
          </mesh>
          <mesh position={[0, 0.83, -0.42]} material={mat.interior}>
            <boxGeometry args={[m.ancho * 0.68, 0.06, 1.1]} />
          </mesh>
          {[-0.36, 0.36].map((x) => (
            <mesh key={x} position={[x, 0.98, -0.7]} material={mat.interior}>
              <boxGeometry args={[0.44, 0.34, 0.12]} />
            </mesh>
          ))}
        </group>
      )}
      {extras.includes("aleron") && (
        <group position={[0, 1.18, g.cola + 0.3]}>
          {[-0.55, 0.55].map((x) => (
            <mesh key={x} position={[x, -0.1, 0]} material={cuerpo}>
              <boxGeometry args={[0.06, 0.22, 0.12]} />
            </mesh>
          ))}
          <mesh material={cuerpo}>
            <boxGeometry args={[m.ancho * 0.92, 0.05, 0.32]} />
          </mesh>
        </group>
      )}
      {extras.includes("repuesto") && (
        <group position={[0, 0.95, g.cola - 0.12]}>
          <mesh geometry={rueda(0.34)} rotation={[0, Math.PI / 2, 0]} material={mat.llanta} />
          <mesh geometry={geoRin} rotation={[0, Math.PI / 2, 0]} position={[0, 0, -0.14]} scale={[1, 0.2, 0.2]} material={cuerpo} />
        </group>
      )}
      {extras.includes("barras") && m.cabina && (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * g.anchoCabina * 0.4, m.cabina![1][1] + 0.1, (m.cabina![1][0] + m.cabina![2][0]) / 2]} material={mat.rin}>
              <boxGeometry args={[0.05, 0.05, Math.abs(m.cabina![1][0] - m.cabina![2][0]) * 0.92]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Faros y stops */}
      {[-1, 1].map((s) => (
        <group key={s}>
          {m.faros === "redondos" ? (
            <mesh geometry={geoFaroRedondo} position={[s * m.ancho * 0.3, m.alturaFaros, g.frente - 0.04]} material={faro} />
          ) : (
            <mesh position={[s * m.ancho * 0.31, m.alturaFaros, g.frente - 0.05]} material={faro}>
              <boxGeometry args={[0.42, 0.09, 0.08]} />
            </mesh>
          )}
          {extras.includes("stopsRedondos") ? (
            [0.26, 0.5].map((d) => <mesh key={d} geometry={geoFaroRedondo} position={[s * d * m.ancho * 0.9, m.alturaStops, g.cola + 0.03]} material={stop} />)
          ) : (
            <mesh position={[s * m.ancho * 0.33, m.alturaStops, g.cola + 0.04]} material={stop}>
              <boxGeometry args={[0.44, 0.08, 0.08]} />
            </mesh>
          )}
        </group>
      ))}

      {/* Ruedas */}
      {[m.ejeDelantero, m.ejeTrasero].flatMap((z) =>
        [-1, 1].map((s) => (
          <group key={`${z}${s}`} position={[s * xRueda, m.radioRueda, z]}>
            <mesh geometry={rueda(m.radioRueda)} material={mat.llanta} />
            <mesh geometry={geoRin} position={[s * 0.135, 0, 0]} scale={[1, m.radioRueda * 0.62, m.radioRueda * 0.62]} material={mat.rin} />
          </group>
        ))
      )}

      {placa && <Placa placa={placa} z={g.cola - 0.02} y={0.5} atras />}
      {placa && <Placa placa={placa} z={g.frente + 0.02} y={0.42} ancho={0.46} atras={false} />}
    </group>
  );
}

// ---------------------------------------------------------------------
// Motocicletas
// ---------------------------------------------------------------------
const cacheMotos = new Map<ModeloMoto, THREE.BufferGeometry>();
const PERFIL_MOTO: Record<ModeloMoto, [number, number][]> = {
  // carenado completo, cola levantada
  deportiva: [[0.78, 0.62], [0.62, 0.98], [0.2, 0.92], [-0.1, 0.86], [-0.55, 0.98], [-0.78, 0.92], [-0.5, 0.62], [0.1, 0.42], [0.6, 0.44]],
  // tanque grande, motor a la vista
  naked: [[0.42, 0.78], [0.3, 0.96], [-0.05, 0.94], [-0.3, 0.84], [-0.7, 0.86], [-0.74, 0.78], [-0.3, 0.7], [0.2, 0.66]],
  // tanque pequeño y silla larga
  urbana: [[0.36, 0.76], [0.26, 0.9], [0.0, 0.88], [-0.25, 0.82], [-0.78, 0.82], [-0.8, 0.75], [-0.25, 0.7], [0.18, 0.66]],
};
function geometriaMoto(m: ModeloMoto) {
  let g = cacheMotos.get(m);
  if (!g) {
    const puntos = suavizar(PERFIL_MOTO[m], 40, true);
    g = extruir(new THREE.Shape(puntos), m === "deportiva" ? 0.42 : 0.36, 0.06);
    cacheMotos.set(m, g);
  }
  return g;
}
const geoTorusMoto = new THREE.TorusGeometry(0.27, 0.075, 14, 32).rotateY(Math.PI / 2);
const geoDiscoMoto = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20).rotateZ(Math.PI / 2);

function Motocicleta({ color, marca, placa, luces }: { color: string; marca?: string | null; placa?: string | null; luces: boolean }) {
  const p = usePaleta();
  const mat = materiales(p);
  const modelo = modeloMoto(marca);
  const cuerpo = pintura(color);
  return (
    <group>
      <Sombra largo={1.9} ancho={0.6} />
      {[0.72, -0.72].map((z) => (
        <group key={z} position={[0, 0.34, z]}>
          <mesh geometry={geoTorusMoto} material={mat.llanta} />
          <mesh geometry={geoDiscoMoto} material={mat.rin} />
        </group>
      ))}
      <mesh geometry={geometriaMoto(modelo)} material={cuerpo} />
      {/* silla */}
      <mesh position={[0, modelo === "deportiva" ? 0.93 : 0.9, -0.38]} material={mat.interior}>
        <boxGeometry args={[0.28, 0.07, modelo === "urbana" ? 0.62 : 0.42]} />
      </mesh>
      {/* motor y horquilla */}
      {modelo !== "deportiva" && (
        <mesh position={[0, 0.52, 0.05]} material={mat.interior}>
          <boxGeometry args={[0.3, 0.3, 0.42]} />
        </mesh>
      )}
      <mesh position={[0, 0.66, 0.62]} rotation={[0.42, 0, 0]} material={mat.rin}>
        <cylinderGeometry args={[0.03, 0.03, 0.66, 8]} />
      </mesh>
      {/* manubrio */}
      <mesh position={[0, modelo === "deportiva" ? 0.9 : 1.02, 0.5]} rotation={[0, 0, Math.PI / 2]} material={mat.interior}>
        <cylinderGeometry args={[0.022, 0.022, modelo === "deportiva" ? 0.56 : 0.74, 8]} />
      </mesh>
      {modelo === "deportiva" && (
        <mesh position={[0, 1.02, 0.56]} rotation={[-0.9, 0, 0]} material={mat.vidrio}>
          <planeGeometry args={[0.3, 0.26]} />
        </mesh>
      )}
      <mesh position={[0, modelo === "deportiva" ? 0.76 : 0.88, modelo === "deportiva" ? 0.8 : 0.62]} material={luces ? mat.faro : mat.faroApagado}>
        <sphereGeometry args={[0.075, 14, 14]} />
      </mesh>
      <mesh position={[0, 0.84, -0.8]} material={luces ? mat.stop : mat.stopApagado}>
        <boxGeometry args={[0.14, 0.05, 0.04]} />
      </mesh>
      {placa && <Placa placa={placa} z={-0.84} y={0.62} ancho={0.28} atras />}
    </group>
  );
}

// ---------------------------------------------------------------------
// Bicicletas (sin placa)
// ---------------------------------------------------------------------
const geoTorusBici = new THREE.TorusGeometry(0.33, 0.028, 10, 36).rotateY(Math.PI / 2);
const geoRadios = new THREE.CircleGeometry(0.31, 24).rotateY(Math.PI / 2);

function Tubo({ a, b, r, material: m }: { a: [number, number]; b: [number, number]; r: number; material: THREE.Material }) {
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo = Math.hypot(dz, dy);
  return (
    <mesh position={[0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2]} rotation={[Math.atan2(dz, dy), 0, 0]} material={m}>
      <cylinderGeometry args={[r, r, largo, 8]} />
    </mesh>
  );
}

function Bicicleta({ color }: { color: string }) {
  const p = usePaleta();
  const mat = materiales(p);
  const marco = pintura(color);
  const radios = useMemo(
    () => new THREE.MeshBasicMaterial({ color: p.claro ? "#9aa2ac" : "#5c6570", transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    [p.claro]
  );
  // puntos del marco en (z, y)
  const eje: [number, number] = [-0.02, 0.38];
  const sillin: [number, number] = [-0.2, 0.86];
  const direccion: [number, number] = [0.42, 0.86];
  return (
    <group>
      <Sombra largo={1.7} ancho={0.4} />
      {[0.55, -0.55].map((z) => (
        <group key={z} position={[0, 0.36, z]}>
          <mesh geometry={geoTorusBici} material={mat.llanta} />
          <mesh geometry={geoRadios} material={radios} />
        </group>
      ))}
      <Tubo a={eje} b={sillin} r={0.026} material={marco} />
      <Tubo a={eje} b={direccion} r={0.03} material={marco} />
      <Tubo a={sillin} b={direccion} r={0.026} material={marco} />
      <Tubo a={eje} b={[-0.55, 0.36]} r={0.018} material={marco} />
      <Tubo a={sillin} b={[-0.55, 0.36]} r={0.018} material={marco} />
      <Tubo a={direccion} b={[0.55, 0.36]} r={0.022} material={marco} />
      <mesh position={[0, 0.92, -0.22]} material={mat.interior}>
        <boxGeometry args={[0.12, 0.05, 0.24]} />
      </mesh>
      <mesh position={[0, 0.98, 0.44]} rotation={[0, 0, Math.PI / 2]} material={mat.interior}>
        <cylinderGeometry args={[0.018, 0.018, 0.52, 8]} />
      </mesh>
    </group>
  );
}

export const Vehiculo = forwardRef<THREE.Group, Props>(function Vehiculo(
  { tipo, color, marca, placa, luces = false, position, rotation },
  ref
) {
  return (
    <group ref={ref} position={position} rotation={rotation}>
      {tipo === "MOTOCICLETA" ? (
        <Motocicleta color={color} marca={marca} placa={placa} luces={luces} />
      ) : tipo === "BICICLETA" ? (
        <Bicicleta color={color} />
      ) : (
        <Automovil color={color} marca={marca} placa={placa} luces={luces} />
      )}
    </group>
  );
});
