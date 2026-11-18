import "./entorno";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cerrar, fallaCon, reiniciarBase, uno } from "./base";
import * as auth from "../../src/services/authService";
import { usarLlavesDePrueba } from "../../src/services/googleService";

/**
 * Inicio de sesión con Google. Las llaves de Google se reemplazan por un par
 * RSA propio: el token se firma como lo haría Google y el servidor lo
 * verifica con la misma lógica (firma, emisor, audiencia, vencimiento).
 */
const CLIENT_ID = "parkway-pruebas.apps.googleusercontent.com";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const otra = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

function credencial(datos: Record<string, unknown>, opciones: { llave?: crypto.KeyObject; aud?: string; iss?: string; vence?: number } = {}) {
  return jwt.sign(
    { email_verified: true, ...datos },
    opciones.llave ?? privateKey,
    { algorithm: "RS256", keyid: "k1", audience: opciones.aud ?? CLIENT_ID, issuer: opciones.iss ?? "https://accounts.google.com", expiresIn: opciones.vence ?? 300 }
  );
}

before(async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  usarLlavesDePrueba(new Map([["k1", publicKey]]));
  await reiniciarBase();
});
after(async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  await cerrar();
});

describe("inicio de sesión con Google", () => {
  test("una cuenta existente entra con su rol y queda vinculada", async () => {
    const r = await auth.ingresarConGoogle({ credencial: credencial({ sub: "g-admin", email: "ADMIN@parkway.test", name: "Admin" }) });
    assert.equal(r.usuario.rol, "ADMINISTRADOR");
    const u = await uno<{ google_sub: string }>(`SELECT google_sub FROM usuario WHERE correo = 'admin@parkway.test'`);
    assert.equal(u.google_sub, "g-admin");
    // Otra cuenta de Google con el mismo correo no puede entrar.
    await fallaCon(auth.ingresarConGoogle({ credencial: credencial({ sub: "g-otro", email: "admin@parkway.test" }) }), 401);
  });

  test("una cuenta nueva pide la autorización de datos y luego se crea como cliente", async () => {
    const c = credencial({ sub: "g-nuevo", email: "nueva@gmail.com", name: "Ana Nueva" });
    await fallaCon(auth.ingresarConGoogle({ credencial: c }), 409);
    const r = await auth.ingresarConGoogle({ credencial: c, aceptaTratamiento: true, aceptaComunicaciones: true });
    assert.deepEqual([r.usuario.rol, r.usuario.nombre, r.usuario.correo], ["CLIENTE", "Ana Nueva", "nueva@gmail.com"]);
    const autorizaciones = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM consentimiento_datos WHERE id_usuario = $1 AND otorgado`,
      [r.usuario.id_usuario]
    );
    assert.equal(autorizaciones.n, 2);
    // La segunda vez entra directo, sin pedir de nuevo la autorización.
    const otra = await auth.ingresarConGoogle({ credencial: c });
    assert.equal(otra.usuario.id_usuario, r.usuario.id_usuario);
    // La cuenta creada con Google no tiene una contraseña con la que se pueda entrar.
    await fallaCon(auth.iniciarSesion("nueva@gmail.com", ""), 400);
  });

  test("rechaza tokens que no firmó Google, de otra app, vencidos o sin correo verificado", async () => {
    const base = { sub: "g-x", email: "x@gmail.com" };
    await fallaCon(auth.ingresarConGoogle({ credencial: credencial(base, { llave: otra.privateKey }) }), 401);
    await fallaCon(auth.ingresarConGoogle({ credencial: credencial(base, { aud: "otra-app.apps.googleusercontent.com" }) }), 401);
    await fallaCon(auth.ingresarConGoogle({ credencial: credencial(base, { iss: "https://evil.example" }) }), 401);
    await fallaCon(auth.ingresarConGoogle({ credencial: credencial(base, { vence: -10 }) }), 401);
    await fallaCon(auth.ingresarConGoogle({ credencial: credencial({ ...base, email_verified: false }) }), 401);
    await fallaCon(auth.ingresarConGoogle({ credencial: "no-es-un-token" }), 400);
  });

  test("sin GOOGLE_CLIENT_ID el inicio con Google está apagado", async () => {
    const id = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    assert.equal(auth.configuracionGoogle().clientId, null);
    await fallaCon(auth.ingresarConGoogle({ credencial: credencial({ sub: "g", email: "g@gmail.com" }) }), 404);
    process.env.GOOGLE_CLIENT_ID = id;
  });
});
