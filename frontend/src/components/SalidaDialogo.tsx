import { useEffect, useState } from "react";
import { api, ApiError, Registro } from "../lib/api";
import { duracion, horaCorta, pesos } from "../lib/formato";
import { Dialogo } from "./Dialogo";
import { Placa } from "./Placa";
import { Tiquete } from "./Tiquete";

/**
 * Confirmación y resultado del registro de salida (RF07).
 * Se abre desde la lista de vehículos activos o desde una plaza del plano 3D.
 */
export function SalidaDialogo({
  registro,
  sede,
  onCerrar,
  onRegistrada,
}: {
  registro: Registro | null;
  sede: string;
  onCerrar: () => void;
  onRegistrada?: (r: Registro) => void;
}) {
  const [resultado, setResultado] = useState<Registro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setResultado(null);
    setError(null);
  }, [registro?.id_registro]);

  async function confirmar() {
    if (!registro) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await api.salida(registro.id_registro);
      setResultado(r);
      onRegistrada?.(r);
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : "No se pudo registrar la salida");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={!!registro} titulo={resultado ? "Salida registrada" : "Registrar salida"} onCerrar={onCerrar}>
      {registro && !resultado && (
        <>
          <div className="confirmacion">
            <Placa placa={registro.placa} tamano="md" />
            <dl className="tiquete-datos">
              <div><dt>Espacio</dt><dd>{registro.codigo_espacio}</dd></div>
              <div><dt>Ingreso</dt><dd>{horaCorta(registro.fecha_ingreso)}</dd></div>
              <div><dt>Tiempo</dt><dd>{duracion(registro.minutos_transcurridos)}</dd></div>
              <div><dt>Valor estimado</dt><dd>{pesos(registro.valor_estimado)}</dd></div>
            </dl>
            <p className="tenue">El valor final se calcula con la hora exacta de salida.</p>
          </div>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
            <button className="boton boton-primario" onClick={confirmar} disabled={enviando} autoFocus>
              {enviando ? "Registrando..." : "Confirmar salida"}
            </button>
          </div>
        </>
      )}
      {resultado && (
        <>
          <Tiquete registro={resultado} sede={sede} />
          <div className="dialogo-acciones">
            <button className="boton boton-primario" onClick={onCerrar} autoFocus>Listo</button>
          </div>
        </>
      )}
    </Dialogo>
  );
}
