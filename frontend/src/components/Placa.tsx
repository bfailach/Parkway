/**
 * Placa con la apariencia de una placa colombiana: fondo amarillo,
 * borde negro, caracteres condensados y la ciudad debajo.
 */
interface Props {
  placa: string;
  tamano?: "sm" | "md";
  ciudad?: string;
}

export function Placa({ placa, tamano = "sm", ciudad }: Props) {
  const texto = placa.length === 6 ? `${placa.slice(0, 3)} ${placa.slice(3)}` : placa;
  return (
    <span className={`placa placa-${tamano}`} aria-label={`Placa ${placa}`}>
      <span className="placa-numero">{texto}</span>
      {tamano === "md" && <span className="placa-ciudad">{ciudad ?? "BOGOTÁ D.C."}</span>}
    </span>
  );
}
