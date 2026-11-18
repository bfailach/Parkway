import { useEffect, useRef, useState } from "react";
import { api, ApiError, MetodoPago, Registro } from "../lib/api";
import { duracion, horaCorta, pesos } from "../lib/formato";
import { calcularCobro } from "../lib/tarifa";
import { Dialogo } from "./Dialogo";
import { Placa } from "./Placa";
import { Tiquete } from "./Tiquete";

const METODOS: { id: MetodoPago; nombre: string }[] = [
  { id: "EFECTIVO", nombre: "Efectivo" },
  { id: "TARJETA", nombre: "Tarjeta" },
  { id: "TRANSFERENCIA", nombre: "Transferencia" },
];

/** Billetes con los que suele pagar el cliente: el exacto y los siguientes redondos. */
export function billetesSugeridos(valor: number): number[] {
  const opciones = [2000, 5000, 10000, 20000, 50000, 100000].map((b) => Math.ceil(valor / b) * b).filter((v) => v > valor);
  return [...new Set(opciones)].sort((a, b) => a - b).slice(0, 3);
}

/** Minutos desde el ingreso, actualizados cada 20 s para que el valor no quede viejo. */
function useMinutos(ingreso: string | undefined) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, []);
  return ingreso ? Math.max(1, Math.ceil((ahora - new Date(ingreso).getTime()) / 60000)) : 0;
}

/**
 * Salida con pago (RF07 y RF08). El operador elige el medio de pago y
 * confirma: en una sola transacción se cierra el registro, se libera el
 * espacio, se aprueba el pago y se emite el comprobante.
 * Se abre desde la lista de vehículos activos o desde una plaza del plano 3D.
 */
export function SalidaDialogo({
  registro,
  sede,
  onCerrar,
  onRegistrada,
}: {
  registro: Registro | null;
  sede: string;
  onCerrar: () => void;
  onRegistrada?: (r: Registro) => void;
}) {
  const [resultado, setResultado] = useState<Registro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [referencia, setReferencia] = useState("");
  const refInput = useRef<HTMLInputElement>(null);
  const minutos = useMinutos(registro?.fecha_ingreso);

  useEffect(() => {
    setResultado(null);
    setError(null);
    setErrores({});
    setMetodo("EFECTIVO");
    setRecibido("");
    setReferencia("");
  }, [registro?.id_registro]);

  const cobro = registro && registro.valor_hora != null ? calcularCobro(minutos, registro) : null;
  const valor = cobro ? cobro.total : registro?.valor_estimado ?? 0;
  const recibidoNum = Number(recibido.replace(/\D/g, "")) || 0;
  const cambio = metodo === "EFECTIVO" && recibidoNum ? recibidoNum - valor : null;
  const falta = metodo === "EFECTIVO" && recibidoNum > 0 && recibidoNum < valor;

  function elegir(m: MetodoPago) {
    setMetodo(m);
    setErrores({});
    setError(null);
    if (m !== "EFECTIVO") window.setTimeout(() => refInput.current?.focus(), 0);
  }

  async function confirmar() {
    if (!registro) return;
    if ((metodo === "TARJETA" || metodo === "TRANSFERENCIA") && !referencia.trim()) {
      setErrores({ referencia: metodo === "TARJETA" ? "Digite el número de aprobación del datáfono" : "Digite la referencia de la transferencia" });
      refInput.current?.focus();
      return;
    }
    setEnviando(true);
    setError(null);
    setErrores({});
    try {
      const r = await api.salida(registro.id_registro, {
        metodo,
        recibido: metodo === "EFECTIVO" && recibidoNum ? recibidoNum : undefined,
        referencia: metodo === "EFECTIVO" ? undefined : referencia,
      });
      setResultado(r);
      onRegistrada?.(r);
    } catch (ex) {
      if (ex instanceof ApiError) {
        setError(ex.message);
        setErrores(ex.campos);
      } else setError("No se pudo registrar la salida");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={!!registro} titulo={resultado ? "Salida registrada" : "Salida y pago"} onCerrar={onCerrar}>
      {registro && !resultado && (
        <>
          <div className="confirmacion">
            <Placa placa={registro.placa} tamano="md" />
            <dl className="tiquete-datos">
              <div><dt>Espacio</dt><dd>{registro.codigo_espacio}</dd></div>
              <div><dt>Ingreso</dt><dd>{horaCorta(registro.fecha_ingreso)}</dd></div>
              <div><dt>Tiempo</dt><dd>{duracion(minutos)}</dd></div>
            </dl>
            <div className="cobro-total">
              <span>Total a pagar</span>
              <strong>{pesos(valor)}</strong>
            </div>
            {cobro?.topeLegalAplicado && (
              <p className="tenue cobro-tope">Se aplicó el tope del Decreto 026 de 2026: {pesos(registro.tope_minuto ?? 0)} por minuto.</p>
            )}
          </div>

          <fieldset className="campo pago-metodos">
            <legend className="campo-rotulo">Medio de pago</legend>
            <div className="segmentos" role="radiogroup" aria-label="Medio de pago">
              {METODOS.map((m) => (
                <label key={m.id} className="segmento">
                  <input type="radio" name="metodo" checked={metodo === m.id} onChange={() => elegir(m.id)} />
                  <span>{m.nombre}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {metodo === "EFECTIVO" ? (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="recibido">Recibido <span className="opcional">(vacío si paga exacto)</span></label>
              <input
                id="recibido"
                inputMode="numeric"
                placeholder={pesos(valor)}
                value={recibido ? pesos(recibidoNum) : ""}
                onChange={(e) => setRecibido(e.target.value.replace(/\D/g, "").slice(0, 7))}
                aria-invalid={falta || !!errores.recibido}
              />
              <div className="billetes">
                {billetesSugeridos(valor).map((b) => (
                  <button key={b} type="button" className="boton boton-barra" onClick={() => setRecibido(String(b))}>{pesos(b)}</button>
                ))}
              </div>
              {errores.recibido ? <span className="campo-error">{errores.recibido}</span>
                : falta ? <span className="campo-error">Faltan {pesos(valor - recibidoNum)}</span>
                : cambio != null ? <span className="cambio">Cambio: <strong>{pesos(cambio)}</strong></span>
                : null}
            </div>
          ) : (
            <label className="campo">
              <span className="campo-rotulo">{metodo === "TARJETA" ? "Número de aprobación del datáfono" : "Referencia de la transferencia"}</span>
              <input
                ref={refInput}
                value={referencia}
                inputMode={metodo === "TARJETA" ? "numeric" : "text"}
                placeholder={metodo === "TARJETA" ? "482913" : "NQ-2026-00981"}
                onChange={(e) => setReferencia(metodo === "TARJETA" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value.toUpperCase().slice(0, 30))}
                aria-invalid={!!errores.referencia}
              />
              {errores.referencia ? <span className="campo-error">{errores.referencia}</span>
                : <span className="campo-ayuda">El sistema no deja registrar dos veces la misma {metodo === "TARJETA" ? "aprobación" : "referencia"}.</span>}
            </label>
          )}

          {error && !Object.keys(errores).length && <p className="alerta alerta-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-texto" onClick={onCerrar}>Cancelar</button>
            <button className="boton boton-primario" onClick={confirmar} disabled={enviando || falta}>
              {enviando ? "Registrando..." : `Cobrar ${pesos(valor)} y dar salida`}
            </button>
          </div>
        </>
      )}
      {resultado && (
        <>
          <Tiquete registro={resultado} sede={sede} />
          <div className="dialogo-acciones">
            <button className="boton boton-primario" onClick={onCerrar} autoFocus>Listo</button>
          </div>
        </>
      )}
    </Dialogo>
  );
}
