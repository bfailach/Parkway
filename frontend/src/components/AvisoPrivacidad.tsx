import { useEffect, useState } from "react";
import { api, PoliticaDatos } from "../lib/api";

/**
 * Aviso de privacidad (Ley 1581 de 2012). Lo trae del servidor para que el
 * texto mostrado sea siempre el de la versión vigente de la política.
 */
export function AvisoPrivacidad() {
  const [p, setP] = useState<PoliticaDatos | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api.politicaDatos().then(setP).catch(() => setError(true));
  }, []);
  if (error) return <p className="aviso-texto">No se pudo cargar el aviso de privacidad. Intente de nuevo.</p>;
  if (!p) return <p className="aviso-texto">Cargando el aviso de privacidad...</p>;
  return (
    <div className="aviso-texto">
      <p><b>Responsable:</b> {p.responsable} Contacto: {p.contacto}.</p>
      <p><b>Datos que se recogen:</b> {p.datosQueSeRecogen.join(" ")} {p.datosSensibles}</p>
      <p><b>Finalidades:</b></p>
      <ul>
        {p.finalidades.map((f) => (
          <li key={f.codigo}>{f.obligatoria ? "Necesaria" : "Opcional"}: {f.descripcion}</li>
        ))}
      </ul>
      <p>{p.usoEstadistico}</p>
      <p><b>Sus derechos:</b></p>
      <ul>{p.derechos.map((d) => <li key={d}>{d}</li>)}</ul>
      <p>{p.plazos} Política versión {p.version}, vigente desde {p.vigenteDesde}.</p>
    </div>
  );
}
