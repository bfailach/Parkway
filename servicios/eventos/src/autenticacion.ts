import { createPublicKey, JsonWebKey, KeyObject } from "crypto";
import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

/**
 * Verificación de tokens en un servicio que NO los emite.
 *
 * El servicio de eventos no conoce ningún secreto: descarga la llave pública
 * del backend desde su JWKS (/.well-known/jwks.json) y verifica la firma
 * ES256 de cada token. Las llaves se guardan en memoria 5 minutos; si llega
 * un token con un "kid" desconocido (rotación de llaves) se vuelven a pedir.
 */
const JWKS_URL = () => process.env.JWKS_URL || "http://localhost:3000/.well-known/jwks.json";

let llaves = new Map<string, KeyObject>();
let cargadoEn = 0;

async function cargarLlaves() {
  const r = await fetch(JWKS_URL(), { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`JWKS respondió ${r.status}`);
  const { keys } = (await r.json()) as { keys: (JsonWebKey & { kid: string })[] };
  llaves = new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: "jwk" })]));
  cargadoEn = Date.now();
}

async function llave(kid: string | undefined): Promise<KeyObject | undefined> {
  if (!kid) return undefined;
  if (!llaves.has(kid) || Date.now() - cargadoEn > 300_000) await cargarLlaves();
  return llaves.get(kid);
}

export function requiereAdministrador() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Token no proporcionado" });
    const token = h.slice(7);
    try {
      const cabecera = jwt.decode(token, { complete: true })?.header;
      if (cabecera?.alg !== "ES256") return res.status(401).json({ error: "Se requiere un token ES256" });
      const k = await llave(cabecera.kid);
      if (!k) return res.status(401).json({ error: "Llave de firma desconocida" });
      const payload = jwt.verify(token, k, { algorithms: ["ES256"] }) as JwtPayload;
      if (payload.rol !== "ADMINISTRADOR") return res.status(403).json({ error: "No tiene permiso para esta operación" });
      return next();
    } catch (e) {
      if ((e as Error).name === "TokenExpiredError" || (e as Error).name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Token inválido o expirado" });
      }
      return res.status(503).json({ error: "No se pudo verificar el token (JWKS no disponible)" });
    }
  };
}
