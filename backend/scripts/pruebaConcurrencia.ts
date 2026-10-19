/**
 * Prueba de concurrencia del registro de ingreso (RNF03).
 *
 * Envía N ingresos simultáneos de bicicletas a la Sede Zona T, que tiene
 * 3 espacios de bicicleta. El resultado esperado es que solo se acepten
 * tantos ingresos como espacios libres y que ningún espacio quede asignado
 * a dos vehículos.
 *
 * Uso (con el backend corriendo y la base recién cargada con seed.sql):
 *   npx tsx scripts/pruebaConcurrencia.ts [cantidad]
 */
const API = process.env.API_URL || "http://localhost:3000/api";
const N = Number(process.argv[2]) || 20;

async function main() {
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ correo: "operador1@parkway.test", contrasena: "Operador123*" }),
  });
  const { token } = (await login.json()) as { token: string };

  const sufijo = Date.now().toString().slice(-4);
  const respuestas = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      fetch(`${API}/estacionamiento/ingreso`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ placa: `B${sufijo}${String(i).padStart(2, "0")}`, idTipo: 3, idParqueadero: 2 }),
      }).then(async (r) => ({ status: r.status, body: (await r.json()) as { codigo_espacio?: string; error?: string } }))
    )
  );

  const aceptados = respuestas.filter((r) => r.status === 201);
  const espacios = aceptados.map((r) => r.body.codigo_espacio);
  const duplicados = espacios.filter((e, i) => espacios.indexOf(e) !== i);

  console.log(`Solicitudes simultáneas: ${N}`);
  console.log(`Aceptadas (201): ${aceptados.length} -> espacios ${espacios.join(", ") || "ninguno"}`);
  console.log(`Rechazadas (409): ${respuestas.filter((r) => r.status === 409).length}`);
  console.log(`Otros códigos: ${respuestas.filter((r) => r.status !== 201 && r.status !== 409).length}`);
  console.log(duplicados.length === 0 ? "OK: ningún espacio asignado dos veces" : `ERROR: espacios duplicados ${duplicados}`);
  process.exit(duplicados.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
