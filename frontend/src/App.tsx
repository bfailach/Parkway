import { useEffect, useState } from "react";
import { api, onSesionExpirada, Parqueadero, sesion, TipoVehiculo, Usuario } from "./lib/api";
import { Login } from "./pages/Login";
import { Disponibilidad } from "./pages/Disponibilidad";
import { Ingreso } from "./pages/Ingreso";
import { Activos } from "./pages/Activos";
import { Historial } from "./pages/Historial";

type Vista = "disponibilidad" | "ingreso" | "activos" | "historial";

const VISTAS: { id: Vista; nombre: string; personal: boolean }[] = [
  { id: "disponibilidad", nombre: "Disponibilidad", personal: false },
  { id: "ingreso", nombre: "Registrar ingreso", personal: true },
  { id: "activos", nombre: "En el parqueadero", personal: true },
  { id: "historial", nombre: "Historial", personal: true },
];

const NOMBRE_ROL = { CLIENTE: "Cliente", OPERADOR: "Operador", ADMINISTRADOR: "Administrador" };

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [verificando, setVerificando] = useState(!!sesion.token());
  const [sedes, setSedes] = useState<Parqueadero[]>([]);
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [idSede, setIdSede] = useState<number | null>(null);
  const [vista, setVista] = useState<Vista>("disponibilidad");
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  useEffect(() => {
    onSesionExpirada(() => {
      sesion.borrar();
      setUsuario(null);
    });
    if (sesion.token()) {
      api.me().then(setUsuario).catch(() => sesion.borrar()).finally(() => setVerificando(false));
    }
  }, []);

  useEffect(() => {
    if (!usuario) return;
    Promise.all([api.parqueaderos(), api.tiposVehiculo()])
      .then(([s, t]) => {
        setSedes(s);
        setTipos(t);
        setIdSede((actual) => actual ?? s[0]?.id_parqueadero ?? null);
        setErrorCarga(null);
      })
      .catch((e) => setErrorCarga(e.message));
  }, [usuario]);

  if (verificando) return null;
  if (!usuario) return <Login onIngresar={(u) => { setUsuario(u); setVista(u.rol === "CLIENTE" ? "disponibilidad" : "ingreso"); }} />;

  const esPersonal = usuario.rol !== "CLIENTE";
  const sede = sedes.find((s) => s.id_parqueadero === idSede);
  const vistas = VISTAS.filter((v) => esPersonal || !v.personal);

  function salir() {
    sesion.borrar();
    setUsuario(null);
    setVista("disponibilidad");
  }

  return (
    <div className="app">
      <header className="barra">
        <span className="marca"><span className="senal-p senal-p-sm" aria-hidden="true">P</span>Parkway</span>
        <label className="selector-sede">
          <span className="visualmente-oculto">Sede</span>
          <select value={idSede ?? ""} onChange={(e) => setIdSede(Number(e.target.value))}>
            {sedes.map((s) => <option key={s.id_parqueadero} value={s.id_parqueadero}>{s.nombre}</option>)}
          </select>
        </label>
        <div className="usuario">
          <span className="usuario-nombre">{usuario.nombre}</span>
          <span className="usuario-rol">{NOMBRE_ROL[usuario.rol]}</span>
          <button className="boton boton-barra" onClick={salir}>Cerrar sesión</button>
        </div>
      </header>

      {vistas.length > 1 && (
        <nav className="navegacion" aria-label="Secciones">
          {vistas.map((v) => (
            <button key={v.id} className="nav-item" aria-current={vista === v.id ? "page" : undefined} onClick={() => setVista(v.id)}>
              {v.nombre}
            </button>
          ))}
        </nav>
      )}

      <main className="contenido">
        {errorCarga && <p className="alerta alerta-error" role="alert">{errorCarga}</p>}
        {sede && vista === "disponibilidad" && <Disponibilidad sede={sede} esPersonal={esPersonal} />}
        {sede && esPersonal && vista === "ingreso" && <Ingreso sede={sede} tipos={tipos} />}
        {sede && esPersonal && vista === "activos" && <Activos sede={sede} />}
        {sede && esPersonal && vista === "historial" && <Historial sede={sede} />}
      </main>
    </div>
  );
}
