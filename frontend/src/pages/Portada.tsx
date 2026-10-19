import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Lenis from "lenis";
import { api, Parqueadero, TipoVehiculo } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { calcularCobro } from "../lib/tarifa";
import { duracion, nombreTipo, pesos, pluralTipo } from "../lib/formato";
import { Odometro } from "../components/Odometro";
import { Placa } from "../components/Placa";
import { crearControl, plazaAsignada, PLACA_HISTORIA, soportaWebGL } from "../three/control";
import { distribuir } from "../three/layout";

const Escena = lazy(() => import("../three/Escena"));

/**
 * Portada pública.
 * Una escena 3D fija detrás de la página muestra la sede real: cada plaza
 * con su estado actual. El scroll mueve la cámara por la historia de un
 * ingreso y termina en la vista aérea de los cupos libres.
 */

const PASOS = [
  {
    titulo: "Llegas a la sede",
    texto: "Antes de salir ya sabes cuántos cupos quedan. No le das vueltas a la manzana.",
  },
  {
    titulo: "Tu placa abre la barrera",
    texto: "El operador digita la placa. El sistema valida el formato y abre tu registro de ingreso.",
  },
  {
    titulo: "Recibes tu espacio",
    texto: "El sistema toma el primer espacio libre para tu tipo de vehículo. Nadie más puede ocuparlo.",
  },
  {
    titulo: "Sales y pagas lo justo",
    texto: "Cobramos horas completas y fracciones de 15 minutos. Ni un minuto de más.",
  },
];

const EJEMPLO_MINUTOS = 80;

export function Portada({ onIngresar, enSesion }: { onIngresar: () => void; enSesion: boolean }) {
  const [sedes, setSedes] = useState<Parqueadero[]>([]);
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [idSede, setIdSede] = useState(1);
  const [paso, setPaso] = useState(0);
  const control = useRef(crearControl("portada"));
  const historiaRef = useRef<HTMLElement>(null);
  const webgl = useMemo(soportaWebGL, []);

  useEffect(() => {
    api.parqueaderos().then(setSedes).catch(() => {});
    api.tiposVehiculo().then(setTipos).catch(() => {});
  }, []);

  const plano = useConsulta(() => api.plano(idSede), [idSede], 5000);
  const resumen = useConsulta(() => api.resumen(idSede), [idSede], 5000);
  const sede = sedes.find((s) => s.id_parqueadero === idSede);
  const espacios = plano.datos ?? [];
  const objetivo = useMemo(() => plazaAsignada(distribuir(espacios).plazas), [espacios]);

  // Scroll suave y control de la cámara según la sección visible.
  useEffect(() => {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = reducido ? null : new Lenis({ lerp: 0.1 });
    let raf = 0;
    const bucle = (t: number) => {
      lenis?.raf(t);
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);

    const alDesplazar = () => {
      const el = historiaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const recorrido = r.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / recorrido));
      const c = control.current;
      c.progreso = p;
      c.modo = r.top > 0 ? "portada" : p < 1 ? "historia" : "vivo";
      const nuevo = Math.min(3, Math.floor(p * 4.2));
      setPaso((ant) => (ant === nuevo ? ant : nuevo));
    };
    const alMover = (e: PointerEvent) => {
      control.current.raton.x = (e.clientX / window.innerWidth) * 2 - 1;
      control.current.raton.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("scroll", alDesplazar, { passive: true });
    window.addEventListener("pointermove", alMover, { passive: true });
    alDesplazar();
    return () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
      window.removeEventListener("scroll", alDesplazar);
      window.removeEventListener("pointermove", alMover);
    };
  }, []);

  // Entrada escalonada de los elementos de cada sección al aparecer.
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".portada .entrada");
    const io = new IntersectionObserver(
      (entradas) => entradas.forEach((e) => e.isIntersecting && (e.target.classList.add("visto"), io.unobserve(e.target))),
      { threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const libres = resumen.datos?.totales.libres;
  const auto = tipos.find((t) => t.nombre === "AUTOMOVIL");
  const ejemplo = auto?.valor_hora != null ? calcularCobro(EJEMPLO_MINUTOS, auto as never) : null;

  return (
    <div className="portada">
      {webgl ? (
        <Suspense fallback={<div className="escena-fondo" />}>
          <Escena className="escena-fondo" espacios={espacios} control={control} />
        </Suspense>
      ) : (
        <div className="escena-fondo escena-sin-3d" />
      )}

      <header className="portada-barra">
        <a href="#/" className="marca" aria-label="Parkway, inicio">
          <span className="senal-p senal-p-sm" aria-hidden="true">P</span>
          Parkway
        </a>
        <nav className="portada-nav" aria-label="Secciones">
          <button onClick={() => irA("como-funciona")}>Cómo funciona</button>
          <button onClick={() => irA("cupos")}>Cupos</button>
          <button onClick={() => irA("tarifas")}>Tarifas</button>
        </nav>
        <button className="boton boton-primario" onClick={onIngresar}>
          {enSesion ? "Ir al panel" : "Ingresar"}
        </button>
      </header>

      <main>
        {/* Primera pantalla */}
        <section className="heroe" aria-labelledby="titulo-heroe">
          <div className="heroe-texto">
            <h1 id="titulo-heroe" className="display">Parquea sin dar vueltas</h1>
            <p className="heroe-apoyo">
              Parkway muestra los cupos libres de cada sede en tiempo real y te asigna un espacio apenas llegas.
            </p>
            <div className="heroe-acciones">
              <button className="boton boton-primario boton-grande" onClick={() => irA("cupos")}>Ver cupos libres</button>
              <button className="boton boton-fantasma boton-grande" onClick={() => irA("como-funciona")}>Cómo funciona</button>
            </div>
          </div>
          <div className="heroe-cupos" aria-live="polite">
            <Odometro valor={libres} className="heroe-numero" />
            <p>
              cupos libres ahora en <strong>{sede?.nombre ?? "la sede"}</strong>
            </p>
          </div>
          <span className="heroe-indicio" aria-hidden="true">Desliza</span>
        </section>

        {/* Historia de un ingreso, controlada por el scroll */}
        <section id="como-funciona" ref={historiaRef} className="historia" aria-labelledby="titulo-historia">
          <div className="historia-fija">
            <h2 id="titulo-historia" className="historia-titulo">Cómo funciona</h2>
            <ol className="historia-pasos">
              {PASOS.map((p, i) => (
                <li key={p.titulo} className={i === paso ? "activo" : i < paso ? "hecho" : ""} aria-current={i === paso ? "step" : undefined}>
                  <h3>{p.titulo}</h3>
                  <p>
                    {p.texto}
                    {i === 2 && objetivo && (
                      <>
                        {" "}Ahora mismo sería el <strong className="codigo-plaza">{objetivo.codigo}</strong>.
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ol>
            <div className={`historia-tiquete ${paso === 3 ? "visible" : ""}`} aria-hidden={paso !== 3}>
              <div className="mini-tiquete">
                <div className="mini-tiquete-fila">
                  <Placa placa={PLACA_HISTORIA} />
                  <span>Espacio {objetivo?.codigo ?? "A-01"}</span>
                </div>
                <div className="mini-tiquete-fila tenue">
                  <span>Permanencia</span>
                  <span>{duracion(EJEMPLO_MINUTOS)}</span>
                </div>
                {ejemplo && auto && (
                  <div className="mini-tiquete-fila tenue">
                    <span>{ejemplo.horas} h x {pesos(auto.valor_hora)} + {ejemplo.fracciones} x {pesos(auto.valor_fraccion)}</span>
                  </div>
                )}
                <div className="mini-tiquete-total">
                  <span>Total</span>
                  <strong>{pesos(ejemplo?.total ?? null)}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Cupos en vivo */}
        <section id="cupos" className="vivo" aria-labelledby="titulo-vivo">
          <div className="vivo-panel">
            <h2 id="titulo-vivo" className="display-2 entrada">Cupos libres ahora</h2>
            <div className="sedes entrada" style={{ ["--retardo" as string]: "80ms" }} role="tablist" aria-label="Sede">
              {sedes.map((s) => (
                <button
                  key={s.id_parqueadero}
                  role="tab"
                  aria-selected={s.id_parqueadero === idSede}
                  className="sede-tab"
                  onClick={() => setIdSede(s.id_parqueadero)}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
            {sede && <p className="vivo-direccion">{sede.direccion}</p>}
            <dl className="vivo-tipos entrada" style={{ ["--retardo" as string]: "160ms" }}>
              {resumen.datos?.porTipo.map((t) => (
                <div key={t.id_tipo} className={t.libres === 0 ? "lleno" : ""}>
                  <dt>{pluralTipo(t.tipo)}</dt>
                  <dd>
                    <Odometro valor={t.libres} className="vivo-numero" />
                    <span className="vivo-de">de {t.total - t.fuera_de_servicio}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="vivo-nota">
              Las plazas verdes del plano están libres. El tablero se actualiza cada 5 segundos con los registros de la portería.
            </p>
            <button className="boton boton-primario boton-grande vivo-accion" onClick={onIngresar}>
              {enSesion ? "Ir a mi cuenta" : "Reservar un espacio"}
            </button>
          </div>
        </section>

        {/* Calculadora de tarifa */}
        <Tarifas tipos={tipos} />

        {/* Acceso del personal */}
        <section className="cierre" aria-labelledby="titulo-cierre">
          <h2 id="titulo-cierre" className="display-2 entrada">¿Trabajas en la portería?</h2>
          <p>Registra ingresos y salidas, revisa los vehículos dentro y consulta el historial del día desde el panel. Si eres cliente, crea tu cuenta para reservar.</p>
          <button className="boton boton-primario boton-grande" onClick={onIngresar}>
            {enSesion ? "Ir al panel" : "Ingresar al panel"}
          </button>
        </section>
      </main>

      <footer className="pie">
        <p>Parkway, sistema transaccional para la gestión de parqueaderos.</p>
        <p>Proyecto de Sistemas Transaccionales, Universidad Manuela Beltrán. Grupo 2: Bryan Failach, Alejandro Castellanos y Brayan Bello.</p>
      </footer>
    </div>
  );
}

function Tarifas({ tipos }: { tipos: TipoVehiculo[] }) {
  const conTarifa = tipos.filter((t) => t.valor_hora != null);
  const [idTipo, setIdTipo] = useState(1);
  const [minutos, setMinutos] = useState(95);
  const t = conTarifa.find((x) => x.id_tipo === idTipo) ?? conTarifa[0];
  const cobro = t ? calcularCobro(minutos, t as never) : null;

  return (
    <section id="tarifas" className="tarifas" aria-labelledby="titulo-tarifas">
      <div className="tarifas-texto">
        <h2 id="titulo-tarifas" className="display-2 entrada">Calcula cuánto pagas</h2>
        <p>Mueve el tiempo y mira el valor exacto. Es el mismo cálculo que hace la portería al registrar tu salida.</p>
        <table className="tarifas-tabla">
          <caption className="visualmente-oculto">Tarifas vigentes</caption>
          <thead>
            <tr>
              <th scope="col">Vehículo</th>
              <th scope="col">Hora</th>
              <th scope="col">15 min</th>
              <th scope="col">Día</th>
            </tr>
          </thead>
          <tbody>
            {conTarifa.map((x) => (
              <tr key={x.id_tipo}>
                <th scope="row">{nombreTipo(x.nombre)}</th>
                <td>{pesos(x.valor_hora)}</td>
                <td>{pesos(x.valor_fraccion)}</td>
                <td>{pesos(x.valor_dia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="calculadora entrada" style={{ ["--retardo" as string]: "140ms" }}>
        <div className="segmentos" role="radiogroup" aria-label="Tipo de vehículo">
          {conTarifa.map((x) => (
            <label key={x.id_tipo} className="segmento">
              <input type="radio" name="calc-tipo" checked={x.id_tipo === t?.id_tipo} onChange={() => setIdTipo(x.id_tipo)} />
              <span>{nombreTipo(x.nombre)}</span>
            </label>
          ))}
        </div>
        <label className="calculadora-tiempo">
          <span>Tiempo en el parqueadero</span>
          <strong>{duracion(minutos)}</strong>
          <input
            type="range"
            min={5}
            max={720}
            step={5}
            value={minutos}
            onChange={(e) => setMinutos(Number(e.target.value))}
            aria-valuetext={duracion(minutos)}
          />
        </label>
        {cobro && t && (
          <div className="calculadora-total" aria-live="polite">
            <span className="calculadora-precio">{pesos(cobro.total)}</span>
            <span className="tenue">
              {cobro.topeAplicado
                ? `Se cobra el valor del día: ${pesos(t.valor_dia)}`
                : `${cobro.horas} ${cobro.horas === 1 ? "hora" : "horas"} x ${pesos(t.valor_hora)} + ${cobro.fracciones} ${cobro.fracciones === 1 ? "fracción" : "fracciones"} x ${pesos(t.valor_fraccion)}`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
