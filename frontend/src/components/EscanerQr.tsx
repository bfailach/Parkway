import { useEffect, useRef, useState } from "react";
import { Dialogo } from "./Dialogo";

/**
 * Escáner del QR de entrada dentro de Parkway: el cliente no necesita salir
 * a la aplicación de cámara. Usa la cámara trasera del celular y lee el
 * código con BarcodeDetector (Chrome, Edge, Android) o, si el navegador no
 * lo tiene (Safari), con la librería jsQR. Si la cámara no está disponible,
 * se puede elegir una foto del código.
 *
 * Al leer un QR de Parkway abre la entrada con QR (#/qr/<token>); la firma
 * y la vigencia del código las verifica el servidor.
 */
type Detector = { detect: (fuente: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Saca el token del enlace del QR. Acepta el enlace completo o solo el token. */
export function tokenDelCodigo(texto: string): string | null {
  const enlace = texto.match(/#\/?qr\/([A-Za-z0-9_\-.]+)/);
  if (enlace) return enlace[1];
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(texto.trim()) ? texto.trim() : null;
}

async function crearDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formatos = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
    return formatos.includes("qr_code") ? new BD({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

async function leerConJsQr(lienzo: HTMLCanvasElement): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

export function EscanerQr({ className = "boton boton-primario" }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const flujo = useRef<MediaStream | null>(null);

  function detenerCamara() {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
  }

  function usar(texto: string) {
    const token = tokenDelCodigo(texto);
    if (!token) {
      setAviso("Ese código no es un QR de entrada de Parkway. Apunta al código de la portería.");
      return false;
    }
    detenerCamara();
    setAbierto(false);
    window.location.hash = `#/qr/${token}`;
    return true;
  }

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    let cuadro = 0;
    setError(null);
    setAviso(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no permite usar la cámara aquí. Puedes elegir una foto del código.");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!vivo) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        flujo.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
      } catch (e) {
        const nombre = (e as Error).name;
        setError(
          nombre === "NotAllowedError"
            ? "No diste permiso para usar la cámara. Actívalo en el navegador o elige una foto del código."
            : "No se encontró una cámara disponible. Puedes elegir una foto del código."
        );
        return;
      }
      const detector = await crearDetector();
      lienzo.current ??= document.createElement("canvas");
      let ultimo = 0;
      const ciclo = async (t: number) => {
        if (!vivo) return;
        const v = video.current;
        if (v && v.readyState >= 2 && t - ultimo > 250) {
          ultimo = t;
          try {
            let texto: string | null = null;
            if (detector) texto = (await detector.detect(v))[0]?.rawValue ?? null;
            else {
              const c = lienzo.current!;
              c.width = v.videoWidth;
              c.height = v.videoHeight;
              c.getContext("2d")?.drawImage(v, 0, 0);
              texto = await leerConJsQr(c);
            }
            if (texto && usar(texto)) return;
          } catch {
            /* cuadro ilegible: se intenta con el siguiente */
          }
        }
        cuadro = requestAnimationFrame(ciclo);
      };
      cuadro = requestAnimationFrame(ciclo);
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      detenerCamara();
    };
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  async function desdeFoto(archivo: File | undefined) {
    if (!archivo) return;
    setAviso(null);
    try {
      const bmp = await createImageBitmap(archivo);
      const c = document.createElement("canvas");
      const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      c.width = Math.round(bmp.width * escala);
      c.height = Math.round(bmp.height * escala);
      c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
      const texto = await leerConJsQr(c);
      if (!texto) setAviso("No se encontró un código QR en la foto. Intenta con una más cercana y nítida.");
      else usar(texto);
    } catch {
      setAviso("No se pudo leer la foto.");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierto(true)}>
        <svg className="icono-boton" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
          <rect x="7" y="7" width="4" height="4" />
          <rect x="13" y="13" width="4" height="4" />
          <path d="M13 7h4v2M7 15v2h2" />
        </svg>
        Escanear QR de entrada
      </button>
      <Dialogo
        abierto={abierto}
        titulo="Escanear QR de entrada"
        onCerrar={() => {
          detenerCamara();
          setAbierto(false);
        }}
      >
        <p className="campo-ayuda">Apunta la cámara al código QR que está en la portería de la sede.</p>
        {!error && (
          <div className="escaner-visor">
            <video ref={video} playsInline muted aria-label="Vista de la cámara" />
            <span className="escaner-marco" aria-hidden="true" />
          </div>
        )}
        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
        {aviso && <p className="alerta alerta-error" role="status">{aviso}</p>}
        <label className="boton boton-secundario escaner-foto">
          Elegir una foto del código
          <input type="file" accept="image/*" className="visualmente-oculto" onChange={(e) => desdeFoto(e.target.files?.[0])} />
        </label>
        <div className="dialogo-acciones">
          <button
            type="button"
            className="boton"
            onClick={() => {
              detenerCamara();
              setAbierto(false);
            }}
          >
            Cancelar
          </button>
        </div>
      </Dialogo>
    </>
  );
}
