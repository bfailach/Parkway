import { api } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";

const pct = (v: number) => `${Math.round(v * 100)} %`;

/**
 * Ocupación esperada dentro de una hora, calculada por la red neuronal.
 * Solo informa: si la sede va a estar casi llena sugiere otra, pero nunca
 * bloquea la reserva ni el ingreso.
 */
export function PrediccionOcupacion({
  idSede,
  idTipo,
  onCambiarSede,
  compacta = false,
}: {
  idSede: number;
  idTipo?: number;
  onCambiarSede?: (id: number) => void;
  compacta?: boolean;
}) {
  const p = useConsulta(() => api.prediccion(idSede, idTipo).catch(() => null), [idSede, idTipo], 60000);
  const d = p.datos;
  if (!d) return null;
  const clase = d.nivel === "CRITICA" ? "prediccion-critica" : d.nivel === "ALTA" ? "prediccion-alta" : "";
  const sube = d.ocupacionEstimada - d.ocupacionActual;

  return (
    <div className={`prediccion ${clase} ${compacta ? "prediccion-compacta" : ""}`} aria-live="polite">
      <div className="prediccion-fila">
        <span className="prediccion-rotulo">
          Ocupación esperada a las {d.horaObjetivo}
          <small>Red neuronal · error medio {d.modelo.maeValidacion.toLocaleString("es-CO")} pp</small>
        </span>
        <strong className="prediccion-valor">{pct(d.ocupacionEstimada)}</strong>
      </div>
      <div className="prediccion-barra" role="presentation">
        <span className="prediccion-actual" style={{ width: pct(d.ocupacionActual).replace(" ", "") }} />
        <span className="prediccion-estimada" style={{ left: pct(d.ocupacionEstimada).replace(" ", "") }} />
      </div>
      <span className="tenue prediccion-nota">
        Ahora {pct(d.ocupacionActual)}
        {Math.abs(sube) >= 0.03 ? (sube > 0 ? ", va a subir" : ", va a bajar") : ", estable"}
      </span>
      {d.alerta && (
        <p className="prediccion-aviso">
          La sede estará casi llena.
          {d.alternativa ? (
            onCambiarSede ? (
              <button type="button" className="boton boton-texto" onClick={() => onCambiarSede(d.alternativa!.idParqueadero)}>
                Mejor {d.alternativa.nombre} ({pct(d.alternativa.ocupacionEstimada)})
              </button>
            ) : (
              <> {d.alternativa.nombre} tendrá {pct(d.alternativa.ocupacionEstimada)}.</>
            )
          ) : (
            " Considera llegar en otro horario."
          )}
        </p>
      )}
    </div>
  );
}
