import { useState } from "react";
import { Apariencia, cambiarApariencia, restablecerAccesibilidad, useApariencia } from "../lib/apariencia";
import { Dialogo } from "./Dialogo";

/** Botón para cambiar entre el modo oscuro y el claro. */
export function BotonTema({ className = "" }: { className?: string }) {
  const { tema } = useApariencia();
  const claro = tema === "claro";
  return (
    <button
      type="button"
      className={`boton-icono ${className}`}
      onClick={() => cambiarApariencia({ tema: claro ? "oscuro" : "claro" })}
      aria-pressed={claro}
      aria-label="Modo claro"
      title={claro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
    >
      {claro ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
        </svg>
      )}
    </button>
  );
}

/** Botón que abre las opciones de accesibilidad. */
export function BotonAccesibilidad({ className = "" }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`boton-icono ${className}`}
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label="Opciones de accesibilidad"
        title="Opciones de accesibilidad"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4.6" r="1.9" />
          <path d="M4.5 8.6 12 10l7.5-1.4M12 10v4.6M12 14.6l-3.4 6.4M12 14.6l3.4 6.4" />
        </svg>
      </button>
      <PanelAccesibilidad abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}

function Interruptor({ etiqueta, ayuda, activo, onChange }: { etiqueta: string; ayuda: string; activo: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="interruptor">
      <span className="interruptor-texto">
        <strong>{etiqueta}</strong>
        <span>{ayuda}</span>
      </span>
      <input type="checkbox" role="switch" checked={activo} onChange={(e) => onChange(e.target.checked)} />
      <span className="interruptor-pista" aria-hidden="true" />
    </label>
  );
}

const TAMANOS: { valor: Apariencia["texto"]; texto: string }[] = [
  { valor: "normal", texto: "Normal" },
  { valor: "grande", texto: "Grande" },
  { valor: "muy-grande", texto: "Muy grande" },
];

export function PanelAccesibilidad({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const a = useApariencia();
  return (
    <Dialogo abierto={abierto} titulo="Accesibilidad" onCerrar={onCerrar}>
      <div className="accesibilidad">
        <fieldset className="campo">
          <legend className="campo-rotulo">Tamaño del texto</legend>
          <div className="segmentos segmentos-compactos">
            {TAMANOS.map((t) => (
              <label key={t.valor} className="segmento">
                <input type="radio" name="tamano-texto" checked={a.texto === t.valor} onChange={() => cambiarApariencia({ texto: t.valor })} />
                <span>{t.texto}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="campo">
          <legend className="campo-rotulo">Tema</legend>
          <div className="segmentos segmentos-compactos">
            {(["oscuro", "claro"] as const).map((t) => (
              <label key={t} className="segmento">
                <input type="radio" name="tema" checked={a.tema === t} onChange={() => cambiarApariencia({ tema: t })} />
                <span>{t === "oscuro" ? "Oscuro" : "Claro"}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Interruptor etiqueta="Alto contraste" ayuda="Textos y bordes más marcados, enlaces subrayados." activo={a.contraste} onChange={(v) => cambiarApariencia({ contraste: v })} />
        <Interruptor
          etiqueta="Reducir movimiento"
          ayuda="Detiene las animaciones y el movimiento automático de la cámara 3D."
          activo={a.movimiento === "reducido"}
          onChange={(v) => cambiarApariencia({ movimiento: v ? "reducido" : "sistema" })}
        />
        <Interruptor etiqueta="Letra de lectura fácil" ayuda="Cambia los títulos condensados por una letra más abierta." activo={a.lectura} onChange={(v) => cambiarApariencia({ lectura: v })} />
        <Interruptor etiqueta="Símbolos de estado" ayuda="El plano marca libre, ocupado y reservado con símbolos además del color." activo={a.simbolos} onChange={(v) => cambiarApariencia({ simbolos: v })} />
        <Interruptor etiqueta="Plano 2D en lugar de 3D" ayuda="Muestra el plano de cada sede como una cuadrícula, más fácil de leer con lector de pantalla." activo={a.plano2d} onChange={(v) => cambiarApariencia({ plano2d: v })} />
      </div>
      <div className="dialogo-acciones">
        <button type="button" className="boton boton-texto" onClick={restablecerAccesibilidad}>Restablecer</button>
        <button type="button" className="boton boton-primario" onClick={onCerrar}>Listo</button>
      </div>
    </Dialogo>
  );
}
