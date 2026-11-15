import { useState } from "react";
import { instalar, useEnLinea, useInstalacion } from "../lib/pwa";
import { Dialogo } from "./Dialogo";

/**
 * Botón para instalar Parkway como app en el celular o el computador.
 * En Android, Chrome y Edge abre el diálogo de instalación del navegador;
 * en iPhone y en Firefox para Android muestra cómo agregarla a la pantalla
 * de inicio desde el menú. No aparece si
 * ya se abrió como app instalada o si el navegador no permite instalarla.
 */
export function BotonInstalar({ variante = "icono" }: { variante?: "icono" | "boton" }) {
  const { instalada, disponible, manual } = useInstalacion();
  const [ayuda, setAyuda] = useState(false);
  if (instalada || (!disponible && !manual)) return null;

  const accion = () => (disponible ? instalar() : setAyuda(true));
  const icono = (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 7.5v7M9 11.5l3 3 3-3M10.5 18.5h3" />
    </svg>
  );

  return (
    <>
      {variante === "icono" ? (
        <button type="button" className="boton-icono" onClick={accion} aria-label="Instalar la app" title="Instalar Parkway en este dispositivo">
          {icono}
        </button>
      ) : (
        <button type="button" className="boton boton-fantasma boton-grande boton-instalar" onClick={accion}>
          {icono}
          Instalar la app
        </button>
      )}
      <Dialogo abierto={ayuda} titulo={manual === "firefox" ? "Instalar desde Firefox" : "Instalar en iPhone"} onCerrar={() => setAyuda(false)}>
        {manual === "firefox" ? (
          <ol className="pasos-ios">
            <li>Toque el menú de Firefox, los <strong>tres puntos</strong> junto a la dirección.</li>
            <li>Elija <strong>Agregar a la pantalla de inicio</strong> (en algunas versiones, <strong>Instalar</strong>).</li>
            <li>Confirme con <strong>Agregar</strong>.</li>
          </ol>
        ) : (
          <ol className="pasos-ios">
            <li>Abra Parkway en <strong>Safari</strong>.</li>
            <li>Toque <strong>Compartir</strong>, el cuadro con la flecha hacia arriba.</li>
            <li>Elija <strong>Agregar a inicio</strong> y toque <strong>Agregar</strong>.</li>
          </ol>
        )}
        <p className="tenue">Parkway queda con su ícono y se abre a pantalla completa, como una app.</p>
        <div className="dialogo-acciones">
          <button className="boton boton-primario" onClick={() => setAyuda(false)} autoFocus>Entendido</button>
        </div>
      </Dialogo>
    </>
  );
}

/** Franja que avisa cuando el dispositivo se queda sin internet. */
export function AvisoConexion() {
  const enLinea = useEnLinea();
  if (enLinea) return null;
  return (
    <div className="aviso-conexion" role="status">
      Sin conexión a internet. Lo que ve puede no estar al día; se actualiza solo al volver la conexión.
    </div>
  );
}
