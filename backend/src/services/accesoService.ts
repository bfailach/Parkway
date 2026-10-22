import { UsuarioToken } from "../middlewares/auth";
import * as usuarioRepository from "../repositories/usuarioRepository";
import * as catalogoRepository from "../repositories/catalogoRepository";
import { forbidden } from "../errors/AppError";

/**
 * Acceso del personal a las sedes. El administrador trabaja en todas; cada
 * operador solo en las que el administrador le asignó.
 */
export async function sedesPermitidas(u: UsuarioToken): Promise<number[] | "todas"> {
  if (u.rol === "ADMINISTRADOR") return "todas";
  if (u.rol !== "OPERADOR") return [];
  return usuarioRepository.sedesDelOperador(u.id_usuario);
}

export async function verificarAcceso(u: UsuarioToken, idParqueadero: number) {
  const sedes = await sedesPermitidas(u);
  if (sedes !== "todas" && !sedes.includes(idParqueadero)) {
    throw forbidden("No tiene acceso a esta sede. El administrador asigna las sedes de cada operador.");
  }
}

/** Sedes en las que trabaja el usuario del personal. */
export async function misSedes(u: UsuarioToken) {
  const [todas, permitidas] = await Promise.all([catalogoRepository.listarParqueaderos(), sedesPermitidas(u)]);
  return permitidas === "todas" ? todas : todas.filter((s) => permitidas.includes(s.id_parqueadero));
}
