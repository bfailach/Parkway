import { useId } from "react";

// Marca de Parkway: la señal azul con la esquina doblada como un tiquete
// y una P geométrica grande que el borde inferior recorta.
const CUERPO =
  "M14 4H74L92 22V82a10 10 0 0 1-10 10H14a10 10 0 0 1-10-10V14a10 10 0 0 1 10-10z";

export function SenalP({ pequena = false, className = "" }: { pequena?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const recorte = `senal-recorte-${id}`;
  return (
    <svg
      className={`senal-p${pequena ? " senal-p-sm" : ""}${className ? ` ${className}` : ""}`}
      viewBox="4 4 88 88"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={recorte}>
          <path d={CUERPO} />
        </clipPath>
      </defs>
      <path d={CUERPO} fill="#1F5FAF" />
      <path
        d="M32 104V28h20a20 20 0 0 1 0 40H32"
        fill="none"
        stroke="#fff"
        strokeWidth="17"
        clipPath={`url(#${recorte})`}
      />
      <path d="M74 4V22H92z" fill="#123E75" />
    </svg>
  );
}
