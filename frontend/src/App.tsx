import { useEffect, useState } from "react";
import { api, onSesionExpirada, Parqueadero, sesion, TipoVehiculo, Usuario } from "./lib/api";
import { useRuta } from "./lib/ruta";
import { Portada } from "./pages/Portada";
import { Login } from "./pages/Login";
import { Disponibilidad } from "./pages/Disponibilidad";
import { Ingreso } from "./pages/Ingreso";
import { Activos } from "./pages/Activos";
import { Historial } from "./pages/Historial";
import { Reservas } from "./pages/Reservas";
import { Bitacora } from "./pages/Bitacora";
import { MiParqueo } from "./pages/cliente/MiParqueo";
import { MisVehiculos } from "./pages/cliente/MisVehiculos";
import { MiHistorial } from "./pages/cliente/MiHistorial";
import { Selector } from "./components/Selector";
import { BotonAccesibilidad, BotonTema } from "./components/Apariencia";
import { Sedes } from "./pages/admin/Sedes";
import { Notificaciones } from "./pages/cliente/Notificaciones";
import { Notificador } from "./components/Notificador";

type Vista =
  | "disponibilidad"
  | "ingreso"
  | "activos"
  | "reservas"
  | "historial"
  | "bitacora"
  | "sedes"
  | "notificaciones"
  | "mi-parqueo"
  | "mis-vehiculos"
  | "mi-historial";

const VISTAS_PERSONAL: { id: Vista; nombre: string }[] = [
  { id: "disponibilidad", nombre: "Disponibilidad" },
  { id: "ingreso", nombre: "Registrar ingreso" },
  { id: "activos", nombre: "En el parqueadero" },
  { id: "reservas", nombre: "Reservas" },
  { id: "historial", nombre: "Historial" },
];

const VISTAS_ADMIN: { id: Vista; nombre: string }[] = [
  ...VISTAS_PERSONAL,
  { id: "sedes", nombre: "Sedes" },
  { id: "bitacora", nombre: "Bitácora" },
];

const VISTAS_CLIENTE: { id: Vista; nombre: string }[] = [
  { id: "mi-parqueo", nombre: "Mi parqueo" },
  { id: "mis-vehiculos", nombre: "Mis vehículos" },
  { id: "disponibilidad", nombre: "Cupos por sede" },
  { id: "mi-historial", nombre: "Mi historial" },
  { id: "notificaciones", nombre: "Notificaciones" },
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
  const [precarga, setPrecarga] = useState<{ placa: string; idTipo: number } | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [versionSedes, setVersionSedes] = useState(0);

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
    // El personal solo ve las sedes que tiene asignadas.
    Promise.all([usuario.rol === "CLIENTE" ? api.parqueaderos() : api.misSedes(), api.tiposVehiculo()])
      .then(([s, t]) => {
        setSedes(s);
        setTipos(t);
        setIdSede((actual) => (actual && s.some((x) => x.id_parqueadero === actual) ? actual : s[0]?.id_parqueadero ?? null));
        setErrorCarga(null);
      })
      .catch((e) => setErrorCarga(e.message));
  }, [usuario, versionSedes]);

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
  const vistas = usuario.rol === "ADMINISTRADOR" ? VISTAS_ADMIN : esPersonal ? VISTAS_PERSONAL : VISTAS_CLIENTE;
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
        {sedes.length > 0 && (
          <Selector
            className="selector-sede"
            etiqueta="Sede"
            valor={String(idSede ?? "")}
            opciones={sedes.map((s) => ({ valor: String(s.id_parqueadero), texto: s.nombre }))}
            onChange={(v) => setIdSede(Number(v))}
          />
        )}
        <div className="usuario">
          <span className="usuario-nombre">{usuario.nombre}</span>
          <span className="usuario-rol">{NOMBRE_ROL[usuario.rol]}</span>
          <div className="controles">
            <BotonAccesibilidad />
            <BotonTema />
          </div>
          <button className="boton boton-barra" onClick={salir}>Cerrar sesión</button>
        </div>
      </header>

      {vistas.length > 1 && (
        <nav className="navegacion" aria-label="Secciones">
          {vistas.map((v) => (
            <button key={v.id} className="nav-item" aria-current={vistaActual === v.id ? "page" : undefined} onClick={() => { setPrecarga(null); setVista(v.id); }}>
              {v.nombre}
            </button>
          ))}
        </nav>
      )}

      <main className="contenido">
        {errorCarga && <p className="alerta alerta-error" role="alert">{errorCarga}</p>}
        {esPersonal && !errorCarga && sedes.length === 0 && usuario.rol === "OPERADOR" && (
          <div className="vacio"><p>Aún no tienes sedes asignadas. Pide al administrador que te dé acceso a una sede.</p></div>
        )}
        {sede && vistaActual === "disponibilidad" && <Disponibilidad key={`d${esPersonal}`} sede={sede} esPersonal={esPersonal} />}
        {sede && esPersonal && vistaActual === "ingreso" && (
          <Ingreso key={precarga?.placa ?? "nuevo"} sede={sede} tipos={tipos} inicial={precarga} />
        )}
        {sede && esPersonal && vistaActual === "reservas" && (
          <Reservas
            sede={sede}
            onRegistrarIngreso={(r) => {
              setPrecarga({ placa: r.placa, idTipo: r.id_tipo });
              setVista("ingreso");
            }}
          />
        )}
        {usuario.rol === "ADMINISTRADOR" && vistaActual === "bitacora" && <Bitacora />}
        {usuario.rol === "ADMINISTRADOR" && vistaActual === "sedes" && (
          <Sedes tipos={tipos} onCambio={() => setVersionSedes((n) => n + 1)} />
        )}
        {sede && esPersonal && vistaActual === "activos" && <Activos sede={sede} />}
        {sede && esPersonal && vistaActual === "historial" && <Historial sede={sede} tipos={tipos} />}
        {sede && !esPersonal && vistaActual === "mi-parqueo" && (
          <MiParqueo sedes={sedes} sedeInicial={sede} onIrVehiculos={() => setVista("mis-vehiculos")} />
        )}
        {!esPersonal && vistaActual === "mis-vehiculos" && <MisVehiculos tipos={tipos} />}
        {!esPersonal && vistaActual === "mi-historial" && <MiHistorial />}
        {!esPersonal && vistaActual === "notificaciones" && <Notificaciones />}
      </main>
      {!esPersonal && <Notificador />}
    </div>
  );
}
