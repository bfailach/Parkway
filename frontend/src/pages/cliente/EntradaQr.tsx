import { useEffect, useState } from "react";
import { api, InfoQr, Registro } from "../../lib/api";

const TIPO: Record<string, string> = { AUTOMOVIL: "automóvil", MOTOCICLETA: "motocicleta", BICICLETA: "bicicleta" };

/**
 * Entrada con QR: el cliente llegó a la portería, escaneó el código de la
 * sede y registra su propio ingreso con uno de sus vehículos.
 */
export function EntradaQr({ token, onTerminar }: { token: string; onTerminar: () => void }) {
  const [info, setInfo] = useState<InfoQr | null>(null);
  const [placa, setPlaca] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<Registro | null>(null);

  useEffect(() => {
    api.cliente
      .infoQr(token)
      .then((i) => {
        setInfo(i);
        const libre = i.vehiculos.find((v) => !v.dentro);
        if (libre) setPlaca(libre.placa);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function ingresar() {
    setEnviando(true);
    setError(null);
    try {
      setHecho(await api.cliente.ingresoQr(token, placa));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="tarjeta entrada-qr" aria-labelledby="entrada-qr-titulo">
      <h2 id="entrada-qr-titulo">Entrada con QR{info ? ` · ${info.nombre}` : ""}</h2>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {hecho ? (
        <>
          <p className="alerta alerta-ok" role="status">
            Listo. Tu vehículo {hecho.placa} quedó registrado. Ve al espacio <b>{hecho.codigo_espacio}</b>.
          </p>
          <button className="boton boton-primario" onClick={onTerminar}>Ver mi parqueo</button>
        </>
      ) : info ? (
        info.vehiculos.length === 0 ? (
          <p>No tienes vehículos registrados. Agrégalos en <b>Mis vehículos</b> y vuelve a escanear el código.</p>
        ) : (
          <>
            {info.direccion && <p className="ayuda">{info.direccion}</p>}
            <fieldset className="opciones-vehiculo">
              <legend>¿Con qué vehículo entras?</legend>
              {info.vehiculos.map((v) => (
                <label key={v.placa} className="opcion">
                  <input type="radio" name="vehiculo" value={v.placa} checked={placa === v.placa} disabled={v.dentro} onChange={() => setPlaca(v.placa)} />
                  <span>{v.placa} · {TIPO[v.tipo] ?? v.tipo.toLowerCase()}{v.marca ? ` · ${v.marca}` : ""}{v.dentro ? " (ya está dentro)" : ""}</span>
                </label>
              ))}
            </fieldset>
            <div className="acciones">
              <button className="boton boton-primario" disabled={!placa || enviando} onClick={ingresar}>{enviando ? "Registrando..." : "Registrar mi ingreso"}</button>
              <button className="boton" onClick={onTerminar}>Cancelar</button>
            </div>
          </>
        )
      ) : (
        !error && <p>Verificando el código...</p>
      )}
    </section>
  );
}
