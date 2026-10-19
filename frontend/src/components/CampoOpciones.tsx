import { useState } from "react";

/**
 * Lista de selección con la opción "Otro" al final. Al elegir "Otro"
 * aparece un campo de texto para escribir el valor.
 * El valor que recibe el formulario es siempre el texto final.
 * Para limpiarlo después de guardar, el formulario le cambia la `key`.
 */
const OTRO = "__otro__";

interface Props {
  rotulo: string;
  opciones: string[];
  valor: string;
  onChange: (valor: string) => void;
  maxLength: number;
  error?: string;
}

export function CampoOpciones({ rotulo, opciones, valor, onChange, maxLength, error }: Props) {
  const enLista = opciones.includes(valor);
  const [otro, setOtro] = useState(!enLista && valor !== "");
  const seleccion = otro ? OTRO : enLista ? valor : "";

  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={`sel-${rotulo}`}>
        {rotulo} <span className="opcional">(opcional)</span>
      </label>
      <select
        id={`sel-${rotulo}`}
        value={seleccion}
        aria-invalid={!!error}
        onChange={(e) => {
          if (e.target.value === OTRO) {
            setOtro(true);
            onChange("");
          } else {
            setOtro(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Sin especificar</option>
        {opciones.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={OTRO}>Otro</option>
      </select>
      {otro && (
        <input
          className="campo-otro"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={`Escriba ${rotulo.toLowerCase() === "marca" ? "la marca" : "el color"}`}
          aria-label={`${rotulo}: otro`}
          autoFocus
        />
      )}
      {error && <span className="campo-error">{error}</span>}
    </div>
  );
}

export const MARCAS: Record<number, string[]> = {
  1: ["Chevrolet", "Renault", "Mazda", "Kia", "Toyota", "Nissan", "Hyundai", "Volkswagen", "Ford", "Suzuki"],
  2: ["Yamaha", "Honda", "Suzuki", "Bajaj", "AKT", "Kawasaki", "KTM", "TVS", "Hero", "Victory"],
};

export const COLORES = ["Blanco", "Gris", "Plata", "Negro", "Rojo", "Azul", "Verde", "Amarillo", "Naranja", "Café", "Beige", "Vinotinto"];
