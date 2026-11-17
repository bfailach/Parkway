/**
 * Pruebas de la arquitectura distribuida (Sistemas Distribuidos).
 *
 * Se ejecutan contra el gateway del clúster (docker compose up). Cada
 * escenario imprime CUMPLE o NO CUMPLE y, al final, un resumen en JSON.
 *
 *   Integración y concurrencia (no detienen nada):
 *     1. Balanceo de carga entre las réplicas del backend.
 *     2. Sesión sin estado: el token sirve en cualquier réplica.
 *     3. Token ES256 verificado por otro servicio con el JWKS.
 *     4. Bloqueo distribuido: 20 ingresos simultáneos de la misma placa.
 *     5. Caché compartida: lectura actualizada tras una escritura en otro nodo.
 *     6. Outbox → RabbitMQ → servicio de eventos, con su latencia.
 *   Tolerancia a fallos (detienen y reinician componentes):
 *     7. Caída de una réplica del backend durante una carga.
 *     8. Caída de Redis.
 *     9. Caída de RabbitMQ: los eventos no se pierden.
 *    10. Caída de los consumidores y reentrega; descarte de duplicados.
 *    11. Caída del primario de PostgreSQL: 503 y recuperación automática.
 *
 * Uso:
 *   API_URL=http://localhost:8080 npx tsx scripts/pruebaDistribuida.ts [todo|integracion|fallos]
 *
 * Los comandos para detener e iniciar componentes se pueden cambiar con
 * variables (por defecto, Docker Compose): PARAR_API1, INICIAR_API1,
 * PARAR_REDIS, INICIAR_REDIS, PARAR_RABBIT, INICIAR_RABBIT, PARAR_EVENTOS,
 * INICIAR_EVENTOS, PARAR_BD, INICIAR_BD y PUBLICAR_DUPLICADO.
 */
import { execSync } from "child_process";

const BASE = (process.env.API_URL || "http://localhost:8080").replace(/\/$/, "");
const MODO = process.argv[2] || "todo";
const cmd = (nombre: string, defecto: string) => process.env[nombre] || defecto;
const COMANDOS = {
  pararApi1: cmd("PARAR_API1", "docker compose kill api1"),
  iniciarApi1: cmd("INICIAR_API1", "docker compose start api1"),
  pararRedis: cmd("PARAR_REDIS", "docker compose stop redis"),
  iniciarRedis: cmd("INICIAR_REDIS", "docker compose start redis"),
  pararRabbit: cmd("PARAR_RABBIT", "docker compose stop rabbitmq"),
  iniciarRabbit: cmd("INICIAR_RABBIT", "docker compose start rabbitmq"),
  pararEventos: cmd("PARAR_EVENTOS", "docker compose stop eventos"),
  iniciarEventos: cmd("INICIAR_EVENTOS", "docker compose start eventos"),
  pararBd: cmd("PARAR_BD", "docker compose stop postgres-primario"),
  iniciarBd: cmd("INICIAR_BD", "docker compose start postgres-primario"),
};

type R = { status: number; body: any; nodo: string | null; ms: number }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function llamar(metodo: string, ruta: string, token?: string, body?: unknown): Promise<R> {
  const t0 = performance.now();
  try {
    const r = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return { status: r.status, body: await r.json().catch(() => ({})), nodo: r.headers.get("x-parkway-nodo"), ms: performance.now() - t0 };
  } catch {
    return { status: 0, body: {}, nodo: null, ms: performance.now() - t0 };
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const resultados: { escenario: string; cumple: boolean; detalle: string }[] = [];
function verificar(escenario: string, cumple: boolean, detalle: string) {
  resultados.push({ escenario, cumple, detalle });
  console.log(`${cumple ? "CUMPLE   " : "NO CUMPLE"}  ${escenario}\n           ${detalle}`);
}
function ejecutar(comando: string) {
  console.log(`           $ ${comando}`);
  execSync(comando, { stdio: "ignore" });
}
async function hasta(cond: () => Promise<boolean>, maxMs: number, pasoMs = 200): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await cond()) return Date.now() - t0;
    await esperar(pasoMs);
  }
  return null;
}
const contar = (xs: (string | null)[]) => xs.reduce<Record<string, number>>((a, x) => ({ ...a, [x ?? "sin respuesta"]: (a[x ?? "sin respuesta"] ?? 0) + 1 }), {});
const placa = () => `D${Math.random().toString(36).slice(2, 4).toUpperCase().replace(/[^A-Z]/g, "X")}${String(Math.floor(Math.random() * 900) + 100)}`.slice(0, 6);

let admin = "";
let operador = "";
let cliente = "";
let sede = 0;

async function sesion(correo: string, contrasena: string) {
  const r = await llamar("POST", "/api/auth/login", undefined, { correo, contrasena });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${correo} (${r.status})`);
  return r.body.token as string;
}

async function ingreso(p: string) {
  return llamar("POST", "/api/estacionamiento/ingreso", operador, { idParqueadero: sede, idTipo: 1, placa: p, marca: "Prueba", color: "Gris" });
}
async function salida(idRegistro: number) {
  return llamar("POST", `/api/estacionamiento/salida/${idRegistro}`, operador, { metodo: "EFECTIVO" });
}
async function ingresoYSalida(p: string) {
  const i = await ingreso(p);
  if (i.status !== 201 && i.status !== 200) return { i, s: null };
  return { i, s: await salida(i.body.id_registro) };
}
async function libres() {
  const r = await llamar("GET", `/api/estacionamiento/resumen?idParqueadero=${sede}`);
  return r.body?.totales?.libres as number;
}
async function salud() {
  return (await llamar("GET", "/api/salud/distribuida")).body;
}
async function eventosRecientes(limite = 200) {
  const r = await llamar("GET", `/eventos/recientes?limite=${limite}`, admin);
  return r.status === 200 ? (r.body as { id_entidad: string; tipo: string; instancia: string; retraso_ms: number }[]) : [];
}

async function preparar() {
  admin = await sesion("admin@parkway.test", "Admin123*");
  operador = await sesion("operador1@parkway.test", "Operador123*");
  cliente = await sesion("cliente1@parkway.test", "Cliente123*");
  const sedes = await llamar("GET", "/api/estacionamiento/mis-sedes", operador);
  const prueba = (sedes.body as { id_parqueadero: number; nombre: string }[]).find((s) => s.nombre === "Sede Prueba RNF03");
  if (!prueba) throw new Error("Falta la 'Sede Prueba RNF03'. Ejecute antes scripts/pruebaConcurrencia.ts contra el gateway.");
  sede = prueba.id_parqueadero;
  // Deja la sede libre por si una corrida anterior se interrumpió.
  const activos = await llamar("GET", `/api/estacionamiento/activos?idParqueadero=${sede}`, operador);
  for (const a of activos.body as { id_registro: number }[]) await salida(a.id_registro);
}

/**
 * Clasifica los 409 según qué capa los detuvo:
 *  - candado: esperó el bloqueo de Redis más de 3 s;
 *  - regla de negocio: el servicio vio el ingreso ya confirmado (serializado);
 *  - índice único: dos transacciones corrieron a la vez y PostgreSQL rechazó la segunda.
 */
function motivosDeRechazo(rs: R[]) {
  return contar(
    rs
      .filter((r) => r.status === 409)
      .map((r) =>
        /otra operación en curso/.test(r.body.error)
          ? "candado vencido"
          : /ya se encuentra dentro/.test(r.body.error)
            ? "regla de negocio (serializado)"
            : /ingreso abierto|ya fue ocupado|ya está registrado/.test(r.body.error)
              ? "restricción única de PostgreSQL"
              : `otro: ${r.body.error}`
      )
  );
}

// ---------------------------------------------------------------------
async function integracion() {
  console.log("\n== Integración y concurrencia ==");

  // 1. Balanceo
  const lote = await Promise.all(Array.from({ length: 200 }, () => llamar("GET", `/api/estacionamiento/plano?idParqueadero=${sede}`)));
  const porNodo = contar(lote.map((r) => r.nodo));
  const nodos = Object.keys(porNodo).filter((n) => n.startsWith("api"));
  verificar(
    "1. El gateway reparte la carga entre las réplicas",
    nodos.length >= 2 && Math.min(...nodos.map((n) => porNodo[n])) >= 40 && lote.every((r) => r.status === 200),
    `200 consultas simultáneas: ${JSON.stringify(porNodo)}`
  );

  // 2. Sesión sin estado
  const me = await Promise.all(Array.from({ length: 20 }, () => llamar("GET", "/api/auth/me", cliente)));
  const nodosMe = contar(me.map((r) => r.nodo));
  verificar(
    "2. Un mismo token es válido en cualquier réplica (sesión sin estado)",
    me.every((r) => r.status === 200) && Object.keys(nodosMe).length >= 2,
    `20 consultas de perfil con el mismo token: ${JSON.stringify(nodosMe)}, todas 200: ${me.every((r) => r.status === 200)}`
  );

  // 3. JWKS
  const jwks = await llamar("GET", "/.well-known/jwks.json");
  const a = await llamar("GET", "/eventos/resumen?dias=1", admin);
  const c = await llamar("GET", "/eventos/resumen?dias=1", cliente);
  const partes = admin.split(".");
  const alterado = `${partes[0]}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cliente.split(".")[1], "base64url").toString()), rol: "ADMINISTRADOR" })).toString("base64url")}.${partes[2]}`;
  const f = await llamar("GET", "/eventos/resumen?dias=1", alterado);
  verificar(
    "3. El servicio de eventos verifica los tokens con la llave pública (JWKS)",
    jwks.body?.keys?.[0]?.alg === "ES256" && a.status === 200 && c.status === 403 && f.status === 401,
    `JWKS: ${jwks.body?.keys?.length} llave ${jwks.body?.keys?.[0]?.alg} kid=${jwks.body?.keys?.[0]?.kid}; administrador → ${a.status}, cliente → ${c.status}, token con el rol alterado → ${f.status}`
  );

  // 4. Bloqueo distribuido
  const p = placa();
  const misma = await Promise.all(Array.from({ length: 20 }, () => ingreso(p)));
  const aceptados = misma.filter((r) => r.status === 201 || r.status === 200);
  const motivos = motivosDeRechazo(misma);
  verificar(
    "4. 20 ingresos simultáneos de la misma placa en dos réplicas: entra uno solo",
    aceptados.length === 1 && misma.filter((r) => r.status >= 500 || r.status === 0).length === 0,
    `aceptados ${aceptados.length}, rechazados con 409: ${JSON.stringify(motivos)}, atendidos por ${JSON.stringify(contar(misma.map((r) => r.nodo)))}`
  );
  if (aceptados[0]) await salida(aceptados[0].body.id_registro);

  // 5. Caché compartida e invalidación
  const antes = await libres();
  await libres(); // queda en caché
  const p2 = placa();
  const i = await ingreso(p2);
  const t = await hasta(async () => (await libres()) === antes - 1, 3000, 25);
  verificar(
    "5. La caché de disponibilidad se invalida en todos los nodos tras un ingreso",
    i.status === 201 && t !== null && t < 1000,
    `libres antes ${antes}; ingreso en ${i.nodo}; la consulta pública mostró ${antes - 1} a los ${t} ms`
  );

  // 6. Outbox → RabbitMQ → eventos
  const s = await salida(i.body.id_registro);
  const tEv = await hasta(async () => (await eventosRecientes(50)).some((e) => e.tipo === "SALIDA" && e.id_entidad === String(i.body.id_registro)), 10_000, 100);
  const ev = (await eventosRecientes(50)).filter((e) => e.id_entidad === String(i.body.id_registro));
  verificar(
    "6. Cada operación confirmada llega como evento al servicio de eventos",
    s.status === 200 && tEv !== null && ev.length === 2,
    `ingreso y salida del registro ${i.body.id_registro}: ${ev.map((e) => `${e.tipo} (procesó ${e.instancia}, ${e.retraso_ms} ms)`).join(", ")}; visible a los ${tEv} ms`
  );
}

// ---------------------------------------------------------------------
async function fallos() {
  console.log("\n== Tolerancia a fallos ==");

  // 7. Caída de una réplica durante la carga
  {
    const fases: Record<string, (string | null)[]> = { antes: [], durante: [], despues: [] };
    const errores: Record<string, number> = { antes: 0, durante: 0, despues: 0 };
    let fase = "antes";
    let activo = true;
    const usuario = async () => {
      while (activo) {
        const r = await llamar("GET", `/api/estacionamiento/plano?idParqueadero=${sede}`);
        fases[fase].push(r.nodo);
        if (r.status !== 200) errores[fase]++;
      }
    };
    const operadorCiclo = async () => {
      while (activo) {
        const f = fase;
        const { i, s } = await ingresoYSalida(placa());
        if (![200, 201, 409].includes(i.status) || (s && s.status !== 200)) errores[f]++;
      }
    };
    const usuarios = [...Array.from({ length: 30 }, usuario), ...Array.from({ length: 5 }, operadorCiclo)];
    await esperar(5000);
    fase = "durante";
    ejecutar(COMANDOS.pararApi1);
    await esperar(10_000);
    ejecutar(COMANDOS.iniciarApi1);
    await hasta(async () => (await Promise.all(Array.from({ length: 6 }, () => llamar("GET", "/api/health")))).some((r) => r.nodo === "api1"), 30_000, 500);
    fase = "despues";
    await esperar(5000);
    activo = false;
    await Promise.all(usuarios);
    const total = Object.values(fases).reduce((a, x) => a + x.length, 0);
    const totalErr = Object.values(errores).reduce((a, x) => a + x, 0);
    verificar(
      "7. Si una réplica del backend se cae, el sistema sigue atendiendo",
      errores.durante <= Math.max(2, fases.durante.length * 0.005) && fases.despues.includes("api1"),
      `${total} consultas y ciclos de ingreso/salida; errores ${totalErr} (${((totalErr / total) * 100).toFixed(2)} %). ` +
        `Antes: ${JSON.stringify(contar(fases.antes))}; con api1 caída: ${JSON.stringify(contar(fases.durante))} (${errores.durante} errores); ` +
        `tras reiniciarla: ${JSON.stringify(contar(fases.despues))}`
    );
  }

  // 8. Caída de Redis
  {
    ejecutar(COMANDOS.pararRedis);
    await esperar(1000);
    const ops = [];
    for (let k = 0; k < 5; k++) ops.push(await ingresoYSalida(placa()));
    const ok = ops.filter((o) => o.i.status === 201 && o.s?.status === 200).length;
    // La misma prueba de la placa repetida, ahora sin el candado de Redis.
    const p = placa();
    const misma = await Promise.all(Array.from({ length: 20 }, () => ingreso(p)));
    const aceptados = misma.filter((r) => r.status === 201);
    if (aceptados[0]) await salida(aceptados[0].body.id_registro);
    const durante = (await salud()).dependencias.redis;
    ejecutar(COMANDOS.iniciarRedis);
    const t = await hasta(async () => {
      await libres(); // genera tráfico para que el circuito pruebe Redis
      return (await salud()).dependencias.redis.estado === "ok";
    }, 30_000, 500);
    verificar(
      "8. Sin Redis el sistema opera en modo degradado y se recupera solo",
      ok === 5 && aceptados.length === 1 && t !== null,
      `con Redis caído: ${ok}/5 ingresos y salidas correctos, circuito ${durante.circuito}; 20 ingresos simultáneos de una placa: ` +
        `${aceptados.length} aceptado, rechazos ${JSON.stringify(motivosDeRechazo(misma))}; Redis de vuelta en uso a los ${t} ms`
    );
  }

  // 9. Caída de RabbitMQ
  {
    const antes = (await eventosRecientes(200)).length;
    ejecutar(COMANDOS.pararRabbit);
    await esperar(1000);
    const ids: string[] = [];
    let ok = 0;
    for (let k = 0; k < 5; k++) {
      const { i, s } = await ingresoYSalida(placa());
      if (i.status === 201 && s?.status === 200) {
        ok++;
        ids.push(String(i.body.id_registro));
      }
    }
    await esperar(1500);
    const pend = (await salud()).outbox.eventosPendientes;
    ejecutar(COMANDOS.iniciarRabbit);
    const t = await hasta(async () => {
      const ev = await eventosRecientes(200);
      return ids.every((id) => ev.filter((e) => e.id_entidad === id).length === 2);
    }, 90_000, 1000);
    const pendDespues = (await salud()).outbox.eventosPendientes;
    verificar(
      "9. Sin RabbitMQ las operaciones siguen y ningún evento se pierde",
      ok === 5 && pend >= 10 && t !== null && pendDespues === 0,
      `con el broker caído: ${ok}/5 ingresos y salidas, ${pend} eventos esperando en el outbox; ` +
        `al volver, los ${ids.length * 2} eventos llegaron al servicio de eventos en ${t} ms y quedaron ${pendDespues} pendientes (había ${antes} recientes)`
    );
  }

  // 10. Caída de los consumidores y duplicados
  {
    ejecutar(COMANDOS.pararEventos);
    await esperar(1000);
    const ids: string[] = [];
    for (let k = 0; k < 3; k++) {
      const { i } = await ingresoYSalida(placa());
      if (i.status === 201) ids.push(String(i.body.id_registro));
    }
    const sinServicio = await llamar("GET", "/eventos/salud");
    ejecutar(COMANDOS.iniciarEventos);
    const t = await hasta(async () => {
      const ev = await eventosRecientes(200);
      return ids.every((id) => ev.filter((e) => e.id_entidad === id).length === 2);
    }, 60_000, 1000);
    // Duplicado: se vuelve a publicar un evento ya procesado.
    let dupOk = true;
    let dupDetalle = "sin prueba de duplicado (falta PUBLICAR_DUPLICADO)";
    if (process.env.PUBLICAR_DUPLICADO) {
      const procesadosAntes = await totalProcesados();
      ejecutar(process.env.PUBLICAR_DUPLICADO);
      await esperar(2000);
      const procesadosDespues = await totalProcesados();
      dupOk = procesadosDespues.procesados === procesadosAntes.procesados && procesadosDespues.duplicados === procesadosAntes.duplicados + 1;
      dupDetalle = `un evento republicado se descartó como duplicado (procesados ${procesadosAntes.procesados} → ${procesadosDespues.procesados}, duplicados ${procesadosAntes.duplicados} → ${procesadosDespues.duplicados})`;
    }
    verificar(
      "10. Si el servicio de eventos se cae, los eventos esperan en la cola y no se cuentan dos veces",
      sinServicio.status !== 200 && t !== null && dupOk,
      `servicio de eventos caído (gateway respondió ${sinServicio.status}); al volver procesó los ${ids.length * 2} eventos pendientes en ${t} ms; ${dupDetalle}`
    );
  }

  // 11. Caída del primario de PostgreSQL
  {
    ejecutar(COMANDOS.pararBd);
    await esperar(1500);
    const r = await llamar("GET", `/api/estacionamiento/resumen?idParqueadero=${sede}`);
    const i = await ingreso(placa());
    const h = await llamar("GET", "/api/salud/distribuida");
    const inicio = Date.now();
    ejecutar(COMANDOS.iniciarBd);
    const t = await hasta(async () => (await ingreso(placa())).status === 201, 60_000, 500);
    verificar(
      "11. Sin la base de datos la API responde 503 y se recupera sin reiniciar los nodos",
      i.status === 503 && h.status === 503 && t !== null,
      `con el primario caído: consulta pública ${r.status}${r.status === 200 ? " (desde la caché)" : ""}, ingreso ${i.status}, salud ${h.status}; ` +
        `primer ingreso aceptado ${((Date.now() - inicio) / 1000).toFixed(1)} s después de iniciar la base`
    );
    const activos = await llamar("GET", `/api/estacionamiento/activos?idParqueadero=${sede}`, operador);
    for (const a of activos.body as { id_registro: number }[]) await salida(a.id_registro);
  }
}

async function totalProcesados() {
  const sumas = { procesados: 0, duplicados: 0 };
  const vistas = new Set<string>();
  // Varias consultas para pasar por las dos réplicas del servicio.
  for (let k = 0; k < 12 && vistas.size < 2; k++) {
    const r = await llamar("GET", "/eventos/salud");
    if (r.status === 200 && !vistas.has(r.body.instancia)) {
      vistas.add(r.body.instancia);
      sumas.procesados += r.body.metricas.procesados;
      sumas.duplicados += r.body.metricas.duplicados;
    }
  }
  return sumas;
}

(async () => {
  console.log(`Pruebas distribuidas contra ${BASE} (${new Date().toLocaleString("es-CO")})`);
  await preparar();
  if (MODO === "todo" || MODO === "integracion") await integracion();
  if (MODO === "todo" || MODO === "fallos") await fallos();
  const fallidos = resultados.filter((r) => !r.cumple).length;
  console.log(`\nResumen: ${resultados.length - fallidos} de ${resultados.length} escenarios cumplen.`);
  console.log(JSON.stringify(resultados, null, 2));
  process.exit(fallidos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
