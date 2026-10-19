import { useEffect, useState } from "react";
import { api, onSesionExpirada, Parqueadero, sesion, TipoVehiculo, Usuario } from "./lib/api";
import { useRuta } from "./lib/ruta";
import { Portada } from "./pages/Portada";
import { Login } from "./pages/Login";
import { Disponibilidad } from "./pages/Disponibilidad";
import { Ingreso } from "./pages/Ingreso";
import { Activos } from "./pages/Activos";
import { Historial } from "./pages/Historial";
import { MiParqueo } from "./pages/cliente/MiParqueo";
import { MisVehiculos } from "./pages/cliente/MisVehiculos";
import { MiHistorial } from "./pages/cliente/MiHistorial";

type Vista = "disponibilidad" | "ingreso" | "activos" | "historial" | "mi-parqueo" | "mis-vehiculos" | "mi-historial";

const VISTAS_PERSONAL: { id: Vista; nombre: string }[] = [
  { id: "disponibilidad", nombre: "Disponibilidad" },
  { id: "ingreso", nombre: "Registrar ingreso" },
  { id: "activos", nombre: "En el parqueadero" },
  { id: "historial", nombre: "Historial" },
];

const VISTAS_CLIENTE: { id: Vista; nombre: string }[] = [
  { id: "mi-parqueo", nombre: "Mi parqueo" },
  { id: "mis-vehiculos", nombre: "Mis vehículos" },
  { id: "disponibilidad", nombre: "Cupos por sede" },
  { id: "mi-historial", nombre: "Mi historial" },
];

const NOMBRE_ROL = { CLIENTE: "Cliente", OPERADOR: "Operador", ADMINISTRADOR: "Administrador" };

export default function App() {
  const [ruta, ir] = useRuta();
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
      api
        .me()
        .then((u) => {
          setUsuario(u);
          setVista(u.rol === "CLIENTE" ? "mi-parqueo" : "ingreso");
        })
        .catch(() => sesion.borrar())
        .finally(() => setVerificando(false));
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

  if (ruta === "portada") {
    return <Portada enSesion={!!usuario} onIngresar={() => ir(usuario ? "panel" : "ingresar")} />;
  }

  if (!usuario) {
    return (
      <Login
        onVolver={() => ir("portada")}
        onIngresar={(u) => {
          setUsuario(u);
          setVista(u.rol === "CLIENTE" ? "mi-parqueo" : "ingreso");
          ir("panel");
        }}
      />
    );
  }

  const esPersonal = usuario.rol !== "CLIENTE";
  const sede = sedes.find((s) => s.id_parqueadero === idSede);
  const vistas = esPersonal ? VISTAS_PERSONAL : VISTAS_CLIENTE;
  const vistaActual = vistas.some((v) => v.id === vista) ? vista : vistas[0].id;

  function salir() {
    sesion.borrar();
    setUsuario(null);
    setVista("disponibilidad");
    ir("portada");
  }

  return (
    <div className="app">
      <header className="barra">
        <a href="#/" className="marca" aria-label="Parkway, ir a la portada">
          <span className="senal-p senal-p-sm" aria-hidden="true">P</span>Parkway
        </a>
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
            <button key={v.id} className="nav-item" aria-current={vistaActual === v.id ? "page" : undefined} onClick={() => setVista(v.id)}>
              {v.nombre}
            </button>
          ))}
        </nav>
      )}

      <main className="contenido">
        {errorCarga && <p className="alerta alerta-error" role="alert">{errorCarga}</p>}
        {sede && vistaActual === "disponibilidad" && <Disponibilidad key={`d${esPersonal}`} sede={sede} esPersonal={esPersonal} />}
        {sede && esPersonal && vistaActual === "ingreso" && <Ingreso sede={sede} tipos={tipos} />}
        {sede && esPersonal && vistaActual === "activos" && <Activos sede={sede} />}
        {sede && esPersonal && vistaActual === "historial" && <Historial sede={sede} />}
        {sede && !esPersonal && vistaActual === "mi-parqueo" && (
          <MiParqueo sedes={sedes} sedeInicial={sede} onIrVehiculos={() => setVista("mis-vehiculos")} />
        )}
        {!esPersonal && vistaActual === "mis-vehiculos" && <MisVehiculos tipos={tipos} />}
        {!esPersonal && vistaActual === "mi-historial" && <MiHistorial />}
      </main>
    </div>
  );
}
