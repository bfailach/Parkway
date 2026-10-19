import { Registro } from "../lib/api";
import { duracion, fechaCorta, nombreTipo, pesos } from "../lib/formato";
import { Placa } from "./Placa";

/**
 * Tiquete de ingreso o de salida, con la forma de un tiquete de papel
 * de portería (borde perforado arriba y abajo).
 */
export function Tiquete({ registro, sede }: { registro: Registro; sede: string }) {
  const salida = registro.estado === "CERRADO";
  return (
    <article className="tiquete" aria-label={salida ? "Tiquete de salida" : "Tiquete de ingreso"}>
      <header className="tiquete-cabeza">
        <span>{sede}</span>
        <span>N.º {String(registro.id_registro).padStart(6, "0")}</span>
      </header>
      <div className="tiquete-espacio">
        <span className="tiquete-espacio-rotulo">{salida ? "Liberó el espacio" : "Diríjase al espacio"}</span>
        <span className="tiquete-espacio-codigo">{registro.codigo_espacio}</span>
      </div>
      <div className="tiquete-placa">
        <Placa placa={registro.placa} tamano="md" />
      </div>
      <dl className="tiquete-datos">
        <div><dt>Vehículo</dt><dd>{nombreTipo(registro.tipo)}{registro.marca ? `, ${registro.marca}` : ""}{registro.color ? ` ${registro.color.toLowerCase()}` : ""}</dd></div>
        <div><dt>Ingreso</dt><dd>{fechaCorta(registro.fecha_ingreso)}</dd></div>
        {salida && <div><dt>Salida</dt><dd>{fechaCorta(registro.fecha_salida)}</dd></div>}
        {salida && <div><dt>Permanencia</dt><dd>{duracion(registro.minutos)}</dd></div>}
        {!salida && <div><dt>Tarifa</dt><dd>{pesos(registro.valor_hora)} la hora, {pesos(registro.valor_fraccion)} cada 15 min</dd></div>}
        {registro.id_reserva ? <div><dt>Reserva</dt><dd>Llegó con reserva</dd></div> : null}
        <div><dt>Atendió</dt><dd>{salida ? registro.operador_salida : registro.operador_ingreso}</dd></div>
      </dl>
      {salida && (
        <div className="tiquete-total">
          <span>Total a pagar</span>
          <strong>{pesos(registro.valor_calculado)}</strong>
        </div>
      )}
    </article>
  );
}
