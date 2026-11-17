import { createHash, createPrivateKey, createPublicKey, KeyObject } from "crypto";
import fs from "fs";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

/**
 * Firma de tokens para varios nodos (JWT ES256 + JWKS).
 *
 * Con un secreto compartido (HS256) cada servicio que verifica un token
 * también podría emitirlo, y el secreto tendría que copiarse a todos. Con
 * ES256 (ECDSA P-256) solo el emisor tiene la llave privada; los demás
 * servicios verifican con la llave pública que se publica en
 * /.well-known/jwks.json, identificada por su "kid".
 *
 * Variables:
 *   JWT_PRIVATE_KEY_FILE  ruta del PEM privado (Docker secret), o
 *   JWT_PRIVATE_KEY       el PEM en una variable (\n escapados admitidos).
 * Sin llave configurada se usa HS256 con JWT_SECRET, como en el despliegue
 * de un solo nodo.
 */
let cargada = false;
let privada: KeyObject | null = null;
let publica: KeyObject | null = null;
let kid = "";

function leerPem(): string | null {
  const archivo = process.env.JWT_PRIVATE_KEY_FILE;
  if (archivo && fs.existsSync(archivo)) return fs.readFileSync(archivo, "utf8");
  const texto = process.env.JWT_PRIVATE_KEY;
  return texto ? texto.replace(/\\n/g, "\n") : null;
}

function cargar() {
  if (cargada) return;
  cargada = true;
  const pem = leerPem();
  if (!pem) return;
  privada = createPrivateKey(pem);
  publica = createPublicKey(privada);
  const jwk = publica.export({ format: "jwk" }) as { crv: string; kty: string; x: string; y: string };
  // Huella de la llave según RFC 7638: identifica la llave sin revelar nada.
  const canonica = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  kid = createHash("sha256").update(canonica).digest("base64url").slice(0, 16);
}

export function usaFirmaAsimetrica() {
  cargar();
  return privada !== null;
}

export function firmarToken(payload: object, secreto: string, expiresIn: SignOptions["expiresIn"]): string {
  cargar();
  if (privada) return jwt.sign(payload, privada, { algorithm: "ES256", keyid: kid, expiresIn });
  return jwt.sign(payload, secreto, { algorithm: "HS256", expiresIn });
}

/** Verifica un token ES256 (con la llave pública) o HS256 (con el secreto). Lanza si no es válido. */
export function verificarToken(token: string, secreto: string): JwtPayload {
  cargar();
  const cabecera = jwt.decode(token, { complete: true })?.header;
  if (cabecera?.alg === "ES256") {
    if (!publica || cabecera.kid !== kid) throw new Error("Llave de firma desconocida");
    return jwt.verify(token, publica, { algorithms: ["ES256"] }) as JwtPayload;
  }
  // Se fija el algoritmo para evitar ataques de confusión de algoritmos.
  return jwt.verify(token, secreto, { algorithms: ["HS256"] }) as JwtPayload;
}

/** Documento JWKS (RFC 7517) con la llave pública vigente. */
export function jwks() {
  cargar();
  if (!publica) return { keys: [] };
  return { keys: [{ ...(publica.export({ format: "jwk" }) as object), kid, alg: "ES256", use: "sig" }] };
}
