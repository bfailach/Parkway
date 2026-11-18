import { useState } from "react";
import { api } from "../lib/api";
import { nombreTipo } from "../lib/formato";
import { Placa } from "./Placa";

/**
 * Verificación en portería de un ingreso con QR: el operador ve el vehículo
 * que el cliente registró (placa, tipo, marca, color, cliente y espacio) y
 * confirma que es el que llegó. Si no coincide, anula el ingreso con un
 * motivo: el registro queda sin cobro y el espacio se libera.
 */
export interface DatosVerificacion {
  idRegistro: number;
  placa: string;
  tipo: string | null;
  marca: string | null;
  color: string | null;
  cliente: string | null;
  espacio: string | null;
  fecha: string;
}

export function VerificacionQr({ datos, onListo }: { datos: DatosVerificacion; onListo: (resultado: "verificado" | "anulado") => void }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function responder(coincide: boolean) {
    setEnviando(true);
    setError(null);
    try {
      await api.verificarQr(datos.idRegistro, coincide, coincide ? undefined : motivo);
      onListo(coincide ? "verificado" : "anulado");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const vehiculo = [datos.tipo ? nombreTipo(datos.tipo) : null, datos.marca, datos.color?.toLowerCase()].filter(Boolean).join(", ");
  return (
    <div className="verificacion-qr">
      <div className="verificacion-vehiculo">
        <Placa placa={datos.placa} tamano="md" />
        <dl className="tiquete-datos">
          <div><dt>Vehículo</dt><dd>{vehiculo || "Sin datos de marca ni color"}</dd></div>
          <div><dt>Cliente</dt><dd>{datos.cliente ?? "—"}</dd></div>
          <div><dt>Espacio</dt><dd>{datos.espacio ?? "—"}</dd></div>
          <div><dt>Hora</dt><dd>{new Date(datos.fecha).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</dd></div>
        </dl>
      </div>
      <p className="verificacion-pregunta">¿El vehículo que está en la entrada es este?</p>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!rechazando ? (
        <div className="acciones">
          <button className="boton boton-primario" disabled={enviando} onClick={() => responder(true)}>Sí, coincide</button>
          <button className="boton boton-secundario" disabled={enviando} onClick={() => setRechazando(true)}>No coincide</button>
        </div>
      ) : (
        <>
          <label className="campo">
            <span className="campo-rotulo">¿Qué no coincide?</span>
            <input value={motivo} maxLength={200} autoFocus placeholder="Por ejemplo: llegó otra placa, el color es distinto" onChange={(e) => setMotivo(e.target.value)} />
            <span className="campo-ayuda">Se anula el ingreso sin cobro y el espacio queda libre. El cliente recibe el aviso con este motivo.</span>
          </label>
          <div className="acciones">
            <button className="boton boton-peligro" disabled={enviando || motivo.trim().length < 5} onClick={() => responder(false)}>Anular ingreso</button>
            <button className="boton" disabled={enviando} onClick={() => setRechazando(false)}>Volver</button>
          </div>
        </>
      )}
    </div>
  );
}
