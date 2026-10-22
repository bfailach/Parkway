import { FormEvent, useEffect, useRef, useState } from "react";
import { horaCorta } from "../lib/formato";
import { api, ApiError, Parqueadero, Registro, TipoVehiculo, VehiculoRegistrado } from "../lib/api";
import { useConsulta } from "../lib/useConsulta";
import { FORMATO_PLACA, nombreTipo, normalizarPlaca } from "../lib/formato";
import { Tiquete } from "../components/Tiquete";
import { CampoOpciones, COLORES, MARCAS } from "../components/CampoOpciones";
import { Selector } from "../components/Selector";
import { IconoBici } from "../components/Placa";

/**
 * Registro de ingreso (RF06).
 *
 * Carros y motos: el operador digita la placa. Si el vehículo ya está
 * registrado (por ejemplo, el cliente lo agregó a su cuenta), el formulario
 * se llena con su tipo, marca y color guardados; el operador puede
 * corregirlos y la corrección queda guardada.
 *
 * Bicicletas: no tienen placa. El operador busca el código que recibió la
 * bicicleta al registrarse (BICI001...) o, si llega sin registro, genera un
 * código nuevo al registrar el ingreso.
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
  const [generarCodigo, setGenerarCodigo] = useState(false);
  const [guardado, setGuardado] = useState<VehiculoRegistrado | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<{ registro: Registro; codigoNuevo: boolean } | null>(null);
  const [envios, setEnvios] = useState(0);
  const placaRef = useRef<HTMLInputElement>(null);

  const resumen = useConsulta(() => api.resumen(sede.id_parqueadero), [sede.id_parqueadero, ultimo], 5000);
  const libres = useConsulta(() => api.espacios(sede.id_parqueadero), [sede.id_parqueadero, ultimo], 10000);
  const reservas = useConsulta(() => api.reservasSede(sede.id_parqueadero), [sede.id_parqueadero, ultimo], 15000);
  const tarifas = useConsulta(() => api.tiposVehiculo(sede.id_parqueadero), [sede.id_parqueadero]);
  const placaNorm = normalizarPlaca(placa);
  const reserva = (reservas.datos ?? []).find((r) => r.estado === "ACTIVA" && r.placa === placaNorm);
  const esBicicleta = idTipo === ID_BICICLETA;

  const tiposSede = tipos.filter((t) => resumen.datos?.porTipo.some((p) => p.id_tipo === t.id_tipo) ?? true);
  const cuposTipo = resumen.datos?.porTipo.find((p) => p.id_tipo === idTipo);
  const espaciosLibres = (libres.datos ?? []).filter((e) => e.id_tipo === idTipo && e.estado === "LIBRE");
  const formato = FORMATO_PLACA[idTipo];
  const tarifa = tarifas.datos?.find((t) => t.id_tipo === idTipo);

  useEffect(() => {
    if (tiposSede.length && !tiposSede.some((t) => t.id_tipo === idTipo)) setIdTipo(tiposSede[0].id_tipo);
  }, [tiposSede, idTipo]);

  useEffect(() => {
    setIdEspacio("");
  }, [idTipo, sede.id_parqueadero]);

  // Si la placa tiene reserva, el tipo de vehículo se toma de la reserva.
  useEffect(() => {
    if (reserva && reserva.id_tipo !== idTipo) setIdTipo(reserva.id_tipo);
  }, [reserva, idTipo]);

  // Carros y motos: con la placa completa se buscan los datos guardados.
  useEffect(() => {
    setGuardado(null);
    setNuevo(false);
    if (esBicicleta) return;
    const completa = Object.entries(FORMATO_PLACA).find(([id, f]) => Number(id) !== ID_BICICLETA && f.regex.test(placaNorm));
    if (!completa) return;
    let vigente = true;
    const t = window.setTimeout(async () => {
      try {
        const v = await api.vehiculo(placaNorm);
        if (!vigente) return;
        setGuardado(v);
        if (v.id_tipo !== idTipo) setIdTipo(v.id_tipo);
        setMarca(v.marca ?? "");
        setColor(v.color ?? "");
      } catch (e) {
        if (vigente && e instanceof ApiError && e.status === 404) setNuevo(true);
      }
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placaNorm, esBicicleta]);

  function cambiarTipo(t: number) {
    if (t === idTipo) return;
    setIdTipo(t);
    setMarca("");
    if (!guardado) setColor("");
    setGenerarCodigo(false);
    setErrores({});
    if (t === ID_BICICLETA || idTipo === ID_BICICLETA) setPlaca("");
  }

  function elegirBicicleta(v: VehiculoRegistrado) {
    setPlaca(v.placa);
    setColor(v.color ?? "");
    setGuardado(v);
    setGenerarCodigo(false);
    setErrores({});
  }

  function validar() {
    const err: Record<string, string> = {};
    if (esBicicleta) {
      if (!generarCodigo && !placaNorm) err.placa = "Busque el código de la bicicleta o genere uno nuevo";
      else if (!generarCodigo && !formato.regex.test(placaNorm)) err.placa = `El código tiene la forma ${formato.ejemplo}`;
    } else if (!placaNorm) err.placa = "Escriba la placa del vehículo";
    else if (!formato.regex.test(placaNorm))
      err.placa = `La placa no corresponde a ${nombreTipo(tiposSede.find((t) => t.id_tipo === idTipo)?.nombre ?? "")}. Ejemplo: ${formato.ejemplo}`;
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
        placa: generarCodigo ? undefined : placaNorm,
        generarCodigo: esBicicleta && generarCodigo ? true : undefined,
        idTipo,
        idParqueadero: sede.id_parqueadero,
        idEspacio: idEspacio ? Number(idEspacio) : undefined,
        marca: esBicicleta ? undefined : marca.trim() || undefined,
        color: color.trim() || undefined,
      });
      setUltimo({ registro: r, codigoNuevo: esBicicleta && generarCodigo });
      setEnvios((n) => n + 1);
      setPlaca("");
      setMarca("");
      setColor("");
      setIdEspacio("");
      setGenerarCodigo(false);
      setGuardado(null);
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

  // La clave fuerza a los campos de marca y color a tomar los datos guardados.
  const claveDatos = `${idTipo}-${envios}-${guardado?.placa ?? ""}-${generarCodigo}`;

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
                  <input type="radio" name="tipo" value={t.id_tipo} checked={idTipo === t.id_tipo} onChange={() => cambiarTipo(t.id_tipo)} />
                  <span>
                    {nombreTipo(t.nombre)}
                    {c && <small>{c.libres} {c.libres === 1 ? "libre" : "libres"}</small>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {esBicicleta ? (
          <BuscadorBici
            valor={placa}
            onEscribir={(v) => {
              setPlaca(v);
              setGuardado(null);
            }}
            onElegir={elegirBicicleta}
            generarCodigo={generarCodigo}
            onGenerar={(g) => {
              setGenerarCodigo(g);
              setPlaca("");
              setGuardado(null);
              setColor("");
              setErrores({});
            }}
            error={errores.placa}
            entradaRef={placaRef}
          />
        ) : (
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
              {errores.placa ?? `Formato: ${formato.ejemplo}`}
            </span>
          </label>
        )}

        {guardado && !esBicicleta && (
          <p className="alerta alerta-datos" role="status">
            {guardado.cliente ? <>Vehículo de <strong>{guardado.cliente}</strong>.</> : "Vehículo que ya había entrado antes."}{" "}
            Llenamos la marca y el color guardados; puede cambiarlos si no coinciden.
            {guardado.dentro && <span className="texto-alerta"> Este vehículo figura dentro del parqueadero.</span>}
          </p>
        )}
        {nuevo && !esBicicleta && !reserva && <p className="campo-ayuda aviso-nuevo">Vehículo nuevo: se registrará con estos datos.</p>}

        {reserva && (
          <p className="alerta alerta-reserva" role="status">
            {reserva.cliente} reservó el espacio <strong>{reserva.codigo_espacio}</strong> para esta placa (vence a las{" "}
            {horaCorta(reserva.fecha_fin)}). Al registrar, el vehículo entra a ese espacio.
          </p>
        )}

        <div className={esBicicleta ? "" : "fila-campos"}>
          {!esBicicleta && (
            <CampoOpciones
              key={`marca-${claveDatos}`}
              rotulo="Marca"
              opciones={MARCAS[idTipo] ?? []}
              valor={marca}
              onChange={setMarca}
              maxLength={40}
              error={errores.marca}
            />
          )}
          <CampoOpciones
            key={`color-${claveDatos}`}
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

        {tarifa?.valor_hora != null && (
          <p className="campo-ayuda tarifa-ingreso">
            Tarifa de la sede: {tarifa.valor_hora.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })} la hora
          </p>
        )}
        {cuposTipo?.libres === 0 && (
          <p className="campo-ayuda aviso-cupos">No quedan cupos libres de este tipo. Solo pueden entrar vehículos con reserva.</p>
        )}
        <button className="boton boton-primario boton-ancho" disabled={enviando}>
          {enviando ? "Registrando..." : esBicicleta && generarCodigo ? "Generar código y registrar" : "Registrar ingreso"}
        </button>
      </form>

      <aside className="panel-tiquete" aria-live="polite">
        {ultimo ? (
          <>
            <p className="alerta alerta-ok">
              {ultimo.codigoNuevo
                ? `Código asignado: ${ultimo.registro.placa}. Escríbalo en el sticker de la bicicleta y entréguelo al ciclista.`
                : ultimo.registro.id_reserva
                  ? `El vehículo tenía reserva. Ingresó a su espacio reservado ${ultimo.registro.codigo_espacio}.`
                  : "Ingreso registrado. Entregue el tiquete al conductor."}
            </p>
            <Tiquete key={ultimo.registro.id_registro} registro={ultimo.registro} sede={sede.nombre} />
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

/**
 * Búsqueda de bicicletas por su código. Muestra las coincidencias de la
 * base de datos con su color y su dueño, y permite generar un código nuevo
 * para una bicicleta que llega sin registro.
 */
function BuscadorBici({
  valor,
  onEscribir,
  onElegir,
  generarCodigo,
  onGenerar,
  error,
  entradaRef,
}: {
  valor: string;
  onEscribir: (v: string) => void;
  onElegir: (v: VehiculoRegistrado) => void;
  generarCodigo: boolean;
  onGenerar: (g: boolean) => void;
  error?: string;
  entradaRef: React.RefObject<HTMLInputElement>;
}) {
  const [resultados, setResultados] = useState<VehiculoRegistrado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const q = normalizarPlaca(valor);

  useEffect(() => {
    if (q.length < 2 || generarCodigo) {
      setResultados([]);
      return;
    }
    let vigente = true;
    const t = window.setTimeout(() => {
      api
        .buscarVehiculos(q, ID_BICICLETA)
        .then((r) => vigente && (setResultados(r), setActivo(0)))
        .catch(() => vigente && setResultados([]));
    }, 180);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [q, generarCodigo]);

  if (generarCodigo) {
    return (
      <div className="campo">
        <span className="campo-rotulo">Bicicleta sin registro</span>
        <div className="bici-nueva">
          <IconoBici />
          <p>
            Al registrar el ingreso se le asigna el siguiente código libre (BICI…). Escríbalo en un sticker y
            péguelo en el marco.
          </p>
        </div>
        <button type="button" className="enlace" onClick={() => onGenerar(false)}>Buscar una bicicleta registrada</button>
      </div>
    );
  }

  const elegir = (v: VehiculoRegistrado) => {
    onElegir(v);
    setAbierto(false);
  };
  const lista = abierto && resultados.length > 0;

  return (
    <div className="campo buscador-bici">
      <label className="campo-rotulo" htmlFor="codigo-bici">Código de la bicicleta</label>
      <div className="buscador-bici-caja">
        <IconoBici />
        <input
          id="codigo-bici"
          ref={entradaRef}
          value={valor}
          onChange={(e) => {
            onEscribir(normalizarPlaca(e.target.value).slice(0, 11));
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (!lista) return;
            if (e.key === "ArrowDown") (e.preventDefault(), setActivo((a) => Math.min(resultados.length - 1, a + 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActivo((a) => Math.max(0, a - 1)));
            if (e.key === "Enter") (e.preventDefault(), elegir(resultados[activo]));
            if (e.key === "Escape") setAbierto(false);
          }}
          placeholder="BICI001"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={lista}
          aria-controls="resultados-bici"
          aria-autocomplete="list"
          aria-activedescendant={lista ? `bici-${resultados[activo]?.placa}` : undefined}
          aria-invalid={!!error}
          autoFocus
        />
      </div>
      {lista && (
        <ul className="resultados-bici" id="resultados-bici" role="listbox" aria-label="Bicicletas registradas">
          {resultados.map((v, i) => (
            <li
              key={v.placa}
              id={`bici-${v.placa}`}
              role="option"
              aria-selected={i === activo}
              className={i === activo ? "activa" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(v);
              }}
            >
              <strong>{v.placa}</strong>
              <span>{[v.color, v.cliente ?? "Sin cuenta"].filter(Boolean).join(" · ")}</span>
              {v.dentro && <span className="chip chip-dentro chip-sm">Dentro</span>}
            </li>
          ))}
        </ul>
      )}
      {abierto && q.length >= 2 && resultados.length === 0 && <p className="campo-ayuda">No hay bicicletas con ese código.</p>}
      <span className={error ? "campo-error" : "campo-ayuda"}>
        {error ?? "Escriba parte del código que la bicicleta recibió al registrarse."}
      </span>
      <button type="button" className="enlace enlace-bici" onClick={() => onGenerar(true)}>
        La bicicleta no tiene código: generar uno nuevo
      </button>
    </div>
  );
}
