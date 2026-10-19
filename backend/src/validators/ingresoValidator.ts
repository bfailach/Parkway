/**
 * Validaciones de los datos de entrada del registro de ingreso (RF06).
 * Son funciones puras: no consultan la base de datos, por lo cual se
 * prueban de forma unitaria (ver tests/validaciones.test.ts).
 *
 * Formatos de placa en Colombia:
 * - Automóvil:   tres letras y tres números (ABC123)
 * - Motocicleta: tres letras, dos números y una letra (ABC12D)
 * - Bicicleta:   no tiene placa oficial. Se usa un código interno de
 *                3 a 10 caracteres alfanuméricos (por ejemplo, el número
 *                de marco o del sticker entregado en portería).
 */
export const TIPOS_VEHICULO = { AUTOMOVIL: 1, MOTOCICLETA: 2, BICICLETA: 3 } as const;

export const FORMATO_PLACA: Record<number, { regex: RegExp; ejemplo: string }> = {
  [TIPOS_VEHICULO.AUTOMOVIL]: { regex: /^[A-Z]{3}\d{3}$/, ejemplo: "ABC123" },
  [TIPOS_VEHICULO.MOTOCICLETA]: { regex: /^[A-Z]{3}\d{2}[A-Z]$/, ejemplo: "ABC12D" },
  [TIPOS_VEHICULO.BICICLETA]: { regex: /^[A-Z0-9]{3,10}$/, ejemplo: "BIC0042" },
};

export interface DatosIngreso {
  placa: string;
  idTipo: number;
  idParqueadero: number;
  idEspacio?: number;
  marca?: string;
  color?: string;
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: Record<string, string>;
  datos?: DatosIngreso;
}

/** Quita espacios y guiones y pasa a mayúsculas: "abc-123 " -> "ABC123". */
export function normalizarPlaca(placa: unknown): string {
  return String(placa ?? "").toUpperCase().replace(/[\s-]/g, "");
}

function textoOpcional(valor: unknown, max: number): string | undefined | null {
  if (valor === undefined || valor === null || String(valor).trim() === "") return undefined;
  const t = String(valor).trim();
  return t.length > max ? null : t;
}

function enteroPositivo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function validarIngreso(body: Record<string, unknown>): ResultadoValidacion {
  const errores: Record<string, string> = {};

  const idParqueadero = enteroPositivo(body.idParqueadero);
  if (!idParqueadero) errores.idParqueadero = "Seleccione la sede";

  const idTipo = enteroPositivo(body.idTipo);
  if (!idTipo || !FORMATO_PLACA[idTipo]) errores.idTipo = "Seleccione un tipo de vehículo válido";

  const placa = normalizarPlaca(body.placa);
  if (!placa) {
    errores.placa = "La placa es obligatoria";
  } else if (idTipo && FORMATO_PLACA[idTipo] && !FORMATO_PLACA[idTipo].regex.test(placa)) {
    errores.placa = `Formato inválido. Ejemplo: ${FORMATO_PLACA[idTipo].ejemplo}`;
  }

  let idEspacio: number | undefined;
  if (body.idEspacio !== undefined && body.idEspacio !== null && body.idEspacio !== "") {
    const n = enteroPositivo(body.idEspacio);
    if (!n) errores.idEspacio = "Espacio inválido";
    else idEspacio = n;
  }

  const marca = textoOpcional(body.marca, 40);
  if (marca === null) errores.marca = "Máximo 40 caracteres";
  const color = textoOpcional(body.color, 20);
  if (color === null) errores.color = "Máximo 20 caracteres";

  if (Object.keys(errores).length > 0) return { valido: false, errores };

  return {
    valido: true,
    errores,
    datos: {
      placa,
      idTipo: idTipo as number,
      idParqueadero: idParqueadero as number,
      idEspacio,
      // Las bicicletas no llevan marca.
      marca: idTipo === TIPOS_VEHICULO.BICICLETA ? undefined : marca ?? undefined,
      color: color ?? undefined,
    },
  };
}
