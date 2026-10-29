import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { colorVehiculo, Distribucion, Plaza } from "./layout";
import { Vehiculo } from "./Vehiculo";
import { colorDeNombre } from "./modelos";
import { usePaleta } from "./tema";
import { PisoContexto, useMat, usePiso } from "./materiales";
import { rutaEntrada, rutaSalida, useRecorrido } from "./rutas";

/**
 * Plazas de la maqueta: líneas amarillas, testigo de estado al fondo de
 * cada plaza y el vehículo si está ocupada.
 *
 * Cuando una plaza pasa a ocupada (el operador registró el ingreso), el
 * vehículo aparece en el borde de la maqueta y hace todo el recorrido hasta
 * su plaza; cuando se libera, sale de reversa y se va por la barrera.
 */

const COLOR_ESTADO: Record<string, string> = {
  LIBRE: "#3ddc97",
  OCUPADO: "#ff4d5e",
  RESERVADO: "#4b90f5",
  FUERA_DE_SERVICIO: "#7b838c",
};
const COLOR_ESTADO_CLARO: Record<string, string> = {
  LIBRE: "#14a56c",
  OCUPADO: "#e0384a",
  RESERVADO: "#2f6fe0",
  FUERA_DE_SERVICIO: "#9aa2ab",
};

const colorDe = (p: Plaza) => colorDeNombre(p.color) ?? colorVehiculo(p.id_espacio);
const rotacionEnPlaza = (p: Plaza): [number, number, number] => [0, p.fila === 1 ? Math.PI : 0, 0];

/** Vehículo estacionado; si acaba de llegar, recorre la maqueta hasta la plaza. */
function VehiculoEnPlaza({ plaza, dist, llega }: { plaza: Plaza; dist: Distribucion; llega: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { fantasma } = usePiso();
  const [enCamino, setEnCamino] = useState(llega);
  // La ruta se calcula una sola vez, al montarse: las consultas siguientes
  // ya no traen la plaza como recién ocupada.
  const [ruta] = useState(() => (llega ? rutaEntrada(dist, plaza) : null));
  useRecorrido(enCamino ? ruta : null, ref, () => setEnCamino(false));
  return (
    <Vehiculo
      key={fantasma ? "f" : "n"}
      ref={ref}
      tipo={plaza.tipo}
      color={colorDe(plaza)}
      marca={plaza.marca}
      placa={plaza.placa}
      luces={enCamino}
      fantasma={fantasma}
      position={enCamino && ruta ? [ruta.tramos[0].curva.points[0].x, 0, ruta.tramos[0].curva.points[0].z] : [plaza.x, plaza.y, plaza.z]}
      rotation={enCamino ? [0, Math.PI, 0] : rotacionEnPlaza(plaza)}
    />
  );
}

/** Vehículo que deja la plaza y se va por la barrera. */
function VehiculoSaliendo({ plaza, dist, alTerminar }: { plaza: Plaza; dist: Distribucion; alTerminar: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const { fantasma } = usePiso();
  const [ruta] = useState(() => rutaSalida(dist, plaza));
  useRecorrido(ruta, ref, alTerminar);
  return (
    <Vehiculo
      key={fantasma ? "f" : "n"}
      ref={ref}
      tipo={plaza.tipo}
      color={colorDe(plaza)}
      marca={plaza.marca}
      luces
      fantasma={fantasma}
      position={[plaza.x, plaza.y, plaza.z]}
      rotation={rotacionEnPlaza(plaza)}
    />
  );
}

function UnaPlaza({
  plaza,
  dist,
  primeraCarga,
  resaltada,
  atenuada,
  interactiva,
  onSeleccionar,
}: {
  plaza: Plaza;
  dist: Distribucion;
  primeraCarga: boolean;
  resaltada: boolean;
  atenuada: boolean;
  interactiva: boolean;
  onSeleccionar?: (p: Plaza) => void;
}) {
  const paleta = usePaleta();
  const { fantasma } = usePiso();
  const linea = useMat("linea");
  const cono = useMat("cono");
  const blanco = useMat("blanco");
  const [hover, setHover] = useState(false);
  const [saliendo, setSaliendo] = useState<Plaza | null>(null);
  const anterior = useRef<Plaza>(plaza);
  const testigo = useRef<THREE.MeshStandardMaterial>(null);
  // Se calcula durante el render: el vehículo lee este valor al montarse.
  const llegaAhora = anterior.current.estado !== "OCUPADO" && plaza.estado === "OCUPADO" && !primeraCarga;

  useEffect(() => {
    // Sale el vehículo que estaba (con su placa, marca y color).
    if (anterior.current.estado === "OCUPADO" && plaza.estado !== "OCUPADO" && !primeraCarga) setSaliendo(anterior.current);
    anterior.current = plaza;
  }, [plaza, primeraCarga]);

  useFrame(({ clock }) => {
    const m = testigo.current;
    if (!m) return;
    const base = (atenuada ? 0.12 : plaza.estado === "LIBRE" ? 1.5 : 0.8) * paleta.testigoBrillo;
    const pulso = resaltada ? 1 + Math.sin(clock.elapsedTime * 5) * 0.8 : 1;
    m.emissiveIntensity = base * pulso * (hover ? 1.6 : 1);
  });

  const color = (paleta.claro ? COLOR_ESTADO_CLARO : COLOR_ESTADO)[plaza.estado];
  const fondoZ = plaza.z + (plaza.fila === 1 ? -plaza.fondo / 2 : plaza.fondo / 2);
  const lados = [plaza.x - plaza.ancho / 2, plaza.x + plaza.ancho / 2];
  const y = plaza.y;
  const activa = interactiva && !fantasma;

  return (
    <group>
      {/* líneas laterales */}
      {lados.map((x) => (
        <mesh key={x} position={[x, y + 0.012, plaza.z]} material={linea}>
          <boxGeometry args={[0.12, 0.02, plaza.fondo]} />
        </mesh>
      ))}
      {/* testigo de estado al fondo de la plaza */}
      {!fantasma && (
        <mesh position={[plaza.x, y + 0.03, fondoZ + (plaza.fila === 1 ? 0.24 : -0.24)]}>
          <boxGeometry args={[plaza.ancho - 0.7, 0.04, 0.14]} />
          <meshStandardMaterial ref={testigo} color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
        </mesh>
      )}
      {/* zona clicable */}
      {activa && (
        <mesh
          position={[plaza.x, y + 0.02, plaza.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHover(false);
            document.body.style.cursor = "";
          }}
          onClick={
            onSeleccionar
              ? (e) => {
                  e.stopPropagation();
                  onSeleccionar(plaza);
                }
              : undefined
          }
        >
          <planeGeometry args={[plaza.ancho - 0.12, plaza.fondo]} />
          <meshBasicMaterial color={color} transparent opacity={hover ? 0.22 : resaltada ? 0.14 : 0.0} depthWrite={false} />
        </mesh>
      )}
      {!activa && resaltada && !fantasma && (
        <mesh position={[plaza.x, y + 0.02, plaza.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[plaza.ancho - 0.12, plaza.fondo]} />
          <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}

      {plaza.estado === "OCUPADO" && (
        <VehiculoEnPlaza key={`v${plaza.id_registro ?? ""}${plaza.placa ?? ""}`} plaza={plaza} dist={dist} llega={llegaAhora} />
      )}
      {saliendo && <VehiculoSaliendo plaza={{ ...plaza, ...saliendo, x: plaza.x, y: plaza.y, z: plaza.z }} dist={dist} alTerminar={() => setSaliendo(null)} />}
      {plaza.estado === "FUERA_DE_SERVICIO" && (
        <group position={[plaza.x, y, plaza.z]}>
          {[-0.6, 0.6].map((dz) => (
            <group key={dz} position={[0, 0, dz]}>
              <mesh position={[0, 0.36, 0]} material={cono}>
                <coneGeometry args={[0.22, 0.72, 14]} />
              </mesh>
              <mesh position={[0, 0.4, 0]} material={blanco}>
                <cylinderGeometry args={[0.135, 0.165, 0.1, 14]} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {activa && hover && (
        <Html position={[plaza.x, y + (plaza.tipo === "AUTOMOVIL" ? 2.2 : 1.6), plaza.z]} center distanceFactor={18} zIndexRange={[20, 0]}>
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
  dist,
  resaltarTipo,
  resaltarId,
  interactiva = false,
  pisoVisible,
  onSeleccionar,
}: {
  dist: Distribucion;
  resaltarTipo?: number | null;
  resaltarId?: number | null;
  interactiva?: boolean;
  pisoVisible?: number | null;
  onSeleccionar?: (p: Plaza) => void;
}) {
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const firma = useMemo(() => dist.plazas.map((p) => p.id_espacio).join(","), [dist.plazas]);
  useEffect(() => {
    setPrimeraCarga(true);
    const t = window.setTimeout(() => setPrimeraCarga(false), 300);
    return () => window.clearTimeout(t);
  }, [firma]);
  const filtrado = pisoVisible != null && dist.pisos > 1;

  return (
    <group>
      {dist.plazas.map((p) => (
        <PisoContexto.Provider key={p.id_espacio} value={{ fantasma: filtrado && p.piso !== pisoVisible }}>
          <UnaPlaza
            plaza={p}
            dist={dist}
            primeraCarga={primeraCarga}
            resaltada={p.id_espacio === resaltarId || (resaltarTipo != null && p.id_tipo === resaltarTipo && p.estado === "LIBRE")}
            atenuada={resaltarTipo != null && p.id_tipo !== resaltarTipo}
            interactiva={interactiva}
            onSeleccionar={onSeleccionar}
          />
        </PisoContexto.Provider>
      ))}
    </group>
  );
}
