import { forwardRef, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Distribucion, MEDIO_CARRIL } from "./layout";
import { texturaFachada } from "./texturas";
import { Vehiculo } from "./Vehiculo";

/**
 * Todo lo que rodea las plazas: piso, carril, barrera de entrada, postes,
 * muro, la calle con tráfico, los edificios del barrio y los cerros
 * orientales de Bogotá con la luz de Monserrate en la cima.
 */

const matPiso = new THREE.MeshStandardMaterial({ color: "#16191e", roughness: 0.92, metalness: 0.05 });
const matLote = new THREE.MeshStandardMaterial({ color: "#1d2127", roughness: 0.85, metalness: 0.1 });
const matConcreto = new THREE.MeshStandardMaterial({ color: "#3a3f46", roughness: 0.9 });
const matAmarillo = new THREE.MeshStandardMaterial({ color: "#f5c518", emissive: "#f5c518", emissiveIntensity: 0.35 });
const matBlanco = new THREE.MeshStandardMaterial({ color: "#e9ecef", emissive: "#e9ecef", emissiveIntensity: 0.25 });
const matPoste = new THREE.MeshStandardMaterial({ color: "#2a2e34", roughness: 0.6, metalness: 0.6 });
const matSodio = new THREE.MeshStandardMaterial({ color: "#ffb35c", emissive: "#ff9f43", emissiveIntensity: 6, toneMapped: false });
const matRojo = new THREE.MeshStandardMaterial({ color: "#e63946", emissive: "#e63946", emissiveIntensity: 0.6 });
const matVentana = new THREE.MeshStandardMaterial({ color: "#ffcf86", emissive: "#ffb35c", emissiveIntensity: 2.2, toneMapped: false });
const matCerro = new THREE.MeshBasicMaterial({ color: "#0c121c", fog: false });
const matMonserrate = new THREE.MeshBasicMaterial({ color: "#fff2d0", fog: false, toneMapped: false });

export const CALLE_X_OFFSET = 30;

/** Brazo de la barrera. Se levanta según `apertura` (0 a 1). */
export const Barrera = forwardRef<THREE.Group, { x: number }>(function Barrera({ x }, ref) {
  return (
    <group position={[x, 0, 0]}>
      {/* caseta del operador */}
      <group position={[0, 0, MEDIO_CARRIL + 2.4]}>
        <mesh position={[0, 1.3, 0]} material={matConcreto}>
          <boxGeometry args={[2.4, 2.6, 2.4]} />
        </mesh>
        <mesh position={[0, 1.55, -1.21]} material={matVentana}>
          <planeGeometry args={[1.6, 0.9]} />
        </mesh>
        <mesh position={[0, 2.75, 0]} material={matPoste}>
          <boxGeometry args={[2.8, 0.2, 2.8]} />
        </mesh>
      </group>
      {/* poste de la barrera */}
      <mesh position={[0, 0.55, MEDIO_CARRIL + 0.6]} material={matAmarillo}>
        <boxGeometry args={[0.45, 1.1, 0.45]} />
      </mesh>
      <group ref={ref} position={[0, 1.0, MEDIO_CARRIL + 0.6]}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[0, 0, -0.45 - i * 0.9]} material={i % 2 ? matBlanco : matRojo}>
            <boxGeometry args={[0.12, 0.12, 0.9]} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

function Poste({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.5, 0]} material={matPoste}>
        <cylinderGeometry args={[0.08, 0.12, 7, 8]} />
      </mesh>
      <mesh position={[0, 7.0, z > 0 ? -0.7 : 0.7]} material={matPoste}>
        <boxGeometry args={[0.12, 0.12, 1.5]} />
      </mesh>
      <mesh position={[0, 6.92, z > 0 ? -1.3 : 1.3]} material={matSodio}>
        <boxGeometry args={[0.5, 0.08, 0.3]} />
      </mesh>
      <pointLight position={[0, 6.6, z > 0 ? -1.3 : 1.3]} color="#ff9f43" intensity={60} distance={20} decay={1.6} />
    </group>
  );
}

function Trafico({ x }: { x: number }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const carros = useMemo(
    () => [
      { z0: -60, v: 9, carril: -1.8, color: "#c7c9cc" },
      { z0: 10, v: 11, carril: -1.8, color: "#b3202a" },
      { z0: 40, v: -10, carril: 1.8, color: "#f2c230" },
      { z0: -20, v: -8, carril: 1.8, color: "#1f4e8c" },
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
      <mesh position={[x, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={matLote}>
        <planeGeometry args={[9, 220]} />
      </mesh>
      {Array.from({ length: 30 }, (_, i) => (
        <mesh key={i} position={[x, 0.015, -105 + i * 7]} rotation={[-Math.PI / 2, 0, 0]} material={matBlanco}>
          <planeGeometry args={[0.15, 3]} />
        </mesh>
      ))}
      {carros.map((c, i) => (
        <Vehiculo
          key={i}
          ref={(g) => (refs.current[i] = g)}
          tipo="AUTOMOVIL"
          color={c.color}
          luces
          position={[x + c.carril, 0, c.z0]}
          rotation={[0, c.v > 0 ? 0 : Math.PI, 0]}
        />
      ))}
    </group>
  );
}

function Edificios({ centroX, radio }: { centroX: number; radio: number }) {
  const datos = useMemo(() => {
    const lista: { x: number; z: number; w: number; d: number; h: number; tex: THREE.Texture }[] = [];
    let s = 7;
    const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 34; i++) {
      const ang = (i / 34) * Math.PI * 2 + azar() * 0.1;
      // No se dibujan edificios frente a la entrada para no tapar la calle.
      const x = centroX + Math.cos(ang) * (radio + azar() * 30);
      const z = Math.sin(ang) * (radio * 0.8 + azar() * 30);
      if (x < centroX - radio * 0.6 && Math.abs(z) < 30) continue;
      // Hacia el oriente quedan libres para que se vean los cerros.
      if (x > centroX + radio * 0.3 && Math.abs(z) < radio * 0.7) continue;
      const w = 10 + azar() * 14;
      const d = 10 + azar() * 14;
      const h = 8 + azar() * 30;
      const tex = texturaFachada(i + 1);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 16)));
      lista.push({ x, z, w, d, h, tex });
    }
    return lista;
  }, [centroX, radio]);
  return (
    <group>
      {datos.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#0e1116" map={b.tex} emissiveMap={b.tex} emissive="#ffffff" emissiveIntensity={1.1} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Puntos de luz de la ciudad al pie de los cerros. */
function LucesCiudad() {
  const geo = useMemo(() => {
    const n = 900;
    const pos = new Float32Array(n * 3);
    let s = 3;
    const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (azar() - 0.5) * 900;
      pos[i * 3 + 1] = azar() * azar() * 22;
      pos[i * 3 + 2] = 4 + azar() * 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#ffb35c" size={1.6} sizeAttenuation fog={false} toneMapped={false} />
    </points>
  );
}

/** Perfil de los cerros orientales: una cresta suave con un pico (Monserrate). */
const alturaCerro = (u: number) =>
  32 + Math.sin(u * 0.012) * 10 + Math.sin(u * 0.031 + 1.3) * 6 + Math.sin(u * 0.083) * 2.5 + Math.exp(-((u - 40) ** 2) / 1400) * 16;

function Cerros({ x }: { x: number }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(900, 140, 120, 24);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i) + 70; // 0 abajo, 140 arriba
      const perfil = alturaCerro(u);
      pos.setY(i, Math.min(v, perfil) - 2);
      pos.setZ(i, (Math.sin(u * 0.05) + Math.cos(v * 0.07)) * 4);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  // Monserrate en la cima más alta.
  const cima = alturaCerro(40) - 2;
  return (
    <group position={[x, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh geometry={geo} material={matCerro} />
      <LucesCiudad />
      <mesh position={[40, cima + 0.8, 2]} material={matMonserrate}>
        <boxGeometry args={[3, 2.2, 2]} />
      </mesh>
      <pointLight position={[40, cima + 4, 8]} color="#fff2d0" intensity={300} distance={40} />
    </group>
  );
}

export function Entorno({ dist, barreraRef }: { dist: Distribucion; barreraRef?: React.Ref<THREE.Group> }) {
  const { minX, maxX, largo, barreraX } = dist;
  const anchoLote = 2 * (MEDIO_CARRIL + 5.2) + 3;
  const centroX = (minX + maxX) / 2;
  const postes = useMemo(() => {
    const n = Math.max(2, Math.round(largo / 14));
    return Array.from({ length: n }, (_, i) => minX + (i + 0.5) * (largo / n));
  }, [minX, largo]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={matPiso} receiveShadow>
        <planeGeometry args={[800, 800]} />
      </mesh>
      {/* superficie del parqueadero */}
      <mesh position={[centroX - 2, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={matLote}>
        <planeGeometry args={[largo + 10, anchoLote]} />
      </mesh>
      {/* línea central del carril */}
      {Array.from({ length: Math.floor(largo / 4) }, (_, i) => (
        <mesh key={i} position={[minX + 2 + i * 4, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={matAmarillo}>
          <planeGeometry args={[2, 0.14]} />
        </mesh>
      ))}
      {/* muro perimetral */}
      {[-1, 1].map((lado) => (
        <mesh key={lado} position={[centroX - 2, 0.45, lado * (anchoLote / 2)]} material={matConcreto}>
          <boxGeometry args={[largo + 10, 0.9, 0.3]} />
        </mesh>
      ))}
      <mesh position={[maxX + 3, 0.45, 0]} material={matConcreto}>
        <boxGeometry args={[0.3, 0.9, anchoLote]} />
      </mesh>
      {postes.map((x) => (
        <group key={x}>
          <Poste x={x} z={anchoLote / 2 - 0.4} />
          <Poste x={x + largo / postes.length / 2} z={-anchoLote / 2 + 0.4} />
        </group>
      ))}
      <Barrera ref={barreraRef} x={barreraX} />
      <Trafico x={barreraX - CALLE_X_OFFSET} />
      <Edificios centroX={centroX} radio={Math.max(70, largo * 1.4)} />
      <Cerros x={maxX + 300} />
    </group>
  );
}
