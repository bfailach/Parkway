import bcrypt from "bcryptjs";
import * as usuarioRepository from "../repositories/usuarioRepository";
import { transactionManager } from "../transactions/transactionManager";
import { DatosUsuario, ESTADOS, motivoRechazoCambio, ROLES, validarUsuario } from "../validators/usuarioValidator";
import { badRequest, conflict, notFound } from "../errors/AppError";
import { PoolClient } from "pg";

/**
 * Gestión de usuarios (RF02). El administrador crea, consulta, edita e
 * inactiva usuarios con rol CLIENTE, OPERADOR o ADMINISTRADOR. Los
 * usuarios no se borran: al inactivarlos se conserva su historial y dejan
 * de poder iniciar sesión. Cada cambio queda en la bitácora.
 */

function validar(body: Record<string, unknown>, nuevo: boolean): DatosUsuario {
  const v = validarUsuario(body, { nuevo });
  if (!v.valido) throw badRequest("Revise los campos del formulario", v.errores);
  return v.datos;
}

function idValido(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw notFound("El usuario no existe");
}

/** Sedes del operador y efectos de quitar el acceso a un usuario. */
async function aplicarEfectos(client: PoolClient, id: number, d: { rol: string; estado: string; sedes?: number[] }) {
  if (d.rol !== "OPERADOR") await usuarioRepository.asignarSedes(client, id, []);
  else if (d.sedes) {
    if ((await usuarioRepository.cantidadSedesExistentes(client, d.sedes)) !== d.sedes.length) {
      throw badRequest("Revise los campos del formulario", { sedes: "Alguna de las sedes no existe" });
    }
    await usuarioRepository.asignarSedes(client, id, d.sedes);
  }
  // Un cliente sin acceso no puede llegar a su reserva: se libera el espacio.
  return d.rol === "CLIENTE" && d.estado !== "ACTIVO" ? usuarioRepository.cancelarReservasActivas(client, id) : 0;
}

export function listar(f: { q?: unknown; rol?: unknown; estado?: unknown }) {
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const rol = texto(f.rol)?.toUpperCase();
  const estado = texto(f.estado)?.toUpperCase();
  if (rol && !ROLES.includes(rol as never)) throw badRequest("Rol inválido");
  if (estado && !(ESTADOS as readonly string[]).includes(estado)) throw badRequest("Estado inválido");
  return usuarioRepository.listar({ q: texto(f.q)?.slice(0, 60), rol, estado });
}

export async function obtener(id: number) {
  idValido(id);
  const u = await usuarioRepository.obtener(id);
  if (!u) throw notFound("El usuario no existe");
  return u;
}

export async function crear(body: Record<string, unknown>, idAdmin: number) {
  const d = validar(body, true);
  const hash = await bcrypt.hash(d.contrasena, 10);
  const id = await transactionManager.ejecutar(
    idAdmin,
    "CREAR_USUARIO",
    "usuario",
    async (client) => {
      const nuevo = await usuarioRepository.crear(client, d, hash);
      await aplicarEfectos(client, nuevo, d);
      return nuevo;
    },
    { idEntidad: (i) => i, detalle: () => ({ nombre: d.nombre, rol: d.rol, estado: d.estado }) }
  );
  return obtener(id);
}

export async function actualizar(id: number, body: Record<string, unknown>, idAdmin: number) {
  idValido(id);
  const d = validar(body, false);
  const hash = d.contrasena ? await bcrypt.hash(d.contrasena, 10) : null;
  await transactionManager.ejecutar(
    idAdmin,
    "EDITAR_USUARIO",
    "usuario",
    async (client) => {
      const anterior = await usuarioRepository.bloquear(client, id);
      if (!anterior) throw notFound("El usuario no existe");
      const motivo = motivoRechazoCambio(idAdmin, anterior, d, await usuarioRepository.contarAdministradoresActivos(client));
      if (motivo) throw conflict(motivo);
      await usuarioRepository.actualizar(client, id, d, hash);
      const reservas = await aplicarEfectos(client, id, d);
      return { anterior, reservas };
    },
    {
      idEntidad: () => id,
      detalle: ({ anterior, reservas }) => ({
        nombre: d.nombre,
        rol: d.rol,
        estado: d.estado,
        ...(anterior.rol !== d.rol ? { rolAnterior: anterior.rol } : {}),
        ...(hash ? { contrasena: "cambiada" } : {}),
        ...(reservas ? { reservasCanceladas: reservas } : {}),
      }),
    }
  );
  return obtener(id);
}

/** Activa, inactiva o bloquea un usuario sin abrir el formulario completo. */
export async function cambiarEstado(id: number, estado: unknown, idAdmin: number) {
  idValido(id);
  const nuevo = String(estado ?? "").toUpperCase();
  if (!(ESTADOS as readonly string[]).includes(nuevo)) throw badRequest("Estado inválido", { estado: "Elija un estado de la lista" });
  await transactionManager.ejecutar(
    idAdmin,
    "ESTADO_USUARIO",
    "usuario",
    async (client) => {
      const anterior = await usuarioRepository.bloquear(client, id);
      if (!anterior) throw notFound("El usuario no existe");
      const motivo = motivoRechazoCambio(
        idAdmin,
        anterior,
        { rol: anterior.rol, estado: nuevo },
        await usuarioRepository.contarAdministradoresActivos(client)
      );
      if (motivo) throw conflict(motivo);
      await usuarioRepository.cambiarEstado(client, id, nuevo);
      const reservas = await aplicarEfectos(client, id, { rol: anterior.rol, estado: nuevo });
      return { nombre: anterior.nombre as string, reservas };
    },
    {
      idEntidad: () => id,
      detalle: ({ nombre, reservas }) => ({ nombre, estado: nuevo, ...(reservas ? { reservasCanceladas: reservas } : {}) }),
    }
  );
  return obtener(id);
}
