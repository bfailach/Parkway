import { FormEvent, useEffect, useRef, useState } from "react";
import { horaCorta } from "../lib/formato";
import { api, ApiError, Parqueadero, Registro, TipoVehiculo } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { FORMATO_PLACA, nombreTipo, normalizarPlaca } from "../lib/formato";
import { Tiquete } from "../components/Tiquete";
import { CampoOpciones, COLORES, MARCAS } from "../components/CampoOpciones";
import { Selector } from "../components/Selector";

/**
 * Registro de ingreso (RF06).
 * Valida la placa según el tipo de vehículo antes de enviarla. El backend
 * asigna el primer espacio libre del tipo, o el que elija el operador.
 */
export const ID_BICICLETA = 3;

export function Ingreso({
  sede,
  tipos,
  inicial,
}: {
  sede: Parqueadero;
  tipos: TipoVehiculo[];
  /** Placa y tipo precargados, por ejemplo desde la lista de reservas. */
  inicial?: { placa: string; idTipo: number } | null;
}) {
  const [idTipo, setIdTipo] = useState(inicial?.idTipo ?? 1);
  const [placa, setPlaca] = useState(inicial?.placa ?? "");
  const [marca, setMarca] = useState("");
  const [color, setColor] = useState("");
  const [idEspacio, setIdEspacio] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<Registro | null>(null);
  const [envios, setEnvios] = useState(0);
  const placaRef = useRef<HTMLInputElement>(null);

  const resumen = useConsulta(() => api.resumen(sede.id_parqueadero), [sede.id_parqueadero, ultimo], 5000);
  const libres = useConsulta(() => api.espacios(sede.id_parqueadero), [sede.id_parqueadero, ultimo], 10000);
  const reservas = useConsulta(() => api.reservasSede(sede.id_parqueadero), [sede.id_parqueadero, ultimo], 15000);
  const reserva = (reservas.datos ?? []).find((r) => r.estado === "ACTIVA" && r.placa === normalizarPlaca(placa));
  const esBicicleta = idTipo === ID_BICICLETA;

  const tiposSede = tipos.filter((t) => resumen.datos?.porTipo.some((p) => p.id_tipo === t.id_tipo) ?? true);
  const cuposTipo = resumen.datos?.porTipo.find((p) => p.id_tipo === idTipo);
  const espaciosLibres = (libres.datos ?? []).filter((e) => e.id_tipo === idTipo && e.estado === "LIBRE");
  const formato = FORMATO_PLACA[idTipo];

  useEffect(() => {
    if (tiposSede.length && !tiposSede.some((t) => t.id_tipo === idTipo)) setIdTipo(tiposSede[0].id_tipo);
  }, [tiposSede, idTipo]);

  useEffect(() => {
    setIdEspacio("");
  }, [idTipo, sede.id_parqueadero]);

  // La marca depende del tipo de vehículo: al cambiar de tipo se borra.
  useEffect(() => {
    setMarca("");
  }, [idTipo]);

  // Si la placa tiene reserva, el tipo de vehículo se toma de la reserva.
  useEffect(() => {
    if (reserva && reserva.id_tipo !== idTipo) setIdTipo(reserva.id_tipo);
  }, [reserva, idTipo]);

  function validar() {
    const err: Record<string, string> = {};
    const p = normalizarPlaca(placa);
    if (!p) err.placa = "Escriba la placa del vehículo";
    else if (!formato.regex.test(p)) err.placa = `La placa no corresponde a ${nombreTipo(tiposSede.find((t) => t.id_tipo === idTipo)?.nombre ?? "")}. Ejemplo: ${formato.ejemplo}`;
    if (marca.length > 40) err.marca = "Máximo 40 caracteres";
    if (color.length > 20) err.color = "Máximo 20 caracteres";
    return err;
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const err = validar();
    setErrores(err);
    setMensaje(null);
    if (Object.keys(err).length) {
      placaRef.current?.focus();
      return;
    }
    setEnviando(true);
    try {
      const r = await api.ingreso({
        placa: normalizarPlaca(placa),
        idTipo,
        idParqueadero: sede.id_parqueadero,
        idEspacio: idEspacio ? Number(idEspacio) : undefined,
        marca: esBicicleta ? undefined : marca.trim() || undefined,
        color: color.trim() || undefined,
      });
      setUltimo(r);
      setEnvios((n) => n + 1);
      setPlaca("");
      setMarca("");
      setColor("");
      setIdEspacio("");
      placaRef.current?.focus();
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrores(ex.campos);
        setMensaje(ex.message);
      } else setMensaje("No se pudo registrar el ingreso");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina pagina-dividida">
      <form className="formulario" onSubmit={enviar} noValidate>
        <header className="pagina-cabeza">
          <div>
            <h1 className="pagina-titulo">Registrar ingreso</h1>
            <p className="pagina-sub">{sede.nombre}</p>
          </div>
        </header>

        {mensaje && <p className="alerta alerta-error" role="alert">{mensaje}</p>}

        <fieldset className="campo">
          <legend className="campo-rotulo">Tipo de vehículo</legend>
          <div className="segmentos">
            {tiposSede.map((t) => {
              const c = resumen.datos?.porTipo.find((p) => p.id_tipo === t.id_tipo);
              return (
                <label key={t.id_tipo} className="segmento">
                  <input type="radio" name="tipo" value={t.id_tipo} checked={idTipo === t.id_tipo} onChange={() => setIdTipo(t.id_tipo)} />
                  <span>
                    {nombreTipo(t.nombre)}
                    {c && <small>{c.libres} libres</small>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="campo campo-placa">
          <span className="campo-rotulo">Placa</span>
          <span className={`placa-entrada ${errores.placa ? "con-error" : ""}`}>
            <input
              ref={placaRef}
              value={placa}
              onChange={(e) => setPlaca(normalizarPlaca(e.target.value).slice(0, formato.max))}
              placeholder={formato.ejemplo}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              aria-invalid={!!errores.placa}
              aria-describedby="ayuda-placa"
            />
            <span className="placa-ciudad" aria-hidden="true">BOGOTÁ D.C.</span>
          </span>
          <span className={errores.placa ? "campo-error" : "campo-ayuda"} id="ayuda-placa">
            {errores.placa ?? (esBicicleta ? "Código del sticker o del marco, de 3 a 10 caracteres" : `Formato: ${formato.ejemplo}`)}
          </span>
        </label>

        {reserva && (
          <p className="alerta alerta-reserva" role="status">
            {reserva.cliente} reservó el espacio <strong>{reserva.codigo_espacio}</strong> para esta placa (vence a las{" "}
            {horaCorta(reserva.fecha_fin)}). Al registrar, el vehículo entra a ese espacio.
          </p>
        )}

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
          <CampoOpciones
            key={`color-${envios}`}
            rotulo="Color"
            opciones={COLORES}
            valor={color}
            onChange={setColor}
            maxLength={20}
            error={errores.color}
          />
        </div>

        <div className="campo">
          <span className="campo-rotulo">Espacio</span>
          <Selector
            etiqueta="Espacio"
            valor={reserva ? "" : idEspacio}
            disabled={!!reserva}
            invalido={!!errores.idEspacio}
            opciones={[
              { valor: "", texto: reserva ? `${reserva.codigo_espacio} (reservado)` : "Asignar el primero libre" },
              ...espaciosLibres.map((e) => ({ valor: String(e.id_espacio), texto: e.codigo })),
            ]}
            onChange={setIdEspacio}
          />
          {errores.idEspacio && <span className="campo-error">{errores.idEspacio}</span>}
        </div>

        {cuposTipo?.libres === 0 && (
          <p className="campo-ayuda aviso-cupos">No quedan cupos libres de este tipo. Solo pueden entrar vehículos con reserva.</p>
        )}
        <button className="boton boton-primario boton-ancho" disabled={enviando}>
          {enviando ? "Registrando..." : "Registrar ingreso"}
        </button>
      </form>

      <aside className="panel-tiquete" aria-live="polite">
        {ultimo ? (
          <>
            <p className="alerta alerta-ok">
              {ultimo.id_reserva
                ? `El vehículo tenía reserva. Ingresó a su espacio reservado ${ultimo.codigo_espacio}.`
                : "Ingreso registrado. Entregue el tiquete al conductor."}
            </p>
            <Tiquete key={ultimo.id_registro} registro={ultimo} sede={sede.nombre} />
          </>
        ) : (
          <div className="vacio">
            <p>El tiquete del último ingreso aparece aquí.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
