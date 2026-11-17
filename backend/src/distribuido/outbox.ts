import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { distribuido, logDistribuido, NODO_ID } from "./config";
import { publicar, rabbitActivo } from "./rabbitmq";
import { soyLider } from "./redis";

/**
 * Patrón outbox.
 *
 * Problema: si el backend confirma un ingreso en PostgreSQL y luego intenta
 * publicar el evento en RabbitMQ, una caída entre los dos pasos deja la base
 * y los demás servicios en desacuerdo. Publicar antes del COMMIT tampoco
 * sirve: el evento saldría aunque la transacción se revierta.
 *
 * Solución:
 *  1. registrarEvento() guarda el evento en evento_outbox dentro de la
 *     misma transacción del negocio. Se confirman juntos o ninguno.
 *  2. El publicador lee los pendientes y los envía a RabbitMQ con
 *     confirmación del broker. Solo entonces los marca como publicados.
 *
 * Varias réplicas pueden publicar a la vez: FOR UPDATE SKIP LOCKED reparte
 * los eventos sin que dos nodos tomen el mismo. La entrega es "al menos una
 * vez": el consumidor descarta duplicados por id_evento.
 */
const log = (...m: unknown[]) => logDistribuido("outbox", ...m);

// Sede afectada según la entidad, para que los consumidores agrupen por sede.
const SEDE_POR_ENTIDAD = `
  CASE $2
    WHEN 'registro_estacionamiento' THEN (SELECT e.id_parqueadero FROM registro_estacionamiento r JOIN espacio e ON e.id_espacio = r.id_espacio WHERE r.id_registro::text = $3)
    WHEN 'reserva'                  THEN (SELECT e.id_parqueadero FROM reserva r JOIN espacio e ON e.id_espacio = r.id_espacio WHERE r.id_reserva::text = $3)
    WHEN 'pago'                     THEN (SELECT e.id_parqueadero FROM pago p JOIN registro_estacionamiento r ON r.id_registro = p.id_registro JOIN espacio e ON e.id_espacio = r.id_espacio WHERE p.id_pago::text = $3)
    WHEN 'espacio'                  THEN (SELECT id_parqueadero FROM espacio WHERE id_espacio::text = $3)
    WHEN 'parqueadero'              THEN (SELECT id_parqueadero FROM parqueadero WHERE id_parqueadero::text = $3)
  END`;

/** Guarda un evento de dominio en la transacción en curso. No hace nada si el outbox está deshabilitado. */
export async function registrarEvento(
  client: PoolClient,
  e: { tipo: string; entidad: string; idEntidad: string | null; datos: Record<string, unknown> | null }
) {
  if (!distribuido.outbox) return;
  await client.query(
    `INSERT INTO evento_outbox (tipo, entidad, id_entidad, id_parqueadero, datos, nodo_origen)
     VALUES ($1, $2::varchar, $3::varchar, ${SEDE_POR_ENTIDAD}, $4, $5)`,
    [e.tipo, e.entidad, e.idEntidad, e.datos ? JSON.stringify(e.datos) : null, NODO_ID]
  );
}

/** Publica un lote de eventos pendientes. Devuelve cuántos se publicaron. */
export async function publicarPendientes(lote = 50): Promise<number> {
  const client = await pool.connect();
  let publicados = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id_evento, tipo, entidad, id_entidad, id_parqueadero, datos, nodo_origen, fecha_creacion
         FROM evento_outbox
        WHERE fecha_publicacion IS NULL
        ORDER BY fecha_creacion
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [lote]
    );
    for (const ev of rows) {
      const mensaje = {
        id: ev.id_evento,
        tipo: ev.tipo,
        entidad: ev.entidad,
        idEntidad: ev.id_entidad,
        sede: ev.id_parqueadero,
        datos: ev.datos,
        nodoOrigen: ev.nodo_origen,
        fecha: ev.fecha_creacion,
      };
      try {
        await publicar(`${ev.entidad}.${ev.tipo}`.toLowerCase(), mensaje);
        await client.query(`UPDATE evento_outbox SET fecha_publicacion = now(), intentos = intentos + 1 WHERE id_evento = $1`, [ev.id_evento]);
        publicados += 1;
      } catch (error) {
        // Se queda pendiente y se reintenta en la siguiente vuelta.
        await client.query(`UPDATE evento_outbox SET intentos = LEAST(intentos + 1, 32767), ultimo_error = $2 WHERE id_evento = $1`, [
          ev.id_evento,
          String((error as Error).message).slice(0, 300),
        ]);
        break; // el broker no está: no tiene sentido seguir con el lote
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return publicados;
}

export async function pendientes(): Promise<number> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM evento_outbox WHERE fecha_publicacion IS NULL`);
  return rows[0].n;
}

let despertar: (() => void) | null = null;

/**
 * Avisa al publicador de este nodo que hay un evento nuevo, para enviarlo
 * enseguida en vez de esperar la siguiente vuelta. Lo llama el gestor de
 * transacciones después del COMMIT.
 */
export function avisarEventoNuevo() {
  despertar?.();
}

/** Inicia el ciclo del publicador en este nodo. */
export function iniciarPublicador(intervaloMs = 1000) {
  if (!distribuido.outbox || !rabbitActivo()) return { detener() {} };
  log(`publicador iniciado (cada ${intervaloMs} ms o al confirmar una transacción)`);
  let detenido = false;
  let ciclo = 0;
  let enCurso = false;
  let pedido = false;
  let temporizador: NodeJS.Timeout | null = null;

  const programar = (ms: number) => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(vuelta, ms);
  };
  despertar = () => {
    if (enCurso) pedido = true;
    else programar(0);
  };

  const vuelta = async () => {
    if (detenido) return;
    enCurso = true;
    pedido = false;
    try {
      let n;
      do n = await publicarPendientes(); // vacía la cola mientras haya eventos
      while (n === 50 && !detenido);
      // Limpieza de eventos ya publicados con más de 7 días: solo el líder.
      ciclo += 1;
      if (ciclo % 600 === 0 && (await soyLider("limpieza-outbox", 120_000))) {
        await pool.query(`DELETE FROM evento_outbox WHERE fecha_publicacion < now() - interval '7 days'`);
      }
    } catch (e) {
      log("error en el publicador:", (e as Error).message);
    }
    enCurso = false;
    if (!detenido) programar(pedido ? 0 : intervaloMs);
  };
  programar(intervaloMs);
  return {
    detener() {
      detenido = true;
      despertar = null;
      if (temporizador) clearTimeout(temporizador);
    },
  };
}
