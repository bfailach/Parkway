import { MutableRefObject, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO } from "@react-three/postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { alturaPiso, distribuir, Distribucion, EspacioPlano, Plaza } from "./layout";
import { Maqueta } from "./Estructura";
import { Plazas } from "./Plazas";
import { Vehiculo } from "./Vehiculo";
import { ControlEscena, PLACA_HISTORIA, plazaAsignada } from "./control";
import { PALETA_CLARA, PALETA_OSCURA, PaletaEscena, TemaEscena, usePaleta } from "./tema";
import { rutaEntrada, TraficoContexto, ubicar, useTrafico } from "./rutas";
import { movimientoReducido, useApariencia } from "../lib/apariencia";

/**
 * Escena 3D del parqueadero: una maqueta flotante, sin entorno, con los
 * pisos, la rampa y los vehículos reales de la sede.
 *
 * Modos de cámara:
 * - portada: vuelo lento alrededor de la maqueta, con paralaje del mouse.
 * - historia: recorrido controlado por el scroll. Un carro llega, la placa
 *   abre la barrera, el sistema le asigna una plaza libre y estaciona.
 * - vivo: vista aérea de la sede con los cupos libres resaltados.
 * - panel: el usuario gira la cámara y elige plazas (personal y clientes).
 */
export type { ControlEscena, ModoEscena } from "./control";

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fondo liso con un degradado vertical suave, sin entorno. */
function Fondo() {
  const p = usePaleta();
  const { scene } = useThree();
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, p.fondoArriba);
    grad.addColorStop(1, p.fondoAbajo);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
    return () => {
      scene.background = null;
      t.dispose();
    };
  }, [p, scene]);
  return null;
}

/** Luz de estudio: un sol suave con sombras difusas y luz de relleno. */
function Luces({ d }: { d: Distribucion }) {
  const p = usePaleta();
  const sol = useRef<THREE.DirectionalLight>(null);
  const [cx, , cz] = d.centro;
  const e = d.extension;
  useEffect(() => {
    const l = sol.current;
    if (!l) return;
    l.target.position.set(cx, 0, cz);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = cam.bottom = -e * 0.72;
    cam.right = cam.top = e * 0.72;
    cam.near = 1;
    cam.far = e * 4;
    cam.updateProjectionMatrix();
  }, [cx, cz, e]);
  return (
    <>
      <hemisphereLight args={[p.cieloArriba, p.cieloAbajo, p.luzAmbiente]} />
      <directionalLight
        ref={sol}
        position={[cx - e * 0.55, e * 1.1, cz + e * 0.45]}
        intensity={p.luzSol}
        color={p.colorSol}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-radius={6}
      />
      <directionalLight position={[cx + e * 0.6, e * 0.5, cz - e * 0.6]} intensity={p.luzSol * 0.28} color={p.claro ? "#ffffff" : "#7ea2ff"} />
      {/* Reflejos suaves de estudio en la pintura, sin descargar imágenes */}
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2 * p.entorno} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 8, 1]} />
        <Lightformer form="rect" intensity={1 * p.entorno} position={[-14, 4, 6]} rotation-y={Math.PI / 2} scale={[20, 3, 1]} />
        <Lightformer form="rect" intensity={1 * p.entorno} position={[14, 4, -6]} rotation-y={-Math.PI / 2} scale={[20, 3, 1]} />
      </Environment>
    </>
  );
}

function Rig({ control, plazas, dist }: { control: MutableRefObject<ControlEscena>; plazas: Plaza[]; dist: Distribucion }) {
  const { camera, size } = useThree();
  const carro = useRef<THREE.Group>(null);
  const mirar = useRef(new THREE.Vector3(...dist.centro));
  const objetivo = plazaAsignada(plazas);
  const { movimiento } = useApariencia();
  const reducido = useMemo(() => movimientoReducido(), [movimiento]); // eslint-disable-line react-hooks/exhaustive-deps
  const trafico = useTrafico();

  // Recorrido del carro de la historia: borde de la maqueta -> barrera -> plaza.
  const ruta = useMemo(() => (objetivo ? rutaEntrada(dist, objetivo) : null), [dist, objetivo?.id_espacio]); // eslint-disable-line react-hooks/exhaustive-deps
  const tmp = useMemo(() => ({ cam: new THREE.Vector3(), look: new THREE.Vector3(), off: new THREE.Vector3() }), []);
  const cubierto = !!objetivo && objetivo.piso < dist.pisos;

  useEffect(() => {
    const c = carro.current;
    if (!c || !trafico) return;
    trafico.current.add(c);
    return () => {
      trafico.current.delete(c);
    };
  }, [trafico]);

  useFrame(({ clock }, dt) => {
    const c = control.current;
    const t = clock.elapsedTime;
    const { cam, look, off } = tmp;
    const vertical = size.width / size.height < 0.9;
    const ajuste = Math.min(1.8, Math.max(1, 1.25 / (size.width / size.height))); // aleja la cámara en pantallas angostas
    const p = c.modo === "historia" ? c.progreso : c.modo === "portada" ? 0 : 1;
    const [cx, cy, cz] = dist.centro;
    const E = dist.extension;

    // Carro de la historia
    if (carro.current && ruta) {
      const s = p < 0.4 ? sstep(0, 0.22, p) * ruta.barrera : ruta.barrera + sstep(0.4, 0.74, p) * (ruta.largo - ruta.barrera);
      ubicar(ruta, s, carro.current);
      carro.current.visible = c.modo === "historia";
    }
    const pos = carro.current?.position ?? new THREE.Vector3(cx, 0, cz);
    const angulo = carro.current?.rotation.y ?? 0;

    // Cámara
    const rx = reducido ? 0 : c.raton.x;
    const ry = reducido ? 0 : c.raton.y;

    if (c.modo === "portada") {
      // Vuelo lento alrededor de la maqueta.
      const ang = (vertical ? 2.2 : 2.35) + (reducido ? 0 : Math.sin(t * 0.07) * 0.22) + rx * 0.12;
      const r = E * (vertical ? 1.45 : 1.3) * ajuste;
      cam.set(cx + Math.cos(ang) * r, cy + E * (0.62 - ry * 0.06), cz + Math.sin(ang) * r);
      // En pantalla ancha la maqueta queda a la derecha del título.
      look.set(cx - (vertical ? 0 : E * 0.26), cy * 0.6, cz - (vertical ? -E * 0.12 : E * 0.26));
    } else if (c.modo === "historia") {
      off.set(Math.sin(angulo), 0, Math.cos(angulo)); // adelante del carro
      if (p < 0.24) {
        cam.set(pos.x - off.x * 9 + off.z * 4, pos.y + 3.6, pos.z - off.z * 9 - off.x * 4);
        look.set(pos.x + off.x * 6, pos.y + 0.8, pos.z + off.z * 6);
      } else if (p < 0.4) {
        const k = sstep(0.24, 0.32, p);
        cam.set(pos.x - off.x * (9 - 5.5 * k) + off.z * (4 - 3 * k), pos.y + 3.6 - 2.3 * k, pos.z - off.z * (9 - 5.5 * k) - off.x * (4 - 3 * k));
        look.set(pos.x + off.x * (6 - 4 * k), pos.y + 0.8 - 0.2 * k, pos.z + off.z * (6 - 4 * k));
      } else if (cubierto && p < 0.78) {
        // Piso con otro encima: cámara baja que sigue al carro entre losas.
        cam.set(pos.x - off.x * 7.5 + off.z * 2.5, pos.y + 2.3, pos.z - off.z * 7.5 - off.x * 2.5);
        look.set(pos.x + off.x * 4, pos.y + 0.7, pos.z + off.z * 4);
      } else if (cubierto && objetivo) {
        // Vista lateral desde el carril hacia el carro estacionado.
        const k = sstep(0.78, 0.95, p);
        const lado = objetivo.zCarril - objetivo.z > 0 ? 1 : -1;
        cam.set(pos.x - 7 + 2 * k, pos.y + 2.7 - 0.2 * k, pos.z + lado * (10.5 - 1.5 * k));
        look.set(pos.x, pos.y + 0.6, pos.z);
      } else if (p < 0.78) {
        cam.set(pos.x - 11, pos.y + 14, pos.z + 13);
        look.set(pos.x + 2, pos.y, pos.z);
      } else {
        const k = sstep(0.78, 0.95, p);
        cam.set(pos.x - 11 + 11 * k, pos.y + 14 + 9 * k, pos.z + 13 - 12.5 * k);
        look.set(pos.x + 2 - 2 * k, pos.y, pos.z);
      }
    } else if (c.modo === "vivo") {
      // La maqueta queda a la derecha; el texto ocupa la izquierda.
      const angosta = size.width < 900;
      const corrimiento = angosta ? 0 : E * 0.32;
      cam.set(cx - corrimiento - E * 0.35 + rx * 3, cy + E * 0.62 * ajuste, cz + E * 0.62 * ajuste + ry * 3);
      look.set(cx - corrimiento, cy * 0.5, cz);
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
        <Vehiculo tipo="AUTOMOVIL" color="#2f6fd6" marca="Toyota" placa={PLACA_HISTORIA} luces />
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
    <mesh ref={ref} position={[plaza.x, plaza.y + 0.04, plaza.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[plaza.ancho - 0.2, plaza.fondo - 0.2]} />
      <meshBasicMaterial color="#3ddc97" transparent opacity={0.4} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Cámara del panel: se puede girar; al elegir un piso, mira a su altura. */
function CamaraPanel({ d, pisoVisible }: { d: Distribucion; pisoVisible?: number | null }) {
  const controles = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const [cx, cy, cz] = d.centro;
  const E = d.extension;
  const yObjetivo = pisoVisible != null && d.pisos > 1 ? alturaPiso(pisoVisible) + 0.5 : cy * 0.6;

  useEffect(() => {
    camera.position.set(cx - E * 0.5, cy + E * 0.78, cz + E * 0.92);
    camera.lookAt(cx, cy * 0.6, cz);
    controles.current?.target.set(cx, cy * 0.6, cz);
  }, [cx, cy, cz, E, camera]);

  useFrame((_, dt) => {
    const c = controles.current;
    if (!c) return;
    const dy = yObjetivo - c.target.y;
    if (Math.abs(dy) > 0.01) {
      const paso = dy * Math.min(1, dt * 4);
      c.target.y += paso;
      camera.position.y += paso;
      c.update();
    }
  });

  return (
    <OrbitControls
      ref={controles}
      enableDamping
      maxPolarAngle={Math.PI / 2.2}
      minDistance={8}
      maxDistance={E * 2.4 + 20}
    />
  );
}

function Contenido({
  espacios,
  control,
  resaltarTipo,
  resaltarId,
  pisoVisible,
  onSeleccionar,
}: {
  espacios: EspacioPlano[];
  control: MutableRefObject<ControlEscena>;
  resaltarTipo?: number | null;
  resaltarId?: number | null;
  pisoVisible?: number | null;
  onSeleccionar?: (p: Plaza) => void;
}) {
  const dist = useMemo(() => distribuir(espacios), [espacios]);
  const modo = control.current.modo;
  const paleta = usePaleta();
  const registro = useRef(new Set<THREE.Object3D>());

  return (
    <TraficoContexto.Provider value={registro}>
      <Fondo />
      <Luces d={dist} />
      <Maqueta d={dist} pisoVisible={pisoVisible} />
      <Plazas
        dist={dist}
        resaltarTipo={resaltarTipo}
        resaltarId={resaltarId}
        interactiva={modo === "panel"}
        pisoVisible={pisoVisible}
        onSeleccionar={onSeleccionar}
      />
      {modo !== "panel" && <Rig control={control} plazas={dist.plazas} dist={dist} />}
      {modo === "panel" && <CamaraPanel d={dist} pisoVisible={pisoVisible} />}
      {/* Oclusión ambiental: el sombreado suave entre piezas que hace que se vea como maqueta. */}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO halfRes aoRadius={2.2} distanceFalloff={1} intensity={paleta.claro ? 2.6 : 2} color={paleta.claro ? "#3d362c" : "#000000"} />
        {paleta.claro ? <></> : <Bloom intensity={0.45} luminanceThreshold={0.8} luminanceSmoothing={0.2} mipmapBlur />}
      </EffectComposer>
    </TraficoContexto.Provider>
  );
}

export interface EscenaProps {
  espacios: EspacioPlano[];
  control: MutableRefObject<ControlEscena>;
  resaltarTipo?: number | null;
  /** Plaza que pulsa para señalarla (por ejemplo, la reservada por el cliente). */
  resaltarId?: number | null;
  /** Piso que se ve completo; los demás quedan translúcidos. null = todos. */
  pisoVisible?: number | null;
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

export default function Escena({ espacios, control, resaltarTipo, resaltarId, pisoVisible, onSeleccionar, className }: EscenaProps) {
  const [listo, setListo] = useState(false);
  // Si el navegador apaga el contexto 3D (por ejemplo, por falta de memoria
  // gráfica), se crea uno nuevo; tras tres intentos se deja de insistir.
  const [intento, setIntento] = useState(0);
  const { tema } = useApariencia();
  const paleta: PaletaEscena = tema === "claro" ? PALETA_CLARA : PALETA_OSCURA;
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
        key={intento}
        shadows="soft"
        onCreated={({ gl }) => {
          gl.domElement.addEventListener(
            "webglcontextlost",
            (e) => {
              e.preventDefault();
              if (intento < 3) setTimeout(() => setIntento((i) => i + 1), 400);
            },
            { once: true }
          );
        }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 32, near: 0.5, far: 1200, position: [-80, 60, 80] }}
      >
        <TemaEscena.Provider value={paleta}>
          <Suspense fallback={null}>
            <Contenido
              espacios={espacios}
              control={control}
              resaltarTipo={resaltarTipo}
              resaltarId={resaltarId}
              pisoVisible={pisoVisible}
              onSeleccionar={onSeleccionar}
            />
          </Suspense>
        </TemaEscena.Provider>
      </Canvas>
    </div>
  );
}
