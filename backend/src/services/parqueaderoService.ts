import * as parqueaderoRepository from "../repositories/parqueaderoRepository";
import * as horarioRepository from "../repositories/horarioRepository";
import * as catalogoRepository from "../repositories/catalogoRepository";
import * as espacioRepository from "../repositories/espacioRepository";
import * as usuarioRepository from "../repositories/usuarioRepository";
import { transactionManager } from "../transactions/transactionManager";
import { DatosParqueadero, validarParqueadero } from "../validators/parqueaderoValidator";
import { badRequest, conflict, notFound } from "../errors/AppError";
import { PoolClient } from "pg";

/**
 * Administración de sedes: el administrador crea una sede con su
 * ubicación, cantidad de espacios por tipo, tarifas, horarios y los
 * operadores que pueden trabajar en ella. El plano 3D se construye con los
 * espacios que existan, así que crece o se reduce con la sede.
 */

const NOMBRE_TIPO: Record<number, string> = { 1: "automóviles", 2: "motocicletas", 3: "bicicletas" };

function validar(body: Record<string, unknown>): DatosParqueadero {
  const v = validarParqueadero(body);
  if (!v.valido) throw badRequest("Revise los campos del formulario", v.errores);
  return v.datos;
}

async function guardarDetalle(client: PoolClient, id: number, d: DatosParqueadero) {
  if ((await parqueaderoRepository.cantidadOperadoresValidos(client, d.operadores)) !== d.operadores.length) {
    throw badRequest("Revise los campos del formulario", { operadores: "Solo se pueden asignar usuarios con rol de operador" });
  }
  for (const t of d.tarifas) await parqueaderoRepository.guardarTarifa(client, id, t);
  await horarioRepository.reemplazar(client, id, d.horarios);
  await parqueaderoRepository.asignarOperadores(client, id, d.operadores);
}

export async function listar() {
  const [sedes, horarios, tarifas, operadores] = await Promise.all([
    parqueaderoRepository.listarConConteo(),
    horarioRepository.listarTodos(),
    catalogoRepository.tarifasVigentes(),
    usuarioRepository.listarOperadores(),
  ]);
  return sedes.map((s) => ({
    ...s,
    horarios: horarios.get(s.id_parqueadero) ?? [],
    tarifas: tarifas.filter((t) => t.id_parqueadero === s.id_parqueadero),
    operadores: operadores.filter((o) => o.sedes.includes(s.id_parqueadero)).map((o) => o.id_usuario),
  }));
}

export async function obtener(id: number) {
  const sede = (await listar()).find((s) => s.id_parqueadero === id);
  if (!sede) throw notFound("La sede no existe");
  return { ...sede, lista_espacios: await parqueaderoRepository.espaciosDe(id) };
}

export function operadores() {
  return usuarioRepository.listarOperadores();
}

export async function crear(body: Record<string, unknown>, idAdmin: number) {
  const d = validar(body);
  const id = await transactionManager.ejecutar(
    idAdmin,
    "CREAR_PARQUEADERO",
    "parqueadero",
    async (client) => {
      const nuevo = await parqueaderoRepository.crear(client, d);
      for (const [i, porTipo] of d.espaciosPorPiso.entries()) {
        for (const [idTipo, n] of Object.entries(porTipo)) {
          await parqueaderoRepository.agregarEspacios(client, nuevo, i + 1, Number(idTipo), n);
        }
      }
      await guardarDetalle(client, nuevo, d);
      return nuevo;
    },
    { idEntidad: (i) => i, detalle: () => ({ nombre: d.nombre, pisos: d.pisos, espacios: d.espacios }) }
  );
  return obtener(id);
}

export async function actualizar(id: number, body: Record<string, unknown>, idAdmin: number) {
  if (!Number.isInteger(id) || id <= 0) throw badRequest("Sede inválida");
  const d = validar(body);
  await transactionManager.ejecutar(
    idAdmin,
    "EDITAR_PARQUEADERO",
    "parqueadero",
    async (client) => {
      if (!(await parqueaderoRepository.bloquear(client, id))) throw notFound("La sede no existe");
      await parqueaderoRepository.actualizarDatos(client, id, d);

      // Se recorren los pisos que tiene y los que tendrá: al quitar pisos,
      // sus espacios deben poder borrarse.
      const actuales = await parqueaderoRepository.contarEspacios(client, id);
      const ultimoPiso = Math.max(d.pisos, ...Object.keys(actuales).map(Number));
      for (let piso = 1; piso <= ultimoPiso; piso++) {
        for (const idTipo of [1, 2, 3]) {
          const deseado = d.espaciosPorPiso[piso - 1]?.[idTipo] ?? 0;
          const actual = actuales[piso]?.[idTipo] ?? 0;
          if (deseado > actual) await parqueaderoRepository.agregarEspacios(client, id, piso, idTipo, deseado - actual);
          if (deseado < actual) {
            const quitados = await parqueaderoRepository.quitarEspacios(client, id, piso, idTipo, actual - deseado);
            if (quitados < actual - deseado) {
              throw conflict(
                `En el piso ${piso} solo se pueden quitar ${quitados} espacios de ${NOMBRE_TIPO[idTipo]}: los demás están ocupados, reservados o tienen historial. Márquelos fuera de servicio en su lugar.`
              );
            }
          }
        }
      }
      await parqueaderoRepository.recalcularCapacidad(client, id);
      await guardarDetalle(client, id, d);
      return id;
    },
    { idEntidad: (i) => i, detalle: () => ({ nombre: d.nombre, pisos: d.pisos, espacios: d.espacios }) }
  );
  return obtener(id);
}

/** Marca un espacio fuera de servicio o lo vuelve a habilitar. */
export async function cambiarEstadoEspacio(idEspacio: number, estado: unknown, idAdmin: number) {
  if (!Number.isInteger(idEspacio) || idEspacio <= 0) throw badRequest("Espacio inválido");
  if (estado !== "LIBRE" && estado !== "FUERA_DE_SERVICIO") throw badRequest("Estado inválido");
  await transactionManager.ejecutar(
    idAdmin,
    "ESTADO_ESPACIO",
    "espacio",
    async (client) => {
      const e = await espacioRepository.bloquearParaAsignacion(client, idEspacio);
      if (!e) throw notFound("El espacio no existe");
      if (e.estado === "OCUPADO" || e.estado === "RESERVADO") {
        throw conflict(`El espacio ${e.codigo} está ${e.estado === "OCUPADO" ? "ocupado" : "reservado"}. Espere a que se libere.`);
      }
      if (e.estado !== estado) await espacioRepository.actualizarEstado(client, idEspacio, estado);
      return e;
    },
    { idEntidad: () => idEspacio, detalle: (e) => ({ espacio: e.codigo, estado }) }
  );
}
