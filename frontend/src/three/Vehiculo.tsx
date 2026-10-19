import { forwardRef, useMemo } from "react";
import * as THREE from "three";
import { texturaPlaca } from "./texturas";

/**
 * Vehículos de bajo poligonaje construidos con primitivas.
 * Todos miran hacia +z en coordenadas locales. Las luces delanteras y
 * traseras son materiales emisivos, que el efecto de bloom hace brillar.
 */
interface Props {
  tipo: string;
  color: string;
  placa?: string | null;
  luces?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35, ...extra });

const MATS = {
  vidrio: mat("#0d1520", { roughness: 0.1, metalness: 0.9 }),
  llanta: mat("#111214", { roughness: 0.9, metalness: 0 }),
  rin: mat("#8a9099", { roughness: 0.3, metalness: 0.9 }),
  faro: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff4d6", emissiveIntensity: 4 }),
  faroApagado: mat("#d9d9d9", { roughness: 0.2 }),
  stop: new THREE.MeshStandardMaterial({ color: "#ff2a3d", emissive: "#ff1a2e", emissiveIntensity: 2.6 }),
  stopApagado: mat("#7a1018"),
  negro: mat("#15171a", { roughness: 0.8 }),
};

const geoRueda = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18);
geoRueda.rotateZ(Math.PI / 2);
const geoRuedaMoto = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 18);
geoRuedaMoto.rotateZ(Math.PI / 2);
const geoAro = new THREE.TorusGeometry(0.33, 0.035, 8, 24);
geoAro.rotateY(Math.PI / 2);

function Placa({ placa, z, y, ancho = 0.52 }: { placa: string; z: number; y: number; ancho?: number }) {
  const tex = useMemo(() => texturaPlaca(placa), [placa]);
  const atras = z < 0;
  return (
    <mesh position={[0, y, z]} rotation={[0, atras ? Math.PI : 0, 0]}>
      <planeGeometry args={[ancho, ancho / 2]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.5} />
    </mesh>
  );
}

function Automovil({ color, placa, luces }: { color: string; placa?: string | null; luces: boolean }) {
  const carroceria = useMemo(() => mat(color, { metalness: 0.55, roughness: 0.32 }), [color]);
  return (
    <group>
      {/* chasis */}
      <mesh position={[0, 0.62, 0]} material={carroceria} castShadow>
        <boxGeometry args={[1.82, 0.62, 4.3]} />
      </mesh>
      {/* cabina */}
      <mesh position={[0, 1.18, -0.25]} material={carroceria} castShadow>
        <boxGeometry args={[1.6, 0.52, 2.2]} />
      </mesh>
      {/* vidrios */}
      <mesh position={[0, 1.2, -0.25]} material={MATS.vidrio}>
        <boxGeometry args={[1.64, 0.4, 2.0]} />
      </mesh>
      <mesh position={[0, 1.16, 0.88]} rotation={[-0.7, 0, 0]} material={MATS.vidrio}>
        <boxGeometry args={[1.5, 0.05, 0.7]} />
      </mesh>
      {/* bómper */}
      <mesh position={[0, 0.42, 2.17]} material={MATS.negro}>
        <boxGeometry args={[1.84, 0.22, 0.08]} />
      </mesh>
      <mesh position={[0, 0.42, -2.17]} material={MATS.negro}>
        <boxGeometry args={[1.84, 0.22, 0.08]} />
      </mesh>
      {/* luces */}
      {[-0.66, 0.66].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.72, 2.16]} material={luces ? MATS.faro : MATS.faroApagado}>
            <boxGeometry args={[0.36, 0.14, 0.04]} />
          </mesh>
          <mesh position={[x, 0.76, -2.16]} material={luces ? MATS.stop : MATS.stopApagado}>
            <boxGeometry args={[0.42, 0.12, 0.04]} />
          </mesh>
        </group>
      ))}
      {/* ruedas */}
      {[
        [-0.86, 1.35],
        [0.86, 1.35],
        [-0.86, -1.35],
        [0.86, -1.35],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0.36, z]}>
          <mesh geometry={geoRueda} material={MATS.llanta} />
          <mesh position={[x > 0 ? 0.135 : -0.135, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MATS.rin}>
            <cylinderGeometry args={[0.2, 0.2, 0.02, 12]} />
          </mesh>
        </group>
      ))}
      {placa && <Placa placa={placa} z={-2.22} y={0.5} />}
      {placa && <Placa placa={placa} z={2.22} y={0.42} ancho={0.46} />}
    </group>
  );
}

function Motocicleta({ color, placa, luces }: { color: string; placa?: string | null; luces: boolean }) {
  const pintura = useMemo(() => mat(color, { metalness: 0.6, roughness: 0.3 }), [color]);
  return (
    <group>
      <mesh position={[0, 0.32, 0.72]} geometry={geoRuedaMoto} material={MATS.llanta} />
      <mesh position={[0, 0.32, -0.72]} geometry={geoRuedaMoto} material={MATS.llanta} />
      <mesh position={[0, 0.62, 0.05]} rotation={[0.08, 0, 0]} material={pintura} castShadow>
        <boxGeometry args={[0.34, 0.36, 1.1]} />
      </mesh>
      <mesh position={[0, 0.86, -0.32]} material={MATS.negro}>
        <boxGeometry args={[0.3, 0.1, 0.62]} />
      </mesh>
      <mesh position={[0, 0.98, 0.62]} rotation={[0, 0, Math.PI / 2]} material={MATS.rin}>
        <cylinderGeometry args={[0.025, 0.025, 0.72, 6]} />
      </mesh>
      <mesh position={[0, 0.82, 0.78]} material={luces ? MATS.faro : MATS.faroApagado}>
        <sphereGeometry args={[0.08, 10, 10]} />
      </mesh>
      <mesh position={[0, 0.74, -0.66]} material={luces ? MATS.stop : MATS.stopApagado}>
        <boxGeometry args={[0.16, 0.06, 0.04]} />
      </mesh>
      {placa && <Placa placa={placa} z={-0.74} y={0.58} ancho={0.3} />}
    </group>
  );
}

function Bicicleta({ color }: { color: string }) {
  const marco = useMemo(() => mat(color, { metalness: 0.7, roughness: 0.3 }), [color]);
  return (
    <group>
      <mesh position={[0, 0.36, 0.55]} geometry={geoAro} material={MATS.llanta} />
      <mesh position={[0, 0.36, -0.55]} geometry={geoAro} material={MATS.llanta} />
      <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]} material={marco}>
        <cylinderGeometry args={[0.035, 0.035, 1.05, 6]} />
      </mesh>
      <mesh position={[0, 0.5, -0.2]} rotation={[0.5, 0, 0]} material={marco}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 6]} />
      </mesh>
      <mesh position={[0, 0.86, -0.32]} material={MATS.negro}>
        <boxGeometry args={[0.12, 0.05, 0.24]} />
      </mesh>
      <mesh position={[0, 0.9, 0.48]} rotation={[0, 0, Math.PI / 2]} material={MATS.rin}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
      </mesh>
    </group>
  );
}

export const Vehiculo = forwardRef<THREE.Group, Props>(function Vehiculo(
  { tipo, color, placa, luces = false, position, rotation },
  ref
) {
  return (
    <group ref={ref} position={position} rotation={rotation}>
      {tipo === "MOTOCICLETA" ? (
        <Motocicleta color={color} placa={placa} luces={luces} />
      ) : tipo === "BICICLETA" ? (
        <Bicicleta color={color} />
      ) : (
        <Automovil color={color} placa={placa} luces={luces} />
      )}
    </group>
  );
});
