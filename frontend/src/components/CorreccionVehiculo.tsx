import { useEffect, useState } from "react";
import { api, ApiError, CorreccionCobro, SimulacionCobro } from "../lib/api";
import { FORMATO_PLACA, normalizarPlaca, pesos } from "../lib/formato";
import { Placa } from "./Placa";
import { Selector } from "./Selector";

/**
 * Corrección de un vehículo mal registrado (otra placa u otro tipo).
 *
 * - modo "ingreso": el vehículo sigue dentro. Se corrigen placa, tipo,
 *   espacio y tarifa; la salida se cobrará con la tarifa correcta.
 * - modo "cobro" (administrador): la visita ya se pagó. Se muestra cuánto
 *   habría costado con el tipo correcto; si es menos, se anula el pago, se
 *   emite uno nuevo y la devolución queda registrada.
 *
 * Los formatos de placa de carro, moto y bicicleta no se cruzan: un tipo
 * equivocado siempre viene con una placa equivocada, por eso se piden juntos.
 */
const TIPOS = [
  { id: 1, nombre: "Automóvil" },
  { id: 2, nombre: "Motocicleta" },
  { id: 3, nombre: "Bicicleta" },
];
const ID_TIPO: Record<string, number> = { AUTOMOVIL: 1, MOTOCICLETA: 2, BICICLETA: 3 };

export interface RegistroACorregir {
  idRegistro: number;
  placa: string;
  /** Nombre del tipo como lo guarda la base (AUTOMOVIL, MOTOCICLETA, BICICLETA). */
  tipo: string;
  valor?: number | null;
}

export function CorreccionVehiculo({
  modo,
  registro,
  idReclamo,
  onListo,
  onCancelar,
}: {
  modo: "ingreso" | "cobro";
  registro: RegistroACorregir;
  idReclamo?: number;
  onListo: (mensaje: string) => void;
  onCancelar?: () => void;
}) {
  const tipoActual = ID_TIPO[registro.tipo] ?? 1;
  const [idTipo, setIdTipo] = useState(tipoActual === 1 ? 2 : 1);
  const [placa, setPlaca] = useState("");
  const [marca, setMarca] = useState("");
  const [color, setColor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [simulacion, setSimulacion] = useState<SimulacionCobro | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  // El error de formato se muestra al salir del campo, no mientras se escribe.
  const [placaTocada, setPlacaTocada] = useState(false);

  const formato = FORMATO_PLACA[idTipo];
  const placaNorm = normalizarPlaca(placa);
  const placaValida = formato.regex.test(placaNorm);
  const sinCambios = placaNorm === registro.placa && idTipo === tipoActual;

  // Vista previa del nuevo valor (solo en la corrección de un cobro).
  useEffect(() => {
    if (modo !== "cobro") return;
    let vigente = true;
    setSimulacion(null);
    api.admin.simularCobro(registro.idRegistro, idTipo).then((s) => vigente && setSimulacion(s)).catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [modo, registro.idRegistro, idTipo]);

  async function enviar() {
    setEnviando(true);
    setError(null);
    setErrores({});
    try {
      const d = { placa: placaNorm, idTipo, motivo: motivo.trim(), marca: marca.trim() || undefined, color: color.trim() || undefined };
      if (modo === "ingreso") {
        const r = await api.corregirIngreso(registro.idRegistro, d);
        onListo(`Ingreso corregido: ${r.placa}, ${TIPOS.find((t) => t.id === idTipo)?.nombre.toLowerCase()} en el espacio ${r.codigo_espacio}. La salida se cobrará con su tarifa.`);
      } else {
        const c: CorreccionCobro = await api.admin.corregirCobro(registro.idRegistro, { ...d, idReclamo });
        onListo(
          c.devolucion > 0
            ? `Cobro corregido a ${pesos(c.valor)}. Devuelva ${pesos(c.devolucion)} al cliente${c.metodo && c.metodo !== "EFECTIVO" ? ` por ${c.metodo === "TARJETA" ? "el datáfono" : "transferencia"}` : " en efectivo"}.`
            : `Visita corregida a ${c.placa}. El valor no cambia.`
        );
      }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setErrores(e.campos);
    } finally {
      setEnviando(false);
    }
  }

  const listo = placaValida && !sinCambios && motivo.trim().length >= 5 && (modo === "ingreso" || simulacion?.permitido !== false);

  return (
    <div className="correccion">
      <div className="correccion-actual">
        <span className="correccion-rotulo">Registrado como</span>
        <div className="correccion-actual-datos">
          <Placa placa={registro.placa} />
          <span>{TIPOS.find((t) => t.id === tipoActual)?.nombre}</span>
          {registro.valor != null && <span className="tenue">Cobrado {pesos(registro.valor)}</span>}
        </div>
      </div>

      <div className="fila-campos">
        <div className="campo">
          <span className="campo-rotulo">Tipo correcto</span>
          <Selector
            etiqueta="Tipo correcto"
            valor={String(idTipo)}
            opciones={TIPOS.map((t) => ({ valor: String(t.id), texto: t.nombre }))}
            onChange={(v) => setIdTipo(Number(v))}
          />
        </div>
        <label className="campo">
          <span className="campo-rotulo">{idTipo === 3 ? "Código correcto" : "Placa correcta"}</span>
          <input
            value={placa}
            maxLength={formato.max + 2}
            placeholder={formato.ejemplo}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            onBlur={() => setPlacaTocada(true)}
            aria-invalid={Boolean(placaTocada && placaNorm && !placaValida) || Boolean(errores.placa)}
          />
          {(errores.placa || (placaTocada && placaNorm && !placaValida)) && (
            <span className="campo-error">{errores.placa ?? `Formato: ${formato.ejemplo}`}</span>
          )}
        </label>
      </div>

      {modo === "ingreso" && (
        <div className="fila-campos">
          <label className="campo">
            <span className="campo-rotulo">Marca (opcional)</span>
            <input value={marca} maxLength={30} onChange={(e) => setMarca(e.target.value)} />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Color (opcional)</span>
            <input value={color} maxLength={30} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
      )}

      <label className="campo campo-motivo">
        <span className="campo-rotulo">¿Qué se corrige?</span>
        <input
          value={motivo}
          maxLength={200}
          placeholder="Por ejemplo: era una moto, se registró como carro"
          onChange={(e) => setMotivo(e.target.value)}
        />
        {errores.motivo && <span className="campo-error">{errores.motivo}</span>}
        <span className="campo-ayuda">
          {modo === "ingreso"
            ? "Si el tipo cambia, el vehículo pasa al primer espacio libre de ese tipo. El cliente recibe un aviso."
            : "Queda en la bitácora y el cliente recibe un aviso con la devolución."}
        </span>
      </label>

      {modo === "cobro" && simulacion && placaValida && !sinCambios && (
        <p className={`alerta ${simulacion.permitido ? "alerta-ok" : "alerta-error"}`} role="status">
          {simulacion.permitido
            ? `Con este tipo la visita (${simulacion.minutos} min) cuesta ${pesos(simulacion.valor)}. Devolución: ${pesos(simulacion.devolucion)}.`
            : `Con este tipo costaría ${pesos(simulacion.valor)}, más que lo cobrado. La corrección solo puede devolver dinero.`}
        </p>
      )}

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      <div className="dialogo-acciones">
        {onCancelar && <button type="button" className="boton boton-texto" onClick={onCancelar}>Cancelar</button>}
        <button className="boton boton-primario" disabled={!listo || enviando} onClick={enviar}>
          {enviando ? "Guardando..." : modo === "ingreso" ? "Corregir ingreso" : "Corregir cobro"}
        </button>
      </div>
    </div>
  );
}
