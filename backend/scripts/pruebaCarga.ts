/**
 * Prueba de carga (RNF02).
 *
 * Criterio del documento maestro: "Con 100 usuarios concurrentes, el 95 % de
 * las consultas responde en menos de 2 segundos y el 95 % de los ingresos
 * en menos de 3 segundos".
 *
 * Simula durante un minuto 100 usuarios a la vez, sin pausas largas:
 * - 80 consultan la disponibilidad como lo hace la aplicación: cupos por
 *   tipo, plano de la sede, espacios libres y, de vez en cuando, la
 *   predicción de la red neuronal y el pronóstico de 24 horas.
 * - 20 operadores registran ingresos y, un momento después, la salida con
 *   su pago, en la "Sede Prueba RNF02" (600 espacios en 4 pisos), para no
 *   llenar las sedes de la demostración.
 * Mide cada solicitud y calcula los percentiles 50, 95 y 99.
 *
 * Uso, con el backend corriendo (mejor el compilado: npm run build && npm start):
 *   npx tsx scripts/pruebaCarga.ts [usuarios] [segundos]
 */
const API = process.env.API_URL || "http://localhost:3000/api";
const USUARIOS = Number(process.argv[2]) || 100;
const SEGUNDOS = Number(process.argv[3]) || 60;
const OPERADORES = Math.max(1, Math.round(USUARIOS * 0.2));
const SEDE = "Sede Prueba RNF02";

type Tipo = "consulta" | "ingreso" | "salida";
const medidas: Record<Tipo, number[]> = { consulta: [], ingreso: [], salida: [] };
const errores: Record<Tipo, number> = { consulta: 0, ingreso: 0, salida: 0 };
const ejemplos: string[] = [];

async function llamar(tipo: Tipo | null, metodo: string, ruta: string, token?: string, body?: unknown) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const datos = await r.json().catch(() => ({}));
    const ms = performance.now() - t0;
    if (tipo) {
      medidas[tipo].push(ms);
      if (r.status >= 500 || (r.status >= 400 && tipo !== "consulta")) {
        errores[tipo]++;
        if (ejemplos.length < 5) ejemplos.push(`${tipo} ${r.status}: ${(datos as { error?: string }).error}`);
      }
    }
    return { status: r.status, datos: datos as Record<string, unknown> };
  } catch (e) {
    if (tipo) {
      medidas[tipo].push(performance.now() - t0);
      errores[tipo]++;
      if (ejemplos.length < 5) ejemplos.push(`${tipo}: ${(e as Error).message}`);
    }
    return { status: 0, datos: {} };
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const azar = (min: number, max: number) => min + Math.random() * (max - min);

async function prepararSede(admin: string, idOperador: number) {
  const sedes = (await llamar(null, "GET", "/admin/parqueaderos", admin)).datos as unknown as { id_parqueadero: number; nombre: string }[];
  const existente = sedes.find((s) => s.nombre === SEDE);
  const datos = {
    nombre: SEDE,
    direccion: "Sede de prueba de carga",
    ciudad: "Bogotá",
    pisos: 4,
    espaciosPorPiso: [1, 2, 3, 4].map(() => ({ 1: 150, 2: 0, 3: 0 })),
    tarifas: [{ idTipo: 1, valor_hora: 4000, valor_fraccion: 1500, valor_dia: 30000 }],
    horarios: [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, abre: "00:00", cierra: "24:00" })),
    operadores: [idOperador],
  };
  if (existente) return existente.id_parqueadero;
  const r = await llamar(null, "POST", "/admin/parqueaderos", admin, datos);
  if (r.status !== 201) throw new Error(`No se pudo crear la sede de carga: ${JSON.stringify(r.datos)}`);
  return (r.datos as { id_parqueadero: number }).id_parqueadero;
}

async function vaciar(token: string, idSede: number) {
  const activos = (await llamar(null, "GET", `/estacionamiento/activos?idParqueadero=${idSede}`, token)).datos as unknown as { id_registro: number }[];
  for (let i = 0; i < activos.length; i += 20) {
    await Promise.all(activos.slice(i, i + 20).map((a) => llamar(null, "POST", `/estacionamiento/salida/${a.id_registro}`, token, { metodo: "EFECTIVO" })));
  }
}

function percentil(valores: number[], p: number) {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1)];
}

async function main() {
  const login = (correo: string, contrasena: string) =>
    llamar(null, "POST", "/auth/login", undefined, { correo, contrasena }).then((r) => r.datos as { token: string; usuario: { id_usuario: number } });
  const admin = await login("admin@parkway.test", "Admin123*");
  const operador = await login("operador1@parkway.test", "Operador123*");
  const idCarga = await prepararSede(admin.token, operador.usuario.id_usuario);
  await vaciar(operador.token, idCarga);
  const sedesDemo = ((await llamar(null, "GET", "/catalogos/parqueaderos")).datos as unknown as { id_parqueadero: number; nombre: string }[])
    .filter((s) => !s.nombre.startsWith("Sede Prueba"))
    .map((s) => s.id_parqueadero);

  const fin = Date.now() + SEGUNDOS * 1000;
  let placas = 0;
  const prefijo = String.fromCharCode(65 + (Date.now() % 26));

  async function consultor() {
    while (Date.now() < fin) {
      const sede = sedesDemo[Math.floor(Math.random() * sedesDemo.length)];
      // Lo que pide la pantalla de disponibilidad al abrirse o al llegar un aviso.
      await Promise.all([
        llamar("consulta", "GET", `/estacionamiento/resumen?idParqueadero=${sede}`),
        llamar("consulta", "GET", `/estacionamiento/plano?idParqueadero=${sede}`),
        llamar("consulta", "GET", `/estacionamiento/disponibilidad?idParqueadero=${sede}&idTipo=1`),
      ]);
      if (Math.random() < 0.1) await llamar("consulta", "GET", `/catalogos/parqueaderos/${sede}/prediccion`);
      if (Math.random() < 0.05) await llamar("consulta", "GET", `/catalogos/parqueaderos/${sede}/pronostico`);
      await esperar(azar(200, 1000));
    }
  }

  async function portero() {
    const dentro: number[] = [];
    while (Date.now() < fin) {
      const n = placas++;
      const placa = `${prefijo}Q${String.fromCharCode(65 + Math.floor(n / 1000) % 26)}${String(n % 1000).padStart(3, "0")}`;
      const r = await llamar("ingreso", "POST", "/estacionamiento/ingreso", operador.token, { placa, idTipo: 1, idParqueadero: idCarga });
      if (r.status === 201) dentro.push((r.datos as { id_registro: number }).id_registro);
      await esperar(azar(300, 1200));
      if (dentro.length > 3) {
        const id = dentro.shift()!;
        await llamar("salida", "POST", `/estacionamiento/salida/${id}`, operador.token, { metodo: Math.random() < 0.5 ? "EFECTIVO" : "TRANSFERENCIA", referencia: `CARGA-${id}` });
        await esperar(azar(300, 1200));
      }
    }
  }

  console.log(`Prueba de carga (RNF02): ${USUARIOS} usuarios durante ${SEGUNDOS} s (${USUARIOS - OPERADORES} consultan, ${OPERADORES} operan la portería)...`);
  const t0 = Date.now();
  await Promise.all([
    ...Array.from({ length: USUARIOS - OPERADORES }, () => consultor()),
    ...Array.from({ length: OPERADORES }, () => portero()),
  ]);
  const segundos = (Date.now() - t0) / 1000;
  await vaciar(operador.token, idCarga);

  const fila = (t: Tipo) => {
    const m = medidas[t];
    return `${t.padEnd(9)} ${String(m.length).padStart(7)} ${String(errores[t]).padStart(7)} ${percentil(m, 50).toFixed(0).padStart(7)} ${percentil(m, 95).toFixed(0).padStart(7)} ${percentil(m, 99).toFixed(0).padStart(7)} ${Math.max(0, ...m).toFixed(0).padStart(8)}`;
  };
  const total = medidas.consulta.length + medidas.ingreso.length + medidas.salida.length;
  console.log(`\n${"operación".padEnd(9)} ${"pedidos".padStart(7)} ${"errores".padStart(7)} ${"p50 ms".padStart(7)} ${"p95 ms".padStart(7)} ${"p99 ms".padStart(7)} ${"máx ms".padStart(8)}`);
  (["consulta", "ingreso", "salida"] as Tipo[]).forEach((t) => console.log(fila(t)));
  console.log(`\n${total} solicitudes en ${segundos.toFixed(0)} s: ${(total / segundos).toFixed(0)} por segundo.`);
  if (ejemplos.length) console.log(`Ejemplos de errores:\n  ${ejemplos.join("\n  ")}`);

  const p95c = percentil(medidas.consulta, 95);
  const p95i = percentil(medidas.ingreso, 95);
  const criterios = [
    [`El 95 % de las consultas responde en menos de 2 s (p95 = ${p95c.toFixed(0)} ms)`, p95c < 2000],
    [`El 95 % de los ingresos responde en menos de 3 s (p95 = ${p95i.toFixed(0)} ms)`, p95i < 3000],
    ["Ningún ingreso ni salida falla", errores.ingreso === 0 && errores.salida === 0 && errores.consulta === 0],
  ] as const;
  console.log("");
  for (const [texto, cumple] of criterios) console.log(`${(cumple ? "CUMPLE" : "NO CUMPLE").padEnd(9)}  ${texto}`);
  process.exit(criterios.every(([, c]) => c) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
