import { EspacioMapa } from "../lib/api";
import { horaCorta, pluralTipo } from "../lib/formato";
import { esCodigoBici } from "./Placa";

/**
 * Plano 2D de la sede: cada espacio se dibuja como una plaza con líneas de
 * demarcación. Para el personal, las plazas ocupadas y reservadas muestran
 * el identificador del vehículo (placa o código de bicicleta). Al hacer
 * clic en una plaza se abre su detalle.
 */
const ETIQUETA_ESTADO: Record<EspacioMapa["estado"], string> = {
  LIBRE: "Libre",
  OCUPADO: "Ocupado",
  RESERVADO: "Reservado",
  FUERA_DE_SERVICIO: "Fuera de servicio",
};

/** Símbolo de cada estado, para no depender solo del color. */
const SIMBOLO: Record<EspacioMapa["estado"], string> = {
  LIBRE: "✓",
  OCUPADO: "■",
  RESERVADO: "◆",
  FUERA_DE_SERVICIO: "✕",
};

interface Props {
  espacios: EspacioMapa[];
  onSeleccionar?: (e: EspacioMapa) => void;
  seleccionado?: number | null;
  resaltado?: number | null;
}

export function MapaEspacios({ espacios, onSeleccionar, seleccionado, resaltado }: Props) {
  // Con varios pisos, cada grupo es un tipo de vehículo dentro de su piso.
  const variosPisos = new Set(espacios.map((e) => e.piso ?? 1)).size > 1 || espacios.some((e) => (e.piso ?? 1) > 1);
  const grupos = new Map<string, { piso: number; tipo: string; lista: EspacioMapa[] }>();
  [...espacios]
    .sort((a, b) => (a.piso ?? 1) - (b.piso ?? 1))
    .forEach((e) => {
      const clave = `${e.piso ?? 1}|${e.tipo}`;
      if (!grupos.has(clave)) grupos.set(clave, { piso: e.piso ?? 1, tipo: e.tipo, lista: [] });
      grupos.get(clave)!.lista.push(e);
    });

  return (
    <div className="mapa">
      {[...grupos.entries()].map(([clave, { piso, tipo, lista }]) => (
        <section key={clave} className="mapa-zona" aria-label={variosPisos ? `Piso ${piso}, ${pluralTipo(tipo)}` : pluralTipo(tipo)}>
          <h3 className="mapa-zona-titulo">
            {variosPisos && <span className="mapa-zona-piso">Piso {piso}</span>}
            {pluralTipo(tipo)}
            <span className="mapa-zona-cuenta">
              {lista.filter((e) => e.estado === "LIBRE").length} de {lista.length} libres
            </span>
          </h3>
          <ul className={`plazas plazas-${tipo.toLowerCase()}`}>
            {lista.map((e) => {
              const titulo = `${e.codigo}: ${ETIQUETA_ESTADO[e.estado]}${e.placa ? `, ${e.placa}` : ""}${e.fecha_ingreso ? ` desde ${horaCorta(e.fecha_ingreso)}` : ""}`;
              const contenido = (
                <>
                  <span className="plaza-cabeza">
                    <span className="plaza-codigo">{e.codigo}</span>
                    <span className="plaza-simbolo" aria-hidden="true">{SIMBOLO[e.estado]}</span>
                  </span>
                  {e.placa && <span className={`plaza-placa ${esCodigoBici(e.placa) ? "plaza-bici" : ""}`}>{e.placa}</span>}
                </>
              );
              const clases = `plaza plaza-${e.estado.toLowerCase()} ${seleccionado === e.id_espacio ? "plaza-seleccionada" : ""} ${resaltado === e.id_espacio ? "plaza-resaltada" : ""}`;
              return (
                <li key={e.id_espacio} className={clases} title={titulo}>
                  {onSeleccionar ? (
                    <button
                      type="button"
                      className="plaza-boton"
                      onClick={() => onSeleccionar(e)}
                      aria-label={titulo}
                      aria-pressed={seleccionado === e.id_espacio}
                    >
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
        <li><span className="muestra plaza-libre" /> Libre <span className="plaza-simbolo" aria-hidden="true">{SIMBOLO.LIBRE}</span></li>
        <li><span className="muestra plaza-ocupado" /> Ocupado <span className="plaza-simbolo" aria-hidden="true">{SIMBOLO.OCUPADO}</span></li>
        <li><span className="muestra plaza-reservado" /> Reservado <span className="plaza-simbolo" aria-hidden="true">{SIMBOLO.RESERVADO}</span></li>
        <li><span className="muestra plaza-fuera_de_servicio" /> Fuera de servicio <span className="plaza-simbolo" aria-hidden="true">{SIMBOLO.FUERA_DE_SERVICIO}</span></li>
      </ul>
    </div>
  );
}
