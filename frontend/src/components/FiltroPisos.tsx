/**
 * Filtro de pisos del plano: "Todos" o un piso. En el 3D, los pisos no
 * elegidos quedan translúcidos; en el plano 2D se ocultan.
 */
export function FiltroPisos({ pisos, valor, onChange }: { pisos: number; valor: number | null; onChange: (p: number | null) => void }) {
  if (pisos < 2) return null;
  return (
    <div className="conmutador" role="radiogroup" aria-label="Piso">
      <button type="button" role="radio" aria-checked={valor === null} aria-selected={valor === null} onClick={() => onChange(null)}>
        Todos
      </button>
      {Array.from({ length: pisos }, (_, i) => i + 1).map((p) => (
        <button key={p} type="button" role="radio" aria-checked={valor === p} aria-selected={valor === p} onClick={() => onChange(p)}>
          Piso {p}
        </button>
      ))}
    </div>
  );
}

/** Cantidad de pisos según los espacios recibidos. */
export const contarPisos = (espacios: { piso?: number | null }[] | null | undefined) =>
  Math.max(1, ...(espacios ?? []).map((e) => Number(e.piso) || 1));
