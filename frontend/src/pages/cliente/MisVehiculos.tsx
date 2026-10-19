import { FormEvent, useState } from "react";
import { api, ApiError, TipoVehiculo, VehiculoCliente } from "../../lib/api";
import { useConsulta } from "../../lib/useConsulta";
import { FORMATO_PLACA, nombreTipo, normalizarPlaca } from "../../lib/formato";
import { Placa } from "../../components/Placa";
import { CampoOpciones, COLORES, MARCAS } from "../../components/CampoOpciones";

/** Vehículos del cliente (RF04): registrar, consultar y quitar. */
export function MisVehiculos({ tipos }: { tipos: TipoVehiculo[] }) {
  const vehiculos = useConsulta(() => api.cliente.vehiculos(), []);
  const lista = vehiculos.datos ?? [];

  return (
    <div className="pagina pagina-dividida">
      <div>
        <header className="pagina-cabeza">
          <div>
            <h1 className="pagina-titulo">Mis vehículos</h1>
            <p className="pagina-sub">Solo puedes reservar con los vehículos registrados en tu cuenta.</p>
          </div>
        </header>
        {vehiculos.error && <p className="alerta alerta-error" role="alert">{vehiculos.error}</p>}
        {vehiculos.datos && lista.length === 0 ? (
          <div className="vacio"><p>Aún no tienes vehículos. Agrega la placa con el formulario.</p></div>
        ) : (
          <ul className="vehiculos-lista">
            {lista.map((v) => <FilaVehiculo key={v.placa} v={v} onCambio={vehiculos.recargar} />)}
          </ul>
        )}
      </div>
      <FormVehiculo tipos={tipos} onAgregado={vehiculos.recargar} />
    </div>
  );
}

function FilaVehiculo({ v, onCambio }: { v: VehiculoCliente; onCambio: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ocupado = v.dentro || v.con_reserva;

  async function quitar() {
    setError(null);
    try {
      await api.cliente.quitarVehiculo(v.placa);
      onCambio();
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : "No se pudo quitar el vehículo");
      setConfirmando(false);
    }
  }

  return (
    <li className="vehiculo-fila">
      <Placa placa={v.placa} tamano="md" />
      <div className="vehiculo-info">
        <strong>{nombreTipo(v.tipo)}</strong>
        <span className="tenue">{[v.tipo === "BICICLETA" ? null : v.marca, v.color?.toLowerCase()].filter(Boolean).join(", ") ||
            (v.tipo === "BICICLETA" ? "Sin color registrado" : "Sin marca ni color")}</span>
        <span className={`chip ${v.dentro ? "chip-dentro" : v.con_reserva ? "chip-reserva" : "chip-libre"}`}>
          {v.dentro ? "Dentro del parqueadero" : v.con_reserva ? "Con reserva activa" : "Disponible"}
        </span>
        {error && <span className="campo-error">{error}</span>}
      </div>
      <div className="vehiculo-acciones">
        {confirmando ? (
          <>
            <button className="boton boton-secundario" onClick={() => setConfirmando(false)}>No</button>
            <button className="boton boton-peligro" onClick={quitar}>Quitar</button>
          </>
        ) : (
          <button
            className="boton boton-texto"
            onClick={() => setConfirmando(true)}
            disabled={ocupado}
            title={ocupado ? "No se puede quitar mientras está dentro o reservado" : undefined}
          >
            Quitar
          </button>
        )}
      </div>
    </li>
  );
}

function FormVehiculo({ tipos, onAgregado }: { tipos: TipoVehiculo[]; onAgregado: () => void }) {
  const [idTipo, setIdTipo] = useState(1);
  const [placa, setPlaca] = useState("");
  const [marca, setMarca] = useState("");
  const [color, setColor] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [envios, setEnvios] = useState(0);
  const formato = FORMATO_PLACA[idTipo];
  const esBicicleta = idTipo === 3; // las bicicletas no llevan marca

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const p = normalizarPlaca(placa);
    const err: Record<string, string> = {};
    if (!p) err.placa = "Escriba la placa";
    else if (!formato.regex.test(p)) err.placa = `Formato inválido. Ejemplo: ${formato.ejemplo}`;
    setErrores(err);
    setMensaje(null);
    if (Object.keys(err).length) return;
    setEnviando(true);
    try {
      await api.cliente.agregarVehiculo({
        placa: p,
        idTipo,
        marca: esBicicleta ? undefined : marca.trim() || undefined,
        color: color.trim() || undefined,
      });
      setMensaje({ tipo: "ok", texto: `Agregamos ${p} a tu cuenta.` });
      setPlaca("");
      setMarca("");
      setColor("");
      setEnvios((n) => n + 1);
      onAgregado();
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrores(ex.campos);
        setMensaje({ tipo: "error", texto: ex.message });
      } else setMensaje({ tipo: "error", texto: "No se pudo agregar el vehículo" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="formulario panel-form" onSubmit={enviar} noValidate>
      <h2 className="bloque-titulo">Agregar vehículo</h2>
      {mensaje && <p className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status">{mensaje.texto}</p>}

      <fieldset className="campo">
        <legend className="campo-rotulo">Tipo de vehículo</legend>
        <div className="segmentos">
          {tipos.map((t) => (
            <label key={t.id_tipo} className="segmento">
              <input type="radio" name="tipo-vehiculo" checked={idTipo === t.id_tipo} onChange={() => { setIdTipo(t.id_tipo); setMarca(""); }} />
              <span>{nombreTipo(t.nombre)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="campo campo-placa">
        <span className="campo-rotulo">Placa</span>
        <span className={`placa-entrada placa-entrada-sm ${errores.placa ? "con-error" : ""}`}>
          <input
            value={placa}
            onChange={(e) => setPlaca(normalizarPlaca(e.target.value).slice(0, formato.max))}
            placeholder={formato.ejemplo}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errores.placa}
            aria-describedby="ayuda-placa-cliente"
          />
          <span className="placa-ciudad" aria-hidden="true">BOGOTÁ D.C.</span>
        </span>
        <span className={errores.placa ? "campo-error" : "campo-ayuda"} id="ayuda-placa-cliente">
          {errores.placa ?? (esBicicleta ? "Código del sticker o del marco, de 3 a 10 caracteres" : `Formato: ${formato.ejemplo}`)}
        </span>
      </label>

      <div className={esBicicleta ? "" : "fila-campos"}>
        {!esBicicleta && (
          <CampoOpciones
            key={`marca-${idTipo}-${envios}`}
            rotulo="Marca"
            opciones={MARCAS[idTipo] ?? []}
            valor={marca}
            onChange={setMarca}
            maxLength={40}
            error={errores.marca}
          />
        )}
        <CampoOpciones key={`color-${envios}`} rotulo="Color" opciones={COLORES} valor={color} onChange={setColor} maxLength={20} error={errores.color} />
      </div>

      <button className="boton boton-primario boton-ancho" disabled={enviando}>
        {enviando ? "Agregando..." : "Agregar vehículo"}
      </button>
    </form>
  );
}
