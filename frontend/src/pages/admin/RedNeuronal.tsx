import { useEffect, useMemo, useState } from "react";
import { api, ApiError, EntradasRed, Parqueadero, RedNeuronal as Red } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Mismo cálculo que el backend: h = ReLU(W1·x + b1), ŷ = sigmoide(w2·h + b2). */
function adelante(red: Red, x: number[]) {
  const h = red.b1.map((b, j) => Math.max(0, x.reduce((s, xi, i) => s + xi * red.W1[i][j], b)));
  const z = h.reduce((s, hj, j) => s + hj * red.w2[j], red.b2);
  return { h, y: 1 / (1 + Math.exp(-z)) };
}

const vector = (e: EntradasRed) => [e.hora / 23, e.dia / 6, e.festivo ? 1 : 0, e.ocupacionActual, e.ocupacionSemanaAnterior, e.reservas];

const INICIAL: EntradasRed = { hora: 17, dia: 1, festivo: false, ocupacionActual: 0.72, ocupacionSemanaAnterior: 0.85, reservas: 0.07 };

/**
 * Página del administrador para explicar y probar la red neuronal de
 * ocupación (sección 14 del documento maestro). Muestra las tres capas,
 * las métricas de validación y un simulador que recalcula la salida en
 * vivo al mover cada entrada.
 */
export function RedNeuronal({ sede }: { sede: Parqueadero }) {
  const red = useConsulta(() => api.redNeuronal(), [], 0);
  const [e, setE] = useState<EntradasRed>(INICIAL);
  const [origen, setOrigen] = useState("Ejemplo del documento: martes 5:00 p. m.");
  const [error, setError] = useState<string | null>(null);

  async function cargarReales() {
    setError(null);
    try {
      const p = await api.prediccion(sede.id_parqueadero);
      setE({ ...p.entradas });
      setOrigen(`Datos reales de ${sede.nombre} en este momento${p.entradas.sinHistorico ? " (sin una semana de historia: x5 = ocupación actual)" : ""}`);
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : "No se pudo consultar la sede");
    }
  }
  useEffect(() => {
    void cargarReales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sede.id_parqueadero]);

  const r = red.datos;
  const x = vector(e);
  const salida = useMemo(() => (r ? adelante(r, x) : null), [r, x.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof EntradasRed) => (v: number | boolean) => {
    setE((a) => ({ ...a, [k]: v }));
    setOrigen("Valores ajustados a mano");
  };

  return (
    <div className="pagina">
      <header className="pagina-cabeza">
        <div>
          <h1 className="pagina-titulo">Red neuronal</h1>
          <p className="pagina-sub">
            Perceptrón multicapa 6-8-1 que estima la ocupación de la sede dentro de una hora. Solo informa: nunca bloquea una transacción.
          </p>
        </div>
      </header>

      {r && (
        <div className="red-metricas">
          <Metrica valor={`${r.metricas.mae_pp.toLocaleString("es-CO")} pp`} texto="Error medio (MAE) en validación" destacada />
          <Metrica valor={`${r.metricas.mae_ingenuo_pp.toLocaleString("es-CO")} pp`} texto="Modelo ingenuo: repetir hace 7 días" />
          <Metrica valor={`${r.metricas.mae_persistencia_pp.toLocaleString("es-CO")} pp`} texto="Repetir la ocupación actual" />
          <Metrica valor={String(r.metricas.parametros)} texto={`Parámetros · ${r.metricas.filas_entrenamiento} filas de entrenamiento`} />
        </div>
      )}

      <div className="red-cuerpo">
        <section className="red-diagrama" aria-label="Diagrama de la red">
          {r && salida ? <Diagrama red={r} x={x} h={salida.h} y={salida.y} /> : <p className="tenue">Cargando la red...</p>}
          <p className="red-formula">
            <b>h</b> = ReLU(W1·<b>x</b> + b1) &nbsp;·&nbsp; ŷ = σ(w2·<b>h</b> + b2)
          </p>
          <p className="tenue red-leyenda">
            Líneas azules: pesos positivos. Rojas: negativos. El grosor es la fuerza del peso; las líneas se encienden con la señal que pasa en este momento.
          </p>
        </section>

        <section className="red-simulador" aria-label="Simulador">
          <div className="red-resultado">
            <span className="tenue">Ocupación esperada en una hora</span>
            <strong className={`red-y ${salida && r && salida.y >= r.umbralAlerta ? "red-y-alerta" : ""}`}>
              {salida ? pct(salida.y) : "..."}
            </strong>
            {salida && r && (
              <span className={`chip ${salida.y >= r.umbralAlerta ? "chip-revertida" : salida.y >= 0.8 ? "chip-reserva" : "chip-libre"}`}>
                {salida.y >= r.umbralAlerta ? "Alerta: sugerir otra sede u hora" : salida.y >= 0.8 ? "Ocupación alta" : "Normal"}
              </span>
            )}
          </div>
          <p className="tenue red-origen">{origen}</p>

          <Deslizador rotulo="x1 · Hora del día" valor={e.hora} min={0} max={23} paso={1} texto={`${e.hora}:00`} onChange={set("hora")} />
          <div className="campo">
            <span className="campo-rotulo">x2 · Día de la semana</span>
            <div className="segmentos segmentos-compactos">
              {DIAS.map((d, i) => (
                <label key={d} className="segmento">
                  <input type="radio" name="dia-red" checked={e.dia === i} onChange={() => set("dia")(i)} />
                  <span>{d}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="interruptor red-festivo">
            <span className="interruptor-texto"><strong>x3 · Es festivo</strong></span>
            <input type="checkbox" role="switch" checked={e.festivo} onChange={(ev) => set("festivo")(ev.target.checked)} />
            <span className="interruptor-pista" aria-hidden="true" />
          </label>
          <Deslizador rotulo="x4 · Ocupación actual" valor={e.ocupacionActual} texto={pct(e.ocupacionActual)} onChange={set("ocupacionActual")} />
          <Deslizador rotulo="x5 · Ocupación hace 7 días" valor={e.ocupacionSemanaAnterior} texto={pct(e.ocupacionSemanaAnterior)} onChange={set("ocupacionSemanaAnterior")} />
          <Deslizador rotulo="x6 · Reservas en camino / capacidad" valor={e.reservas} max={0.3} texto={pct(e.reservas)} onChange={set("reservas")} />

          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="red-acciones">
            <button className="boton boton-primario" onClick={cargarReales}>Usar datos reales de {sede.nombre}</button>
            <button className="boton boton-secundario" onClick={() => { setE(INICIAL); setOrigen("Ejemplo del documento: martes 5:00 p. m."); }}>
              Ejemplo del documento
            </button>
          </div>
          <p className="tenue red-vector">x = ({x.map((v) => v.toFixed(2).replace(".", ",")).join("; ")})</p>
          {r && <p className="tenue red-vector">Entrenada el {r.entrenado} con datos {r.datos}. Script: ia/entrenar_red.py</p>}
        </section>
      </div>
    </div>
  );
}

function Metrica({ valor, texto, destacada }: { valor: string; texto: string; destacada?: boolean }) {
  return (
    <div className={`red-metrica ${destacada ? "red-metrica-destacada" : ""}`}>
      <strong>{valor}</strong>
      <span>{texto}</span>
    </div>
  );
}

function Deslizador({
  rotulo, valor, onChange, texto, min = 0, max = 1, paso = 0.01,
}: { rotulo: string; valor: number; onChange: (v: number) => void; texto: string; min?: number; max?: number; paso?: number }) {
  return (
    <label className="campo red-deslizador">
      <span className="campo-rotulo">{rotulo} <b>{texto}</b></span>
      <input type="range" min={min} max={max} step={paso} value={valor} onChange={(ev) => onChange(Number(ev.target.value))} />
    </label>
  );
}

const ROTULOS = ["hora", "día", "festivo", "ocupación", "hace 7 días", "reservas"];

function Diagrama({ red, x, h, y }: { red: Red; x: number[]; h: number[]; y: number }) {
  const W = 620, H = 392, xi = 150, xh = 350, xo = 520;
  const yi = x.map((_, i) => 40 + i * 56);
  const yh = h.map((_, j) => 22 + j * 45);
  const yo = 180;
  const maxW1 = Math.max(...red.W1.flat().map(Math.abs));
  const maxW2 = Math.max(...red.w2.map(Math.abs));
  const maxH = Math.max(1e-6, ...h);
  const color = (w: number) => (w >= 0 ? "var(--acento)" : "var(--ocupado)");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="red-svg" role="img" aria-label={`Red 6-8-1, salida ${pct(y)}`}>
      {x.map((xv, i) =>
        h.map((_, j) => {
          const w = red.W1[i][j];
          const senal = Math.min(1, Math.abs(xv * w) / maxW1);
          return (
            <line key={`a${i}${j}`} x1={xi} y1={yi[i]} x2={xh} y2={yh[j]} stroke={color(w)}
              strokeWidth={0.4 + 2.4 * (Math.abs(w) / maxW1)} opacity={0.08 + 0.85 * senal} />
          );
        })
      )}
      {h.map((hv, j) => {
        const w = red.w2[j];
        const senal = Math.min(1, Math.abs(hv * w) / (maxW2 * maxH));
        return (
          <line key={`b${j}`} x1={xh} y1={yh[j]} x2={xo} y2={yo} stroke={color(w)}
            strokeWidth={0.6 + 3 * (Math.abs(w) / maxW2)} opacity={0.1 + 0.85 * senal} />
        );
      })}
      {x.map((v, i) => (
        <g key={`i${i}`}>
          <circle cx={xi} cy={yi[i]} r={15} fill="var(--superficie-3)" stroke="var(--tinta-3)" />
          <circle cx={xi} cy={yi[i]} r={15 * Math.max(0.05, v)} fill="var(--acento)" opacity={0.8} />
          <text x={xi - 24} y={yi[i] - 2} textAnchor="end" className="red-t">{`x${i + 1} ${ROTULOS[i]}`}</text>
          <text x={xi - 24} y={yi[i] + 12} textAnchor="end" className="red-t red-t-tenue">{v.toFixed(2)}</text>
        </g>
      ))}
      {h.map((v, j) => (
        <g key={`h${j}`}>
          <circle cx={xh} cy={yh[j]} r={14} fill="var(--superficie-3)" stroke="var(--tinta-3)" />
          <circle cx={xh} cy={yh[j]} r={14} fill="var(--alerta)" opacity={v > 0 ? 0.15 + 0.8 * Math.min(1, v / maxH) : 0} />
          <text x={xh} y={yh[j] + 4} textAnchor="middle" className="red-t red-t-n">{`h${j + 1}`}</text>
          <text x={xh + 22} y={yh[j] + 4} className="red-t red-t-tenue">{v.toFixed(2)}</text>
        </g>
      ))}
      <circle cx={xo} cy={yo} r={26} fill="var(--superficie-3)" stroke="var(--tinta-2)" strokeWidth={1.5} />
      <circle cx={xo} cy={yo} r={26 * y} fill={y >= 0.9 ? "var(--ocupado)" : "var(--libre)"} opacity={0.85} />
      <text x={xo} y={yo + 5} textAnchor="middle" className="red-t red-t-y">{pct(y)}</text>
      <text x={xo} y={yo + 46} textAnchor="middle" className="red-t red-t-tenue">ŷ próxima hora</text>
      {[[xi, "Entrada · 6"], [xh, "Oculta · 8 ReLU"], [xo, "Salida · sigmoide"]].map(([cx, t]) => (
        <text key={String(t)} x={Number(cx)} y={H - 4} textAnchor="middle" className="red-t red-t-capa">{t}</text>
      ))}
    </svg>
  );
}
