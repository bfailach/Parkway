/**
 * Número que cambia girando cada dígito, como el contador de un tablero
 * de cupos. Con movimiento reducido el cambio es inmediato (lo resuelve
 * la regla prefers-reduced-motion de styles.css).
 */
export function Odometro({ valor, className }: { valor: number | null | undefined; className?: string }) {
  const texto = valor == null ? "–" : String(valor);
  return (
    <span className={`odometro ${className ?? ""}`} aria-label={texto} role="text">
      {texto.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={texto.length - i} className="odometro-celda" aria-hidden="true">
            {/* El dígito invisible fija el ancho de la celda según el número actual. */}
            <span className="odometro-medida">{ch}</span>
            <span className="odometro-tira" style={{ transform: `translate(-50%, -${Number(ch) * 10}%)` }}>
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`s${i}`} aria-hidden="true">{ch}</span>
        )
      )}
    </span>
  );
}
