import { MutableRefObject, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { distribuir, EspacioPlano, MEDIO_CARRIL, Plaza } from "./layout";
import { Entorno, CALLE_X_OFFSET } from "./Entorno";
import { Plazas } from "./Plazas";
import { Vehiculo } from "./Vehiculo";
import { ControlEscena, PLACA_HISTORIA, plazaAsignada } from "./control";

/**
 * Escena 3D del parqueadero.
 *
 * Modos de cámara:
 * - portada: vuelo lento alrededor de la sede, con paralaje del mouse.
 * - historia: recorrido controlado por el scroll. Un carro llega, la placa
 *   abre la barrera, el sistema le asigna una plaza libre y estaciona.
 * - vivo: vista aérea de la sede con los cupos libres resaltados.
 * - panel: el usuario gira la cámara y elige plazas (personal autenticado).
 */
export type { ControlEscena, ModoEscena } from "./control";

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function Rig({
  control,
  plazas,
  dist,
  barreraRef,
}: {
  control: MutableRefObject<ControlEscena>;
  plazas: Plaza[];
  dist: ReturnType<typeof distribuir>;
  barreraRef: MutableRefObject<THREE.Group | null>;
}) {
  const { camera, size } = useThree();
  const carro = useRef<THREE.Group>(null);
  const mirar = useRef(new THREE.Vector3(0, 0, 0));
  const objetivo = plazaAsignada(plazas);
  const reducido = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  // Trayectos del carro de la historia: calle -> barrera, barrera -> plaza.
  const rutas = useMemo(() => {
    const zc = 1.6;
    const bx = dist.barreraX;
    const calle = bx - CALLE_X_OFFSET;
    const llegada = new THREE.CatmullRomCurve3([
      new THREE.Vector3(calle + 1.8, 0, -40),
      new THREE.Vector3(calle + 1.8, 0, -8),
      new THREE.Vector3(calle + 8, 0, zc),
      new THREE.Vector3(bx - 5.5, 0, zc),
    ]);
    const destino = objetivo ?? { x: dist.minX + 6, z: -(MEDIO_CARRIL + 2.6), fila: 1 as const };
    const haciaNorte = destino.fila === 1;
    const entrada = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx - 5.5, 0, zc),
      new THREE.Vector3(bx + 4, 0, zc),
      new THREE.Vector3(destino.x - 6, 0, haciaNorte ? zc + 0.6 : -zc - 0.6),
      new THREE.Vector3(destino.x - 1.2, 0, haciaNorte ? -1.6 : 1.6),
      new THREE.Vector3(destino.x, 0, destino.z),
    ]);
    return { llegada, entrada };
  }, [dist, objetivo?.id_espacio]); // eslint-disable-line react-hooks/exhaustive-deps

  const tmp = useMemo(
    () => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(), cam: new THREE.Vector3(), look: new THREE.Vector3(), off: new THREE.Vector3() }),
    []
  );

  useFrame(({ clock }, dt) => {
    const c = control.current;
    const t = clock.elapsedTime;
    const { pos, tan, cam, look, off } = tmp;
    const vertical = size.width / size.height < 0.9;
    const ajuste = Math.min(1.8, Math.max(1, 1.25 / (size.width / size.height))); // aleja la cámara en pantallas angostas
    const p = c.modo === "historia" ? c.progreso : c.modo === "portada" ? 0 : 1;

    // Carro de la historia
    let anguloCarro = 0;
    if (p < 0.4) {
      const u = sstep(0, 0.22, p) * 0.999;
      rutas.llegada.getPointAt(u, pos);
      rutas.llegada.getTangentAt(Math.max(0.001, u), tan);
    } else {
      const u = Math.max(0.001, sstep(0.4, 0.74, p) * 0.999);
      rutas.entrada.getPointAt(u, pos);
      rutas.entrada.getTangentAt(u, tan);
    }
    anguloCarro = Math.atan2(tan.x, tan.z);
    if (carro.current) {
      carro.current.position.copy(pos);
      carro.current.rotation.y = anguloCarro;
      carro.current.visible = c.modo === "historia" || c.modo === "portada";
    }
    // Barrera: se levanta entre 0.27 y 0.37
    if (barreraRef.current) {
      const apertura = c.modo === "historia" ? sstep(0.27, 0.37, p) * (1 - sstep(0.62, 0.7, p)) : 0;
      barreraRef.current.rotation.x = apertura * 1.35;
    }

    // Cámara
    const rx = reducido ? 0 : c.raton.x;
    const ry = reducido ? 0 : c.raton.y;
    const L = dist.largo;
    const cx = (dist.minX + dist.maxX) / 2;

    if (c.modo === "portada" && vertical) {
      // En el teléfono la cámara mira a lo largo del carril desde la entrada.
      cam.set(dist.minX - 10, 11 - ry * 2, (reducido ? 0 : Math.sin(t * 0.1) * 3) + rx * 3 + 4);
      look.set(cx + L * 0.25, 0, 0);
    } else if (c.modo === "portada") {
      // Desde la entrada, mirando por el carril hacia los cerros orientales.
      const ang = 2.62 + (reducido ? 0 : Math.sin(t * 0.08) * 0.16) + rx * 0.12;
      const r = (L * 0.58 + 8) * ajuste;
      cam.set(cx + Math.cos(ang) * r, (L * 0.2 + 6) * (1 - ry * 0.15), Math.sin(ang) * r);
      look.set(cx + L * 0.35, 1, -2);
    } else if (c.modo === "historia") {
      off.set(Math.sin(anguloCarro), 0, Math.cos(anguloCarro)); // adelante del carro
      if (p < 0.24) {
        // persecución desde atrás y a un lado
        cam.set(pos.x - off.x * 9 + off.z * 4, 3.4, pos.z - off.z * 9 - off.x * 4);
        look.set(pos.x + off.x * 6, 0.8, pos.z + off.z * 6);
      } else if (p < 0.4) {
        // primer plano de la placa trasera y la barrera
        const k = sstep(0.24, 0.32, p);
        cam.set(pos.x - off.x * (9 - 5.5 * k) + off.z * (4 - 3 * k), 3.4 - 2.2 * k, pos.z - off.z * (9 - 5.5 * k) - off.x * (4 - 3 * k));
        look.set(pos.x + off.x * (6 - 4 * k), 0.8 - 0.2 * k, pos.z + off.z * (6 - 4 * k));
      } else if (p < 0.78) {
        // vista alta siguiendo al carro hasta la plaza
        cam.set(pos.x - 10, 13, pos.z + 13);
        look.set(pos.x + 2, 0, pos.z);
      } else {
        // cenital sobre la plaza asignada
        const k = sstep(0.78, 0.95, p);
        cam.set(pos.x - 10 + 10 * k, 13 + 9 * k, pos.z + 13 - 12.5 * k);
        look.set(pos.x + 2 - 2 * k, 0, pos.z);
      }
    } else if (c.modo === "vivo") {
      // La sede queda a la derecha de la pantalla; el texto ocupa la izquierda.
      const angosta = size.width < 900;
      cam.set(cx - (angosta ? 0 : L * 0.4) + rx * 3, (L * 0.5 + 10) * ajuste, (L * 0.5 + 12) * ajuste + ry * 3);
      look.set(cx - (angosta ? 0 : L * 0.4), 0, angosta ? -4 : 2);
    }

    if (c.modo !== "panel") {
      const k = 1 - Math.exp(-dt * (c.modo === "historia" ? 6 : 2.2));
      camera.position.lerp(cam, k);
      mirar.current.lerp(look, k);
      camera.lookAt(mirar.current);
    }
  });

  return (
    <>
      <group ref={carro}>
        <Vehiculo tipo="AUTOMOVIL" color="#c9ced4" placa={PLACA_HISTORIA} luces />
        <pointLight position={[2.5, 5, -3]} color="#ffd9a0" intensity={9} distance={12} decay={1.4} />
        <pointLight position={[0, 1.0, -4]} color="#ffffff" intensity={3} distance={3.5} decay={2} />
      </group>
      {objetivo && <ResaltarPlaza plaza={objetivo} control={control} />}
    </>
  );
}

/** Anillo que pulsa sobre la plaza asignada durante la historia. */
function ResaltarPlaza({ plaza, control }: { plaza: Plaza; control: MutableRefObject<ControlEscena> }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const p = control.current.progreso;
    const visible = control.current.modo === "historia" && p > 0.38;
    m.visible = visible;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = visible ? 0.35 + Math.sin(clock.elapsedTime * 6) * 0.25 : 0;
  });
  return (
    <mesh ref={ref} position={[plaza.x, 0.03, plaza.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[plaza.ancho - 0.2, plaza.fondo - 0.2]} />
      <meshBasicMaterial color="#3ddc97" transparent opacity={0.4} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Contenido({
  espacios,
  control,
  resaltarTipo,
  resaltarId,
  onSeleccionar,
}: {
  espacios: EspacioPlano[];
  control: MutableRefObject<ControlEscena>;
  resaltarTipo?: number | null;
  resaltarId?: number | null;
  onSeleccionar?: (p: Plaza) => void;
}) {
  const dist = useMemo(() => distribuir(espacios), [espacios]);
  const barreraRef = useRef<THREE.Group | null>(null);
  const modo = control.current.modo;
  const { camera } = useThree();
  const cx = (dist.minX + dist.maxX) / 2;

  useEffect(() => {
    if (modo === "panel") {
      camera.position.set(cx - 4, dist.largo * 0.5 + 10, dist.largo * 0.42 + 8);
      camera.lookAt(cx, 0, -2);
    }
  }, [modo, cx, dist.largo, camera]);

  return (
    <>
      <color attach="background" args={["#030407"]} />
      <fog attach="fog" args={["#030407", 70, 300]} />
      <hemisphereLight args={["#3a4a6e", "#0a0b0f", 0.55]} />
      <directionalLight position={[-40, 60, 30]} intensity={0.35} color="#9db4ff" />
      <Stars radius={260} depth={60} count={1800} factor={5} saturation={0} fade speed={0.4} />
      <Entorno dist={dist} barreraRef={barreraRef} />
      <Plazas
        plazas={dist.plazas}
        resaltarTipo={resaltarTipo}
        resaltarId={resaltarId}
        interactiva={modo === "panel"}
        onSeleccionar={onSeleccionar}
      />
      {modo !== "panel" && <Rig control={control} plazas={dist.plazas} dist={dist} barreraRef={barreraRef} />}
      {modo === "panel" && (
        <OrbitControls
          target={[cx, 0, -2]}
          enableDamping
          maxPolarAngle={Math.PI / 2.25}
          minDistance={12}
          maxDistance={dist.largo * 1.6 + 30}
        />
      )}
      <EffectComposer multisampling={0}>
        <Bloom intensity={1.15} luminanceThreshold={0.62} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette offset={0.25} darkness={0.75} />
      </EffectComposer>
    </>
  );
}

export interface EscenaProps {
  espacios: EspacioPlano[];
  control: MutableRefObject<ControlEscena>;
  resaltarTipo?: number | null;
  /** Plaza que pulsa para señalarla (por ejemplo, la reservada por el cliente). */
  resaltarId?: number | null;
  onSeleccionar?: (p: Plaza) => void;
  className?: string;
}

let fuentesListas: Promise<unknown> | null = null;
function esperarFuentes() {
  fuentesListas ??= Promise.race([
    document.fonts.load('800 40px "Big Shoulders Display"'),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  return fuentesListas;
}

export default function Escena({ espacios, control, resaltarTipo, resaltarId, onSeleccionar, className }: EscenaProps) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    esperarFuentes().then(() => vivo && setListo(true));
    return () => {
      vivo = false;
    };
  }, []);
  if (!listo) return <div className={className} />;
  return (
    <div className={className} aria-hidden={control.current.modo !== "panel"}>
      <Canvas
        dpr={[1, 1.6]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: 40, near: 0.5, far: 900, position: [-60, 40, 60] }}
      >
        <Suspense fallback={null}>
          <Contenido espacios={espacios} control={control} resaltarTipo={resaltarTipo} resaltarId={resaltarId} onSeleccionar={onSeleccionar} />
        </Suspense>
      </Canvas>
    </div>
  );
}
