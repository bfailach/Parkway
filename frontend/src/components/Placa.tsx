/**
 * Placa con la apariencia de una placa colombiana: fondo amarillo,
 * borde negro, caracteres condensados y la ciudad debajo.
 * Las bicicletas no tienen placa: su código (BICI001) se muestra como una
 * etiqueta con el ícono de bicicleta.
 */
interface Props {
  placa: string;
  tamano?: "sm" | "md";
  ciudad?: string;
}

export const esCodigoBici = (placa: string) => /^BICI\d+$/.test(placa);

export function IconoBici({ className = "icono" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5 9.5 8h5l4 8.5M9.5 8 12 16.5h-6.5M14 5h2.5l-2 3" />
    </svg>
  );
}

export function Placa({ placa, tamano = "sm", ciudad }: Props) {
  if (esCodigoBici(placa)) {
    return (
      <span className={`codigo-bici codigo-bici-${tamano}`} aria-label={`Bicicleta ${placa}`}>
        <IconoBici />
        <span>{placa}</span>
      </span>
    );
  }
  const texto = placa.length === 6 ? `${placa.slice(0, 3)} ${placa.slice(3)}` : placa;
  return (
    <span className={`placa placa-${tamano}`} aria-label={`Placa ${placa}`}>
      <span className="placa-numero">{texto}</span>
      {tamano === "md" && <span className="placa-ciudad">{ciudad ?? "BOGOTÁ D.C."}</span>}
    </span>
  );
}
