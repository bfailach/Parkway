import type { Rol } from "../middlewares/auth";

/**
 * Validación de los usuarios que crea o edita el administrador (RF02) y
 * reglas que protegen el acceso al sistema. Funciones puras, probadas en
 * tests/usuario.test.ts.
 */
export const ROLES: Rol[] = ["CLIENTE", "OPERADOR", "ADMINISTRADOR"];
export const TURNOS = ["DIA", "NOCHE"] as const;
export const ESTADOS = ["ACTIVO", "INACTIVO", "BLOQUEADO"] as const;

export type Turno = (typeof TURNOS)[number];
export type EstadoUsuario = (typeof ESTADOS)[number];

export interface DatosUsuario {
  nombre: string;
  documento: string;
  correo: string;
  telefono: string | null;
  rol: Rol;
  /** Solo para operadores y administradores. */
  turno: Turno | null;
  estado: EstadoUsuario;
  /** Vacía al editar si no se cambia la contraseña. */
  contrasena: string;
  /** Sedes en las que trabaja un operador. Vacía para los demás roles. */
  sedes: number[];
}

type Resultado = { valido: true; datos: DatosUsuario } | { valido: false; errores: Record<string, string> };

const texto = (v: unknown) => String(v ?? "").trim();

export function validarUsuario(body: Record<string, unknown>, opciones: { nuevo: boolean }): Resultado {
  const errores: Record<string, string> = {};
  const nombre = texto(body.nombre).replace(/\s+/g, " ");
  const documento = texto(body.documento).replace(/[.\s]/g, "");
  const correo = texto(body.correo).toLowerCase();
  const telefono = texto(body.telefono).replace(/[\s-]/g, "");
  const rol = texto(body.rol).toUpperCase() as Rol;
  const turnoTexto = texto(body.turno).toUpperCase();
  const estado = (texto(body.estado).toUpperCase() || "ACTIVO") as EstadoUsuario;
  const contrasena = String(body.contrasena ?? "");

  if (nombre.length < 3) errores.nombre = "Escriba el nombre completo";
  else if (nombre.length > 100) errores.nombre = "Máximo 100 caracteres";

  if (!documento) errores.documento = "El documento es obligatorio";
  else if (!/^\d{5,12}$/.test(documento)) errores.documento = "Solo números, entre 5 y 12 dígitos";

  if (!correo) errores.correo = "El correo es obligatorio";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 120) errores.correo = "Correo inválido";

  if (telefono && !/^\+?\d{7,15}$/.test(telefono)) errores.telefono = "Teléfono inválido";

  if (!ROLES.includes(rol)) errores.rol = "Elija un rol de la lista";

  // El turno identifica la jornada del personal; un cliente no tiene turno.
  let turno: Turno | null = null;
  if (rol !== "CLIENTE") {
    if (!turnoTexto) errores.turno = "Elija el turno";
    else if (!(TURNOS as readonly string[]).includes(turnoTexto)) errores.turno = "Elija un turno de la lista";
    else turno = turnoTexto as Turno;
  }

  if (!(ESTADOS as readonly string[]).includes(estado)) errores.estado = "Elija un estado de la lista";

  // Al crear la contraseña es obligatoria; al editar solo se valida si se
  // escribe una nueva.
  if (opciones.nuevo || contrasena) {
    if (contrasena.length < 8) errores.contrasena = "Mínimo 8 caracteres";
    else if (!/\d/.test(contrasena) || !/[A-Za-z]/.test(contrasena)) errores.contrasena = "Debe tener letras y números";
  }

  let sedes: number[] = [];
  if (rol === "OPERADOR" && body.sedes !== undefined) {
    if (!Array.isArray(body.sedes) || body.sedes.some((s) => !Number.isInteger(Number(s)) || Number(s) <= 0)) {
      errores.sedes = "Sedes inválidas";
    } else sedes = [...new Set(body.sedes.map(Number))].sort((a, b) => a - b);
  }

  if (Object.keys(errores).length) return { valido: false, errores };
  return {
    valido: true,
    datos: { nombre, documento, correo, telefono: telefono || null, rol, turno, estado, contrasena, sedes },
  };
}

/**
 * Reglas que evitan que el sistema quede sin administración:
 * - El administrador no puede quitarse su propio rol ni desactivarse.
 * - Debe quedar al menos un administrador activo.
 *
 * @param idActor          Administrador que hace el cambio
 * @param anterior         Usuario antes del cambio (null si es nuevo)
 * @param nuevo            Rol y estado después del cambio
 * @param adminsActivos    Administradores activos antes del cambio
 * @returns el motivo del rechazo, o null si el cambio es válido
 */
export function motivoRechazoCambio(
  idActor: number,
  anterior: { id_usuario: number; rol: Rol; estado: string } | null,
  nuevo: { rol: Rol; estado: string },
  adminsActivos: number
): string | null {
  if (!anterior) return null;
  const esElMismo = anterior.id_usuario === idActor;
  if (esElMismo && nuevo.rol !== anterior.rol) return "No puede cambiar su propio rol";
  if (esElMismo && nuevo.estado !== "ACTIVO") return "No puede desactivar su propia cuenta";
  const eraAdminActivo = anterior.rol === "ADMINISTRADOR" && anterior.estado === "ACTIVO";
  const sigueAdminActivo = nuevo.rol === "ADMINISTRADOR" && nuevo.estado === "ACTIVO";
  if (eraAdminActivo && !sigueAdminActivo && adminsActivos <= 1) {
    return "Debe quedar al menos un administrador activo";
  }
  return null;
}
