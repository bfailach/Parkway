import { forwardRef, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { Distribucion, MEDIO_CARRIL } from "./layout";
import { Vehiculo } from "./Vehiculo";
import { PaletaEscena, usePaleta } from "./tema";

/**
 * Todo lo que rodea las plazas, con el aspecto de una maqueta de
 * presentación: superficies mate de un solo tono, bordes redondeados y
 * pocos elementos. Piso, lote con sus carriles, barrera y caseta, postes
 * de luz, la calle con algo de tráfico, manzanas de edificios, árboles y
 * los cerros orientales de Bogotá con Monserrate.
 */
export const CALLE_X_OFFSET = 30;

const cache = new Map<boolean, ReturnType<typeof crear>>();
function crear(p: PaletaEscena) {
  return {
    suelo: new THREE.MeshStandardMaterial({ color: p.suelo, roughness: 0.95 }),
    lote: new THREE.MeshStandardMaterial({ color: p.lote, roughness: 0.9 }),
    linea: new THREE.MeshStandardMaterial({ color: p.linea, emissive: p.linea, emissiveIntensity: p.lineaBrillo, roughness: 0.6 }),
    muro: new THREE.MeshStandardMaterial({ color: p.muro, roughness: 0.85 }),
    edificio: new THREE.MeshStandardMaterial({ color: p.edificio, roughness: 0.9 }),
    edificioAcento: new THREE.MeshStandardMaterial({ color: p.edificioAcento, roughness: 0.9 }),
    cerro: new THREE.MeshStandardMaterial({ color: p.cerro, roughness: 1 }),
    arbol: new THREE.MeshStandardMaterial({ color: p.arbol, roughness: 0.9 }),
    tronco: new THREE.MeshStandardMaterial({ color: p.tronco, roughness: 0.9 }),
    vidrio: new THREE.MeshStandardMaterial({ color: p.vidrio, roughness: 0.15, metalness: 0.4 }),
    poste: new THREE.MeshStandardMaterial({ color: p.claro ? "#b8c0ca" : "#2a2f36", roughness: 0.4, metalness: 0.6 }),
    luz: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#eef4ff", emissiveIntensity: p.claro ? 0.6 : 3, toneMapped: false }),
    rojo: new THREE.MeshStandardMaterial({ color: "#e63946", roughness: 0.5 }),
    blanco: new THREE.MeshStandardMaterial({ color: "#f3f4f6", roughness: 0.5 }),
    amarillo: new THREE.MeshStandardMaterial({ color: "#f5c518", roughness: 0.5 }),
    monserrate: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff3d6", emissiveIntensity: p.claro ? 0.2 : 2, toneMapped: false }),
  };
}
function useMats() {
  const p = usePaleta();
  let m = cache.get(p.claro);
  if (!m) {
    m = crear(p);
    cache.set(p.claro, m);
  }
  return m;
}

/** Barrera de entrada con la caseta del operador. */
export const Barrera = forwardRef<THREE.Group, { x: number }>(function Barrera({ x }, ref) {
  const m = useMats();
  return (
    <group position={[x, 0, 0]}>
      <group position={[0, 0, MEDIO_CARRIL + 2.4]}>
        <RoundedBox args={[2.4, 2.6, 2.4]} radius={0.18} smoothness={3} position={[0, 1.3, 0]} material={m.muro} />
        <mesh position={[0, 1.6, -1.21]} material={m.vidrio}>
          <planeGeometry args={[1.8, 0.8]} />
        </mesh>
      </group>
      <RoundedBox args={[0.42, 1.1, 0.42]} radius={0.08} smoothness={2} position={[0, 0.55, MEDIO_CARRIL + 0.6]} material={m.amarillo} />
      <group ref={ref} position={[0, 1.0, MEDIO_CARRIL + 0.6]}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[0, 0, -0.45 - i * 0.9]} material={i % 2 ? m.blanco : m.rojo}>
            <boxGeometry args={[0.1, 0.1, 0.9]} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

function Poste({ x, z }: { x: number; z: number }) {
  const m = useMats();
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.2, 0]} material={m.poste}>
        <cylinderGeometry args={[0.06, 0.08, 6.4, 10]} />
      </mesh>
      <mesh position={[0, 6.45, z > 0 ? -0.5 : 0.5]} material={m.luz}>
        <boxGeometry args={[0.18, 0.06, 1.0]} />
      </mesh>
    </group>
  );
}

function Trafico({ x }: { x: number }) {
  const m = useMats();
  const refs = useRef<(THREE.Group | null)[]>([]);
  const carros = useMemo(
    () => [
      { z0: -60, v: 8, carril: -1.8, color: "#eef0f2", marca: "Toyota" },
      { z0: 10, v: 10, carril: -1.8, color: "#c42a33", marca: "Mazda" },
      { z0: 40, v: -9, carril: 1.8, color: "#efc22f", marca: "Renault" },
      { z0: -20, v: -7, carril: 1.8, color: "#2858a8", marca: "Volkswagen" },
    ],
    []
  );
  useFrame(({ clock }) => {
    carros.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const recorrido = 200;
      let z = (c.z0 + clock.elapsedTime * c.v) % recorrido;
      if (z > recorrido / 2) z -= recorrido;
      if (z < -recorrido / 2) z += recorrido;
      g.position.z = z;
    });
  });
  return (
    <group>
      <mesh position={[x, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.lote}>
        <planeGeometry args={[9, 240]} />
      </mesh>
      {Array.from({ length: 34 }, (_, i) => (
        <mesh key={i} position={[x, 0.014, -118 + i * 7]} rotation={[-Math.PI / 2, 0, 0]} material={m.linea}>
          <planeGeometry args={[0.12, 3]} />
        </mesh>
      ))}
      {carros.map((c, i) => (
        <Vehiculo
          key={i}
          ref={(g) => (refs.current[i] = g)}
          tipo="AUTOMOVIL"
          color={c.color}
          marca={c.marca}
          luces
          position={[x + c.carril, 0, c.z0]}
          rotation={[0, c.v > 0 ? 0 : Math.PI, 0]}
        />
      ))}
    </group>
  );
}

/** Manzanas de la maqueta: bloques mate redondeados, sin ventanas. */
function Manzanas({ centroX, centroZ, radio }: { centroX: number; centroZ: number; radio: number }) {
  const m = useMats();
  const datos = useMemo(() => {
    const lista: { x: number; z: number; w: number; d: number; h: number; acento: boolean }[] = [];
    let s = 11;
    const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const paso = 26;
    for (let gx = -6; gx <= 6; gx++) {
      for (let gz = -6; gz <= 6; gz++) {
        const x = centroX + gx * paso;
        const z = centroZ + gz * paso;
        const dx = (x - centroX) / radio;
        const dz = (z - centroZ) / (radio * 0.8);
        const d = Math.hypot(dx, dz);
        if (d < 1 || d > 2.6) continue; // deja libre el lote
        if (x < centroX - radio * 0.7 && Math.abs(z) < 26) continue; // la calle de la entrada
        if (x > centroX + radio * 0.4 && Math.abs(z - centroZ) < radio * 0.9) continue; // vista a los cerros
        const n = 1 + Math.floor(azar() * 3);
        for (let k = 0; k < n; k++) {
          const w = 7 + azar() * 9;
          const dd = 7 + azar() * 9;
          lista.push({
            x: x + (azar() - 0.5) * 8,
            z: z + (azar() - 0.5) * 8,
            w,
            d: dd,
            h: 4 + Math.pow(azar(), 1.6) * 34 * Math.max(0.35, 1.6 - d * 0.4),
            acento: azar() < 0.25,
          });
        }
      }
    }
    return lista;
  }, [centroX, centroZ, radio]);
  return (
    <group>
      {datos.map((b, i) => (
        <RoundedBox key={i} args={[b.w, b.h, b.d]} radius={0.6} smoothness={2} position={[b.x, b.h / 2, b.z]} material={b.acento ? m.edificioAcento : m.edificio} />
      ))}
    </group>
  );
}

function Arboles({ puntos }: { puntos: [number, number, number][] }) {
  const m = useMats();
  return (
    <group>
      {puntos.map(([x, z, e], i) => (
        <group key={i} position={[x, 0, z]} scale={e}>
          <mesh position={[0, 0.9, 0]} material={m.tronco}>
            <cylinderGeometry args={[0.12, 0.16, 1.8, 8]} />
          </mesh>
          <mesh position={[0, 2.6, 0]} material={m.arbol}>
            <sphereGeometry args={[1.25, 18, 14]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Perfil de los cerros orientales: una cresta suave con un pico (Monserrate). */
const alturaCerro = (u: number) =>
  30 + Math.sin(u * 0.012) * 9 + Math.sin(u * 0.031 + 1.3) * 5 + Math.exp(-((u - 40) ** 2) / 1400) * 16;

function Cerros({ x }: { x: number }) {
  const m = useMats();
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(900, 140, 90, 18);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i) + 70;
      pos.setY(i, Math.min(v, alturaCerro(u)) - 2);
      pos.setZ(i, Math.sin(u * 0.04) * 3);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const cima = alturaCerro(40) - 2;
  return (
    <group position={[x, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh geometry={geo} material={m.cerro} />
      <mesh position={[40, cima + 0.9, 2]} material={m.monserrate}>
        <boxGeometry args={[3, 2.2, 2]} />
      </mesh>
      <mesh position={[40, cima + 2.6, 2]} material={m.monserrate}>
        <coneGeometry args={[0.7, 1.8, 4]} />
      </mesh>
    </group>
  );
}

export function Entorno({ dist, barreraRef }: { dist: Distribucion; barreraRef?: React.Ref<THREE.Group> }) {
  const m = useMats();
  const { minX, maxX, largo, barreraX, carriles, zNorte, zSur } = dist;
  const centroX = (minX + maxX) / 2;
  const profundo = zSur - zNorte;
  const centroZ = (zSur + zNorte) / 2;
  const anchoLote = largo + 10;
  const loteX = centroX - 2;

  const postes = useMemo(() => {
    const n = Math.max(2, Math.round(largo / 16));
    return Array.from({ length: n }, (_, i) => minX + (i + 0.5) * (largo / n));
  }, [minX, largo]);

  const arboles = useMemo(() => {
    const lista: [number, number, number][] = [];
    const n = Math.max(4, Math.round(largo / 9));
    for (let i = 0; i < n; i++) {
      const x = minX + (i + 0.5) * (largo / n);
      lista.push([x, zSur + 3.2, 0.9 + (i % 3) * 0.12]);
      lista.push([x + 3, zNorte - 3.2, 0.85 + (i % 2) * 0.15]);
    }
    return lista;
  }, [minX, largo, zNorte, zSur]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={m.suelo} position={[0, -0.01, 0]}>
        <planeGeometry args={[900, 900]} />
      </mesh>
      {/* lote con bordes redondeados */}
      <RoundedBox args={[anchoLote, 0.06, profundo]} radius={0.03} smoothness={2} position={[loteX, -0.025, centroZ]} material={m.lote} />
      {/* línea central discontinua de cada carril */}
      {carriles.map((zc) =>
        Array.from({ length: Math.floor(largo / 4) }, (_, i) => (
          <mesh key={`${zc}-${i}`} position={[minX + 2 + i * 4, 0.035, zc]} rotation={[-Math.PI / 2, 0, 0]} material={m.linea}>
            <planeGeometry args={[1.6, 0.1]} />
          </mesh>
        ))
      )}
      {/* islas entre carriles */}
      {carriles.slice(1).map((zc) => (
        <RoundedBox key={zc} args={[largo, 0.16, 1.0]} radius={0.06} smoothness={2} position={[centroX, 0.08, zc + MEDIO_CARRIL + 5.2 + 0.6]} material={m.muro} />
      ))}
      {/* muros bajos */}
      {[zSur, zNorte].map((z) => (
        <RoundedBox key={z} args={[anchoLote, 0.7, 0.3]} radius={0.1} smoothness={2} position={[loteX, 0.35, z]} material={m.muro} />
      ))}
      <RoundedBox args={[0.3, 0.7, profundo]} radius={0.1} smoothness={2} position={[maxX + 3, 0.35, centroZ]} material={m.muro} />
      {carriles.length > 1 && (
        <RoundedBox args={[0.3, 0.7, profundo - MEDIO_CARRIL * 2 - 1.5]} radius={0.1} smoothness={2} position={[minX - 7, 0.35, centroZ - MEDIO_CARRIL]} material={m.muro} />
      )}
      {postes.map((x) => (
        <group key={x}>
          <Poste x={x} z={zSur - 0.4} />
          <Poste x={x + largo / postes.length / 2} z={zNorte + 0.4} />
        </group>
      ))}
      <Barrera ref={barreraRef} x={barreraX} />
      <Trafico x={barreraX - CALLE_X_OFFSET} />
      <Arboles puntos={arboles} />
      <Manzanas centroX={centroX} centroZ={centroZ} radio={Math.max(60, largo * 1.15, profundo * 1.1)} />
      <Cerros x={maxX + 300} />
    </group>
  );
}
