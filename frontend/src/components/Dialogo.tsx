import { ReactNode, useEffect, useRef } from "react";

interface Props {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}

/**
 * Ventana modal basada en <dialog>. Se cierra con la X, con Escape o con un
 * clic fuera de la ventana, y devuelve el foco al elemento que la abrió.
 */
export function Dialogo({ abierto, titulo, onCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Solo cierra si el clic empezó y terminó fuera (no al soltar una selección de texto).
  const presionFuera = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  const fuera = (e: React.MouseEvent<HTMLDialogElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
  };

  return (
    <dialog
      ref={ref}
      className="dialogo"
      onClose={onCerrar}
      aria-label={titulo}
      onMouseDown={(e) => (presionFuera.current = fuera(e))}
      onMouseUp={(e) => {
        if (presionFuera.current && fuera(e)) onCerrar();
        presionFuera.current = false;
      }}
    >
      <div className="dialogo-cabeza">
        <h2 className="dialogo-titulo">{titulo}</h2>
        <button type="button" className="boton-icono dialogo-cerrar" aria-label="Cerrar" title="Cerrar" onClick={onCerrar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {children}
    </dialog>
  );
}
