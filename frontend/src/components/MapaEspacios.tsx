import { EspacioMapa } from "../lib/api";
import { horaCorta, pluralTipo } from "../lib/formato";

/**
 * Mapa de la sede: cada espacio se dibuja como una plaza con líneas de
 * demarcación. Las plazas ocupadas muestran la placa y la hora de ingreso.
 */
const ETIQUETA_ESTADO: Record<EspacioMapa["estado"], string> = {
  LIBRE: "Libre",
  OCUPADO: "Ocupado",
  RESERVADO: "Reservado",
  FUERA_DE_SERVICIO: "Fuera de servicio",
};

interface Props {
  espacios: EspacioMapa[];
  onSeleccionar?: (e: EspacioMapa) => void;
}

export function MapaEspacios({ espacios, onSeleccionar }: Props) {
  const grupos = espacios.reduce<Record<string, EspacioMapa[]>>((acc, e) => {
    (acc[e.tipo] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="mapa">
      {Object.entries(grupos).map(([tipo, lista]) => (
        <section key={tipo} className="mapa-zona" aria-label={pluralTipo(tipo)}>
          <h3 className="mapa-zona-titulo">
            {pluralTipo(tipo)}
            <span className="mapa-zona-cuenta">
              {lista.filter((e) => e.estado === "LIBRE").length} de {lista.length} libres
            </span>
          </h3>
          <ul className={`plazas plazas-${tipo.toLowerCase()}`}>
            {lista.map((e) => {
              const titulo = `${e.codigo}: ${ETIQUETA_ESTADO[e.estado]}${e.placa ? `, ${e.placa} desde ${horaCorta(e.fecha_ingreso)}` : ""}`;
              const contenido = (
                <>
                  <span className="plaza-codigo">{e.codigo}</span>
                  {e.placa && <span className="plaza-placa">{e.placa}</span>}
                </>
              );
              return (
                <li key={e.id_espacio} className={`plaza plaza-${e.estado.toLowerCase()}`} title={titulo}>
                  {onSeleccionar && e.estado === "OCUPADO" ? (
                    <button type="button" className="plaza-boton" onClick={() => onSeleccionar(e)} aria-label={titulo}>
                      {contenido}
                    </button>
                  ) : (
                    <span className="plaza-boton" aria-label={titulo}>
                      {contenido}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <ul className="leyenda" aria-label="Convenciones">
        <li><span className="muestra plaza-libre" /> Libre</li>
        <li><span className="muestra plaza-ocupado" /> Ocupado</li>
        <li><span className="muestra plaza-reservado" /> Reservado</li>
        <li><span className="muestra plaza-fuera_de_servicio" /> Fuera de servicio</li>
      </ul>
    </div>
  );
}
