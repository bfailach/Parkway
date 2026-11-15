import { useEffect, useState } from "react";
import { alCambiarErrores, conDiagnostico, datosDelNavegador, erroresAnotados } from "../lib/diagnostico";
import { capacidades3D } from "../three/control";

/** Panel de diagnóstico: solo aparece con ?diagnostico en la dirección. */
export function PanelDiagnostico() {
  const [errores, setErrores] = useState(erroresAnotados);
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    if (!conDiagnostico) return;
    const actualizar = () => setDatos({ ...datosDelNavegador(), "Escena 3D": JSON.stringify(capacidades3D()) });
    actualizar();
    const id = window.setInterval(actualizar, 3000);
    const quitar = alCambiarErrores(() => setErrores(erroresAnotados()));
    return () => {
      window.clearInterval(id);
      quitar();
    };
  }, []);

  if (!conDiagnostico) return null;
  return (
    <aside className="diagnostico" aria-label="Diagnóstico">
      <button type="button" className="diagnostico-titulo" onClick={() => setAbierto(!abierto)}>
        Diagnóstico {errores.length ? `· ${errores.length} error${errores.length === 1 ? "" : "es"}` : "· sin errores"} {abierto ? "▾" : "▸"}
      </button>
      {abierto && (
        <dl>
          {Object.entries(datos).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {errores.map((e, i) => (
            <div key={i} className="diagnostico-error">
              <dt>Error</dt>
              <dd>{e}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
