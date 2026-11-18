import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { badRequest } from "../errors/AppError";

/**
 * Autorización de tratamiento de datos personales (Ley 1581 de 2012 y
 * Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015).
 *
 * - La autorización es previa, expresa e informada: el cliente marca la
 *   casilla al crear la cuenta, después de ver el aviso de privacidad.
 * - El responsable debe poder demostrarla: cada decisión queda como una fila
 *   en consentimiento_datos, con la versión de la política y la fecha.
 * - Finalidad SERVICIO: necesaria para usar Parkway (cuenta, vehículos,
 *   reservas, ingresos y pagos). Finalidad COMUNICACIONES: opcional; se
 *   otorga o revoca cuando el usuario quiera desde su panel.
 */
export const VERSION_POLITICA = "1.0";

export const POLITICA = {
  version: VERSION_POLITICA,
  vigenteDesde: "2026-11-18",
  responsable: "Parkway (proyecto académico, Universidad Manuela Beltrán, Grupo 2), Bogotá D.C.",
  contacto: "privacidad@parkway.test",
  datosQueSeRecogen: [
    "Nombre, documento de identidad, correo y teléfono (opcional).",
    "Placa, tipo, marca y color de los vehículos registrados.",
    "Fechas y horas de reservas, ingresos y salidas, sede y espacio usados, y pagos.",
  ],
  datosSensibles: "Parkway no solicita datos sensibles ni datos de niños, niñas o adolescentes.",
  finalidades: [
    {
      codigo: "SERVICIO",
      obligatoria: true,
      descripcion:
        "Crear y administrar la cuenta, registrar vehículos, reservas, ingresos, salidas y pagos, emitir comprobantes y atender reclamos.",
    },
    {
      codigo: "COMUNICACIONES",
      obligatoria: false,
      descripcion: "Enviar información sobre sedes, horarios, tarifas y novedades del servicio.",
    },
  ],
  usoEstadistico:
    "Los reportes y el pronóstico de ocupación usan conteos agregados por sede y hora, sin datos que identifiquen a una persona.",
  derechos: [
    "Conocer, actualizar y rectificar sus datos.",
    "Solicitar prueba de la autorización otorgada.",
    "Ser informado del uso que se ha dado a sus datos.",
    "Revocar la autorización o pedir la supresión de los datos cuando no se respeten los principios, derechos y garantías de la ley.",
    "Presentar quejas ante la Superintendencia de Industria y Comercio.",
    "Acceder en forma gratuita a sus datos personales.",
  ],
  plazos: "Consultas: hasta 10 días hábiles. Reclamos: hasta 15 días hábiles (artículos 14 y 15 de la Ley 1581 de 2012).",
};

export type Finalidad = "SERVICIO" | "COMUNICACIONES";
const FINALIDADES: Finalidad[] = ["SERVICIO", "COMUNICACIONES"];

const tablaFaltante = (e: unknown) => (e as { code?: string })?.code === "42P01";

/** Lee y valida la decisión del formulario de registro. La finalidad SERVICIO es obligatoria. */
export function leerAutorizacion(body: Record<string, unknown>) {
  if (body.aceptaTratamiento !== true) {
    throw badRequest("Revise los campos del formulario", {
      aceptaTratamiento: "Debe autorizar el tratamiento de sus datos para crear la cuenta",
    });
  }
  return { comunicaciones: body.aceptaComunicaciones === true };
}

/** Guarda la autorización inicial dentro de la transacción del registro. */
export async function registrarAlCrearCuenta(client: PoolClient, idUsuario: number, decision: { comunicaciones: boolean }) {
  await client.query("SAVEPOINT consentimiento");
  try {
    await client.query(
      `INSERT INTO consentimiento_datos (id_usuario, finalidad, otorgado, version_politica, origen)
       VALUES ($1, 'SERVICIO', true, $3, 'REGISTRO'), ($1, 'COMUNICACIONES', $2, $3, 'REGISTRO')`,
      [idUsuario, decision.comunicaciones, VERSION_POLITICA]
    );
    await client.query("RELEASE SAVEPOINT consentimiento");
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT consentimiento");
    // Base sin migracion_propuesta.sql: la cuenta se crea igual y se avisa en el registro del servidor.
    if (!tablaFaltante(e)) throw e;
    console.warn("consentimiento_datos no existe: ejecute database/migracion_propuesta.sql"); // eslint-disable-line no-console
  }
}

/** Estado vigente de cada finalidad e historial completo del usuario. */
export async function misConsentimientos(idUsuario: number) {
  // Sin la migración (tabla consentimiento_datos) la página de privacidad
  // muestra la política y avisa que las autorizaciones aún no se registran.
  let rows: { finalidad: string; otorgado: boolean; version_politica: string; origen: string; fecha: string }[] = [];
  let registroDisponible = true;
  try {
    ({ rows } = await pool.query(
      `SELECT finalidad, otorgado, version_politica, origen, fecha
         FROM consentimiento_datos WHERE id_usuario = $1 ORDER BY fecha DESC, id_consentimiento DESC`,
      [idUsuario]
    ));
  } catch (e) {
    if ((e as { code?: string }).code !== "42P01") throw e;
    registroDisponible = false;
  }
  const vigentes = FINALIDADES.map((f) => {
    const ultima = rows.find((r) => r.finalidad === f);
    const def = POLITICA.finalidades.find((x) => x.codigo === f)!;
    return {
      finalidad: f,
      obligatoria: def.obligatoria,
      descripcion: def.descripcion,
      otorgado: ultima ? ultima.otorgado : null, // null: sin registro (cuentas anteriores a la política)
      fecha: ultima?.fecha ?? null,
      versionPolitica: ultima?.version_politica ?? null,
    };
  });
  return { versionPolitica: VERSION_POLITICA, vigentes, historial: rows, registroDisponible };
}

/** Otorga o revoca una finalidad desde el panel. */
export async function cambiar(idUsuario: number, body: Record<string, unknown>) {
  const finalidad = String(body.finalidad ?? "") as Finalidad;
  if (!FINALIDADES.includes(finalidad)) throw badRequest("Finalidad inválida", { finalidad: "Use SERVICIO o COMUNICACIONES" });
  if (typeof body.otorgado !== "boolean") throw badRequest("Indique si otorga o revoca la autorización", { otorgado: "Debe ser true o false" });
  if (finalidad === "SERVICIO" && body.otorgado === false) {
    throw badRequest(
      "La autorización para prestar el servicio no se puede revocar desde el panel porque sin ella la cuenta no puede operar. " +
        `Para pedir la supresión de sus datos escriba a ${POLITICA.contacto}.`
    );
  }
  await pool.query(
    `INSERT INTO consentimiento_datos (id_usuario, finalidad, otorgado, version_politica, origen)
     VALUES ($1, $2, $3, $4, 'PANEL')`,
    [idUsuario, finalidad, body.otorgado, VERSION_POLITICA]
  );
  return misConsentimientos(idUsuario);
}
