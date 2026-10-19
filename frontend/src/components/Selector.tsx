import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";

/**
 * Lista de selección propia. Reemplaza al <select> nativo porque el
 * navegador decide si la lista nativa se abre hacia arriba o hacia abajo
 * según el espacio en pantalla; esta siempre se abre hacia abajo.
 *
 * Teclado: flechas para moverse, Enter o espacio para elegir, Escape para
 * cerrar, Inicio y Fin, y escribir una letra salta a la opción que empieza
 * por ella.
 */
export interface OpcionSelector {
  valor: string;
  texto: string;
}

interface Props {
  valor: string;
  opciones: OpcionSelector[];
  onChange: (valor: string) => void;
  id?: string;
  etiqueta?: string;
  disabled?: boolean;
  invalido?: boolean;
  className?: string;
}

export function Selector({ valor, opciones, onChange, id, etiqueta, disabled, invalido, className }: Props) {
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  const indiceActual = Math.max(0, opciones.findIndex((o) => o.valor === valor));
  const actual = opciones.find((o) => o.valor === valor) ?? opciones[0];

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // Mantiene visible la opción activa.
  useEffect(() => {
    if (!abierto || !lista.current) return;
    const el = lista.current.children[activo] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [abierto, activo]);

  function abrir() {
    if (disabled) return;
    setActivo(indiceActual);
    setAbierto(true);
  }

  function elegir(i: number) {
    const o = opciones[i];
    if (o) onChange(o.valor);
    setAbierto(false);
    boton.current?.focus();
  }

  function teclado(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const n = opciones.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!abierto) abrir();
        else setActivo((a) => Math.min(n - 1, a + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!abierto) abrir();
        else setActivo((a) => Math.max(0, a - 1));
        break;
      case "Home":
        if (abierto) { e.preventDefault(); setActivo(0); }
        break;
      case "End":
        if (abierto) { e.preventDefault(); setActivo(n - 1); }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (abierto) elegir(activo);
        else abrir();
        break;
      case "Escape":
        if (abierto) { e.preventDefault(); setAbierto(false); }
        break;
      case "Tab":
        setAbierto(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const letra = e.key.toLowerCase();
          const desde = abierto ? activo + 1 : indiceActual + 1;
          const orden = [...opciones.slice(desde), ...opciones.slice(0, desde)];
          const encontrada = orden.find((o) => o.texto.toLowerCase().startsWith(letra));
          if (encontrada) {
            const i = opciones.indexOf(encontrada);
            if (abierto) setActivo(i);
            else onChange(encontrada.valor);
          }
        }
    }
  }

  return (
    <div ref={raiz} className={`selector ${abierto ? "abierto" : ""} ${className ?? ""}`}>
      <button
        ref={boton}
        id={id}
        type="button"
        className="selector-boton"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-label={etiqueta}
        aria-invalid={invalido || undefined}
        aria-activedescendant={abierto ? `${idLista}-${activo}` : undefined}
        disabled={disabled}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={teclado}
      >
        <span className="selector-texto">{actual?.texto ?? ""}</span>
        <span className="selector-flecha" aria-hidden="true" />
      </button>
      {abierto && (
        <ul ref={lista} id={idLista} className="selector-lista" role="listbox" aria-label={etiqueta}>
          {opciones.map((o, i) => (
            <li
              key={o.valor}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={o.valor === valor}
              className={`selector-opcion ${i === activo ? "activa" : ""}`}
              onMouseEnter={() => setActivo(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(i)}
            >
              {o.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
