import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { colorVehiculo, Plaza } from "./layout";
import { Vehiculo } from "./Vehiculo";

/**
 * Plazas del parqueadero: líneas de demarcación, testigo de estado al
 * fondo de cada plaza y el vehículo si está ocupada. Cuando una plaza pasa
 * de libre a ocupada, el vehículo entra desde el carril; cuando se libera,
 * sale hacia el carril.
 */

const COLOR_ESTADO: Record<string, string> = {
  LIBRE: "#3ddc97",
  OCUPADO: "#ff4d5e",
  RESERVADO: "#4b90f5",
  FUERA_DE_SERVICIO: "#5c636b",
};

const matLinea = new THREE.MeshStandardMaterial({ color: "#e9ecef", emissive: "#e9ecef", emissiveIntensity: 0.25, roughness: 0.6 });
const matCono = new THREE.MeshStandardMaterial({ color: "#ff7a1a", emissive: "#ff5a00", emissiveIntensity: 0.4 });
const matFranja = new THREE.MeshStandardMaterial({ color: "#f4f4f4" });

function PlazaVehiculo({ plaza, animarEntrada }: { plaza: Plaza; animarEntrada: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const progreso = useRef(animarEntrada ? 0 : 1);
  const rotY = plaza.fila === 1 ? Math.PI : 0;
  const dir = plaza.fila === 1 ? -1 : 1; // hacia dónde avanza al entrar (z)

  useFrame((_, dt) => {
    if (!ref.current) return;
    if (progreso.current < 1) progreso.current = Math.min(1, progreso.current + dt / 1.6);
    const t = 1 - Math.pow(1 - progreso.current, 3);
    ref.current.position.z = plaza.z - dir * (1 - t) * (plaza.fondo + 2.5);
  });

  return (
    <Vehiculo
      ref={ref}
      tipo={plaza.tipo}
      color={colorVehiculo(plaza.id_espacio)}
      placa={plaza.placa}
      luces={animarEntrada}
      position={[plaza.x, 0, plaza.z]}
      rotation={[0, rotY, 0]}
    />
  );
}

function VehiculoSaliendo({ plaza, alTerminar }: { plaza: Plaza; alTerminar: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const dir = plaza.fila === 1 ? -1 : 1;
  useFrame((_, dt) => {
    if (!ref.current) return;
    t.current += dt / 1.8;
    const e = t.current * t.current;
    ref.current.position.z = plaza.z - dir * e * (plaza.fondo + 3);
    ref.current.position.x = plaza.x - Math.max(0, e - 0.6) * 18;
    if (t.current >= 1.4) alTerminar();
  });
  return (
    <Vehiculo
      ref={ref}
      tipo={plaza.tipo}
      color={colorVehiculo(plaza.id_espacio)}
      luces
      position={[plaza.x, 0, plaza.z]}
      rotation={[0, plaza.fila === 1 ? 0 : Math.PI, 0]}
    />
  );
}

function UnaPlaza({
  plaza,
  primeraCarga,
  resaltada,
  atenuada,
  interactiva,
  onSeleccionar,
}: {
  plaza: Plaza;
  primeraCarga: boolean;
  resaltada: boolean;
  atenuada: boolean;
  interactiva: boolean;
  onSeleccionar?: (p: Plaza) => void;
}) {
  const [hover, setHover] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const anterior = useRef(plaza.estado);
  const testigo = useRef<THREE.MeshStandardMaterial>(null);
  // Se calcula durante el render: el vehículo lee este valor al montarse.
  const llegaAhora = anterior.current !== "OCUPADO" && plaza.estado === "OCUPADO" && !primeraCarga;

  useEffect(() => {
    if (anterior.current === "OCUPADO" && plaza.estado !== "OCUPADO") setSaliendo(true);
    anterior.current = plaza.estado;
  }, [plaza.estado]);

  useFrame(({ clock }) => {
    const m = testigo.current;
    if (!m) return;
    const base = atenuada ? 0.15 : plaza.estado === "LIBRE" ? 2.2 : 1.2;
    const pulso = resaltada ? 1 + Math.sin(clock.elapsedTime * 5) * 0.8 : 1;
    m.emissiveIntensity = base * pulso * (hover ? 1.6 : 1);
  });

  const color = COLOR_ESTADO[plaza.estado];
  const fondoZ = plaza.z + (plaza.fila === 1 ? -plaza.fondo / 2 : plaza.fondo / 2);
  const lados = [plaza.x - plaza.ancho / 2, plaza.x + plaza.ancho / 2];

  return (
    <group>
      {/* líneas laterales */}
      {lados.map((x) => (
        <mesh key={x} position={[x, 0.012, plaza.z]} material={matLinea}>
          <boxGeometry args={[0.1, 0.02, plaza.fondo]} />
        </mesh>
      ))}
      {/* testigo de estado al fondo de la plaza */}
      <mesh position={[plaza.x, 0.03, fondoZ + (plaza.fila === 1 ? 0.25 : -0.25)]}>
        <boxGeometry args={[plaza.ancho - 0.5, 0.05, 0.22]} />
        <meshStandardMaterial ref={testigo} color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {/* zona clicable */}
      <mesh
        position={[plaza.x, 0.02, plaza.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={interactiva ? (e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; } : undefined}
        onPointerOut={interactiva ? () => { setHover(false); document.body.style.cursor = ""; } : undefined}
        onClick={interactiva && onSeleccionar ? (e) => { e.stopPropagation(); onSeleccionar(plaza); } : undefined}
      >
        <planeGeometry args={[plaza.ancho - 0.12, plaza.fondo]} />
        <meshBasicMaterial color={color} transparent opacity={hover ? 0.22 : resaltada ? 0.14 : 0.0} depthWrite={false} />
      </mesh>

      {plaza.estado === "OCUPADO" && <PlazaVehiculo key={`v${plaza.id_registro ?? ""}${plaza.placa ?? ""}`} plaza={plaza} animarEntrada={llegaAhora} />}
      {saliendo && <VehiculoSaliendo plaza={plaza} alTerminar={() => setSaliendo(false)} />}
      {plaza.estado === "FUERA_DE_SERVICIO" && (
        <group position={[plaza.x, 0, plaza.z]}>
          {[-0.6, 0.6].map((dz) => (
            <group key={dz} position={[0, 0, dz]}>
              <mesh position={[0, 0.36, 0]} material={matCono}>
                <coneGeometry args={[0.22, 0.72, 14]} />
              </mesh>
              <mesh position={[0, 0.4, 0]} material={matFranja}>
                <cylinderGeometry args={[0.135, 0.165, 0.1, 14]} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {interactiva && hover && (
        <Html position={[plaza.x, plaza.tipo === "AUTOMOVIL" ? 2.2 : 1.6, plaza.z]} center distanceFactor={18} zIndexRange={[20, 0]}>
          <div className="etiqueta-3d">
            <strong>{plaza.codigo}</strong>
            <span>
              {plaza.estado === "RESERVADO"
                ? `Reservado${plaza.placa ? ` para ${plaza.placa}` : ""}`
                : plaza.placa ?? (plaza.estado === "LIBRE" ? "Libre" : plaza.estado === "FUERA_DE_SERVICIO" ? "Fuera de servicio" : "Ocupado")}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

export function Plazas({
  plazas,
  resaltarTipo,
  resaltarId,
  interactiva = false,
  onSeleccionar,
}: {
  plazas: Plaza[];
  resaltarTipo?: number | null;
  resaltarId?: number | null;
  interactiva?: boolean;
  onSeleccionar?: (p: Plaza) => void;
}) {
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const firma = useMemo(() => plazas.map((p) => p.id_espacio).join(","), [plazas]);
  useEffect(() => {
    setPrimeraCarga(true);
    const t = window.setTimeout(() => setPrimeraCarga(false), 300);
    return () => window.clearTimeout(t);
  }, [firma]);

  return (
    <group>
      {plazas.map((p) => (
        <UnaPlaza
          key={p.id_espacio}
          plaza={p}
          primeraCarga={primeraCarga}
          resaltada={p.id_espacio === resaltarId || (resaltarTipo != null && p.id_tipo === resaltarTipo && p.estado === "LIBRE")}
          atenuada={resaltarTipo != null && p.id_tipo !== resaltarTipo}
          interactiva={interactiva}
          onSeleccionar={onSeleccionar}
        />
      ))}
    </group>
  );
}
