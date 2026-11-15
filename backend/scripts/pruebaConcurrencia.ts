/**
 * Prueba de concurrencia (RNF03).
 *
 * Criterio del documento maestro: "En una prueba de 50 ingresos simultáneos
 * sobre 10 espacios, el sistema registra 10 ingresos y rechaza 40, sin
 * espacios duplicados".
 *
 * 1. Prepara la "Sede Prueba RNF03" con exactamente 10 espacios de
 *    automóvil (la crea por la API la primera vez y la deja libre las demás).
 *    Con otra cantidad de espacios usa otra sede de prueba.
 * 2. Envía 50 ingresos simultáneos de placas distintas.
 * 3. Comprueba que se aceptaron 10, se rechazaron 40, ningún espacio quedó
 *    con dos vehículos y la bitácora tiene 10 ingresos confirmados y 40
 *    revertidos.
 * 4. Da salida a los 10 vehículos a la vez, cada uno con su pago.
 * 5. Envía 20 cobros simultáneos de la misma salida: debe quedar un solo pago.
 *
 * Uso, con el backend corriendo:
 *   npx tsx scripts/pruebaConcurrencia.ts [solicitudes] [espacios]
 * Por defecto 50 solicitudes y 10 espacios.
 */
const API = process.env.API_URL || "http://localhost:3000/api";
const N = Number(process.argv[2]) || 50;
const ESPACIOS = Number(process.argv[3]) || 10;
// Una sede por cantidad de espacios: los espacios con historial no se pueden quitar.
const SEDE = ESPACIOS === 10 ? "Sede Prueba RNF03" : `Sede Prueba RNF03 (${ESPACIOS} espacios)`;

type Respuesta<T = Record<string, unknown>> = { status: number; body: T; ms: number };

async function llamar<T = Record<string, unknown>>(metodo: string, ruta: string, token?: string, body?: unknown): Promise<Respuesta<T>> {
  const t0 = performance.now();
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T, ms: performance.now() - t0 };
}

async function sesion(correo: string, contrasena: string) {
  const r = await llamar<{ token: string; usuario: { id_usuario: number } }>("POST", "/auth/login", undefined, { correo, contrasena });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${correo}`);
  return r.body;
}

interface SedeAdmin { id_parqueadero: number; nombre: string; espacios: Record<string, number>; operadores: number[] }

/** Crea la sede de prueba con ESPACIOS automóviles o la deja así si ya existe. */
async function prepararSede(admin: string, idOperador: number): Promise<number> {
  const datos = {
    nombre: SEDE,
    direccion: "Sede de prueba de concurrencia",
    ciudad: "Bogotá",
    pisos: 1,
    espaciosPorPiso: [{ 1: ESPACIOS, 2: 0, 3: 0 }],
    tarifas: [{ idTipo: 1, valor_hora: 4000, valor_fraccion: 1500, valor_dia: 30000 }],
    horarios: [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, abre: "00:00", cierra: "24:00" })),
    operadores: [idOperador],
  };
  const sedes = await llamar<SedeAdmin[]>("GET", "/admin/parqueaderos", admin);
  const existente = sedes.body.find((s) => s.nombre === SEDE);
  const r = existente
    ? await llamar<SedeAdmin>("PUT", `/admin/parqueaderos/${existente.id_parqueadero}`, admin, datos)
    : await llamar<SedeAdmin>("POST", "/admin/parqueaderos", admin, datos);
  if (r.status >= 300) throw new Error(`No se pudo preparar la sede: ${JSON.stringify(r.body)}`);
  return r.body.id_parqueadero;
}

/** Da salida, con pago en efectivo, a los vehículos que sigan dentro de la sede. */
async function vaciarSede(token: string, idSede: number) {
  const activos = await llamar<{ id_registro: number }[]>("GET", `/estacionamiento/activos?idParqueadero=${idSede}`, token);
  const r = await Promise.all(activos.body.map((a) => llamar("POST", `/estacionamiento/salida/${a.id_registro}`, token, { metodo: "EFECTIVO" })));
  return r;
}

const placa = (corrida: number, i: number) => {
  const letras = "ABCDEFGHJKLMNPRSTUVWXYZ";
  return `T${letras[corrida % letras.length]}${letras[Math.floor(corrida / letras.length) % letras.length]}${String(i).padStart(3, "0")}`;
};

const ok = (cumple: boolean) => (cumple ? "CUMPLE" : "NO CUMPLE");

async function main() {
  const admin = await sesion("admin@parkway.test", "Admin123*");
  const operador = await sesion("operador1@parkway.test", "Operador123*");
  const idSede = await prepararSede(admin.token, operador.usuario.id_usuario);
  await vaciarSede(operador.token, idSede);

  const antes = await llamar<{ filas: { id_transaccion: number }[] }>("GET", "/admin/bitacora?entidad=registro_estacionamiento", admin.token);
  const ultimaAntes = antes.body.filas[0]?.id_transaccion ?? 0;

  // 2. N ingresos simultáneos
  const corrida = Math.floor(Date.now() / 1000) % 500;
  const t0 = performance.now();
  const ingresos = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      llamar<{ id_registro?: number; codigo_espacio?: string; error?: string }>("POST", "/estacionamiento/ingreso", operador.token, {
        placa: placa(corrida, i), idTipo: 1, idParqueadero: idSede,
      })
    )
  );
  const duracion = performance.now() - t0;
  const aceptados = ingresos.filter((r) => r.status === 201);
  const rechazados = ingresos.filter((r) => r.status === 409);
  const otros = ingresos.filter((r) => r.status !== 201 && r.status !== 409);
  const espacios = aceptados.map((r) => r.body.codigo_espacio!);
  const duplicados = espacios.filter((e, i) => espacios.indexOf(e) !== i);
  const esperados = Math.min(N, ESPACIOS);

  // 3. Bitácora: un ingreso confirmado por cada aceptado y uno revertido por cada rechazo.
  const bitacora = await llamar<{ filas: { id_transaccion: number; tipo_operacion: string; estado: string }[] }>(
    "GET", "/admin/bitacora?entidad=registro_estacionamiento&tipo=INGRESO", admin.token
  );
  const nuevas = bitacora.body.filas.filter((f) => f.id_transaccion > ultimaAntes);
  const confirmadas = nuevas.filter((f) => f.estado === "CONFIRMADA").length;
  const revertidas = nuevas.filter((f) => f.estado === "REVERTIDA").length;

  // 4. Salidas simultáneas con pago
  const salidas = await Promise.all(
    aceptados.map((a) => llamar<{ comprobante?: string }>("POST", `/estacionamiento/salida/${a.body.id_registro}`, operador.token, { metodo: "EFECTIVO" }))
  );
  const comprobantes = salidas.map((s) => s.body.comprobante).filter(Boolean);

  // 5. 20 cobros simultáneos de la misma salida
  const unIngreso = await llamar<{ id_registro: number }>("POST", "/estacionamiento/ingreso", operador.token, { placa: placa(corrida, 999), idTipo: 1, idParqueadero: idSede });
  const cobros = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      llamar("POST", `/estacionamiento/salida/${unIngreso.body.id_registro}`, operador.token, { metodo: "TARJETA", referencia: `${corrida}${String(i).padStart(4, "0")}` })
    )
  );
  const cobrosOk = cobros.filter((c) => c.status === 200).length;

  const criterios = [
    [`${N} ingresos simultáneos sobre ${ESPACIOS} espacios: se aceptan ${esperados}`, aceptados.length === esperados],
    [`Se rechazan ${N - esperados} con 409`, rechazados.length === N - esperados && otros.length === 0],
    ["Ningún espacio queda con dos vehículos", duplicados.length === 0],
    [`La bitácora tiene ${esperados} ingresos confirmados y ${N - esperados} revertidos`, confirmadas === esperados && revertidas === N - esperados],
    [`Las ${aceptados.length} salidas simultáneas se cobran, cada una con su comprobante`, comprobantes.length === aceptados.length && new Set(comprobantes).size === comprobantes.length],
    ["20 cobros simultáneos de la misma salida dejan un solo pago", cobrosOk === 1],
  ] as const;

  console.log(`\nPrueba de concurrencia (RNF03) en ${SEDE}`);
  console.log(`Ingresos: ${aceptados.length} aceptados, ${rechazados.length} rechazados, ${otros.length} con otro código, en ${Math.round(duracion)} ms`);
  console.log(`Espacios asignados: ${[...espacios].sort().join(", ")}`);
  console.log(`Bitácora: ${confirmadas} confirmados, ${revertidas} revertidos`);
  console.log(`Salidas con pago: ${comprobantes.length}; cobros simultáneos aceptados: ${cobrosOk} de 20\n`);
  for (const [texto, cumple] of criterios) console.log(`${ok(cumple).padEnd(9)}  ${texto}`);
  if (otros[0]) console.log(`\nEjemplo de otro código: ${otros[0].status} ${otros[0].body.error}`);
  process.exit(criterios.every(([, c]) => c) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
