import { useMemo, useState } from "react";
import { EspacioMapa } from "../lib/api";
import { duracion } from "../lib/formato";

/**
 * Búsqueda por placa o por nombre del cliente dentro del plano (3D y 2D).
 * Busca entre las plazas ocupadas y reservadas de la sede; al elegir un
 * resultado, la plaza se resalta y se abre su ficha, desde donde se ve el
 * tiempo y el valor y se registra la salida.
 */
const normalizarPlaca = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalizarTexto = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function minutosDesde(fecha: string | null | undefined) {
  return fecha ? Math.max(1, Math.ceil((Date.now() - new Date(fecha).getTime()) / 60000)) : null;
}

export function BuscadorVehiculo({ espacios, onElegir }: { espacios: EspacioMapa[]; onElegir: (e: EspacioMapa) => void }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);

  const resultados = useMemo(() => {
    const placa = normalizarPlaca(q);
    const texto = normalizarTexto(q);
    if (texto.length < 2) return [];
    return espacios
      .filter((e) => (e.estado === "OCUPADO" || e.estado === "RESERVADO") && e.placa)
      .filter((e) => (placa && normalizarPlaca(e.placa ?? "").includes(placa)) || (e.cliente && normalizarTexto(e.cliente).includes(texto)))
      .sort((a, b) => Number(b.estado === "OCUPADO") - Number(a.estado === "OCUPADO"))
      .slice(0, 8);
  }, [q, espacios]);

  const elegir = (e: EspacioMapa) => {
    onElegir(e);
    setQ("");
    setAbierto(false);
  };

  return (
    <div className="buscador buscador-vehiculo">
      <label className="visualmente-oculto" htmlFor="buscar-vehiculo">Buscar vehículo por placa o nombre</label>
      <input
        id="buscar-vehiculo"
        type="search"
        placeholder="Buscar placa o nombre"
        autoComplete="off"
        value={q}
        onChange={(ev) => {
          setQ(ev.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" && resultados[0]) elegir(resultados[0]);
          if (ev.key === "Escape") setQ("");
        }}
        role="combobox"
        aria-expanded={abierto && q.trim().length >= 2}
        aria-controls="resultados-vehiculo"
      />
      {abierto && q.trim().length >= 2 && (
        <ul className="buscador-resultados" id="resultados-vehiculo" role="listbox">
          {resultados.length === 0 && <li className="buscador-vacio">No hay vehículos dentro ni reservas con ese dato.</li>}
          {resultados.map((e) => {
            const min = e.estado === "OCUPADO" ? minutosDesde(e.fecha_ingreso) : null;
            return (
              <li key={e.id_espacio} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => elegir(e)}>
                  <span className="buscador-placa">{e.placa}</span>
                  <span className="buscador-detalle">
                    {e.cliente ?? "Visitante sin cuenta"} · {e.codigo}
                    {e.piso != null && e.piso > 1 ? `, piso ${e.piso}` : ""}
                  </span>
                  <span className="buscador-tiempo">{e.estado === "OCUPADO" ? `Lleva ${duracion(min)}` : "Reserva"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
