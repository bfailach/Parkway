import { ReactNode, useEffect, useRef } from "react";

interface Props {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}

/** Ventana modal basada en <dialog>: cierra con Escape y devuelve el foco. */
export function Dialogo({ abierto, titulo, onCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog ref={ref} className="dialogo" onClose={onCerrar} aria-label={titulo}>
      <h2 className="dialogo-titulo">{titulo}</h2>
      {children}
    </dialog>
  );
}
