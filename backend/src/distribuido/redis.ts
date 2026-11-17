import { randomUUID } from "crypto";
import Redis from "ioredis";
import { conflict } from "../errors/AppError";
import { CircuitBreaker } from "./circuitBreaker";
import { distribuido, logDistribuido, NODO_ID } from "./config";

/**
 * Coordinación entre nodos con Redis.
 *
 * 1. Bloqueo distribuido: evita que dos réplicas procesen a la vez una
 *    operación sobre el mismo recurso (por ejemplo, la misma placa).
 * 2. Caché de disponibilidad: las consultas públicas de cupos se responden
 *    desde Redis y se invalidan cuando la base avisa un cambio.
 * 3. Liderazgo: solo una réplica ejecuta las tareas periódicas.
 *
 * Redis es una ayuda, no la fuente de verdad. Si no está configurado o se
 * cae, el circuito se abre y el backend sigue funcionando sin él: la
 * consistencia la garantizan las transacciones, los bloqueos de fila y los
 * índices únicos de PostgreSQL.
 */
const log = (...m: unknown[]) => logDistribuido("redis", ...m);

let cliente: Redis | null = null;
let yaConectado = false;

export const circuitoRedis = new CircuitBreaker("redis", {
  umbral: 3,
  esperaMs: 10_000,
  timeoutMs: 500,
  alCambiar: (e) => log(`circuito ${e}`),
});

function obtener(): Redis | null {
  if (!distribuido.redisUrl) return null;
  if (!cliente) {
    cliente = new Redis(distribuido.redisUrl, {
      // Si Redis no está, los comandos fallan de inmediato en vez de
      // quedar en cola: el circuito decide qué hacer.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (intento) => Math.min(intento * 500, 5000),
    });
    cliente.on("ready", () => {
      yaConectado = true;
      log("conectado");
    });
    cliente.on("error", () => undefined); // los fallos se cuentan en el circuito
  }
  return cliente;
}

/** Abre la conexión al arrancar el nodo, para que las primeras peticiones ya la encuentren lista. */
export function conectarRedis() {
  obtener();
}

export function redisActivo() {
  return Boolean(distribuido.redisUrl);
}

/** Ejecuta un comando de Redis a través del circuito. Devuelve null si Redis no está disponible. */
async function comando<T>(fn: (r: Redis) => Promise<T>): Promise<T | null> {
  const r = obtener();
  if (!r) return null;
  // Mientras se (re)conecta, se trabaja sin Redis. Si la conexión ya había
  // funcionado (Redis se cayó), el circuito cuenta el fallo; en el arranque no.
  if (r.status !== "ready") {
    if (yaConectado) circuitoRedis.fallo();
    return null;
  }
  try {
    return await circuitoRedis.ejecutar(() => fn(r));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// 1. Bloqueo distribuido (SET NX PX con dueño y liberación atómica)
// ---------------------------------------------------------------------
const LIBERAR = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/**
 * Ejecuta `fn` con el recurso `clave` bloqueado en todo el clúster.
 * Espera hasta `esperaMs` a que otro nodo lo libere; si no lo logra,
 * responde 409. Si Redis no está disponible, ejecuta `fn` sin bloqueo
 * (modo degradado) porque la base sigue impidiendo la doble ocupación.
 */
export async function conCandado<T>(clave: string, fn: () => Promise<T>, opciones: { ttlMs?: number; esperaMs?: number } = {}): Promise<T> {
  const ttlMs = opciones.ttlMs ?? 10_000;
  const esperaMs = opciones.esperaMs ?? 3000;
  const llave = `parkway:candado:${clave}`;
  const dueno = `${NODO_ID}:${randomUUID()}`;

  if (!redisActivo() || circuitoRedis.estado === "ABIERTO") return fn();

  const limite = Date.now() + esperaMs;
  for (;;) {
    // SET NX devuelve null si otro nodo tiene el candado; se traduce a "OCUPADO"
    // para no confundirlo con Redis caído (comando() devuelve null).
    const ok = await comando(async (r) => (await r.set(llave, dueno, "PX", ttlMs, "NX")) ?? "OCUPADO");
    if (ok === null) return fn(); // Redis cayó mientras esperábamos: modo degradado
    if (ok === "OK") break;
    if (Date.now() >= limite) throw conflict("Hay otra operación en curso sobre el mismo vehículo. Intente de nuevo.");
    await new Promise((res) => setTimeout(res, 50));
  }

  try {
    return await fn();
  } finally {
    await comando((r) => r.eval(LIBERAR, 1, llave, dueno));
  }
}

// ---------------------------------------------------------------------
// 2. Caché de consultas públicas
// ---------------------------------------------------------------------
const PREFIJO_CACHE = "parkway:cache:";

export async function enCache<T>(clave: string, ttlS: number, calcular: () => Promise<T>): Promise<T> {
  if (!redisActivo()) return calcular();
  const guardado = await comando((r) => r.get(PREFIJO_CACHE + clave));
  if (guardado) return JSON.parse(guardado) as T;
  const valor = await calcular();
  await comando((r) => r.set(PREFIJO_CACHE + clave, JSON.stringify(valor), "EX", ttlS));
  return valor;
}

/** Borra la caché de una sede. La llama cada nodo al recibir el aviso de PostgreSQL. */
export async function invalidarSede(idParqueadero: number) {
  if (!redisActivo()) return;
  await comando((r) => r.del(`${PREFIJO_CACHE}resumen:${idParqueadero}`, `${PREFIJO_CACHE}plano:${idParqueadero}`));
}

// ---------------------------------------------------------------------
// 3. Liderazgo para tareas periódicas
// ---------------------------------------------------------------------
const RENOVAR = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  redis.call("pexpire", KEYS[1], ARGV[2]) return 1
elseif redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[2], "NX") then
  return 1
else
  return 0
end`;

let eraLider: boolean | null = null;

/**
 * Indica si este nodo es el líder de la tarea `nombre`. El líder renueva su
 * turno en cada llamada; si se cae, otro nodo toma el turno cuando vence.
 * Sin Redis, cada nodo se considera líder (comportamiento de un solo nodo).
 */
export async function soyLider(nombre: string, ttlMs: number): Promise<boolean> {
  if (!redisActivo()) return true;
  const r = await comando((c) => c.eval(RENOVAR, 1, `parkway:lider:${nombre}`, NODO_ID, String(ttlMs)));
  // Si Redis no responde, se ejecuta igual: la tarea es idempotente.
  const lider = r === null ? true : Number(r) === 1;
  if (lider !== eraLider) log(lider ? `es líder de "${nombre}"` : `cede el liderazgo de "${nombre}"`);
  eraLider = lider;
  return lider;
}

export async function estadoRedis() {
  if (!redisActivo()) return "deshabilitado";
  const pong = await comando((r) => r.ping());
  return pong === "PONG" ? "ok" : `sin conexión (circuito ${circuitoRedis.estado})`;
}

export async function cerrarRedis() {
  if (cliente) await cliente.quit().catch(() => undefined);
  cliente = null;
}
