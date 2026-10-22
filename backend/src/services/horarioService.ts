import * as horarioRepository from "../repositories/horarioRepository";

/**
 * Horarios de atención de las sedes.
 *
 * Los horarios se guardan por día de la semana (ISO: 1 = lunes, 7 =
 * domingo) con la hora de apertura y de cierre. Un día sin horario es un
 * día cerrado. Un cierre a las 24:00 seguido de una apertura a las 00:00
 * del día siguiente es atención continua.
 *
 * Las funciones de cálculo son puras (reciben el día y el minuto local)
 * para poder probarlas sin base de datos (tests/horario.test.ts).
 */
export interface Horario {
  dia: number;
  /** "HH:MM" */
  abre: string;
  /** "HH:MM", hasta "24:00" */
  cierra: string;
}

export const ZONA_HORARIA = process.env.ZONA_HORARIA || "America/Bogota";

export const NOMBRE_DIA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** "06:30" o "06:30:00" -> 390 */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 390 -> "6:30" */
export function aTexto(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = minutos % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Día ISO (1 = lunes) y minuto del día en la zona horaria del negocio. */
export function ahoraLocal(fecha = new Date(), zona = ZONA_HORARIA): { dia: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const valor = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { dia: dias[valor("weekday")], minuto: Number(valor("hour")) * 60 + Number(valor("minute")) };
}

const delDia = (horarios: Horario[], dia: number) => horarios.find((h) => h.dia === dia);
const siguiente = (dia: number, n = 1) => ((dia - 1 + n) % 7) + 1;

export interface EstadoHorario {
  abierto: boolean;
  /** Minutos que faltan para el cierre (null si está cerrada o es 24/7). */
  minutosParaCerrar: number | null;
  /** Texto para mostrar: "Abierta hasta las 22:00", "Abre mañana a las 6:00". */
  mensaje: string;
}

/**
 * Estado de la sede en un momento dado. Si el horario sigue sin cortes
 * después de la medianoche, el cierre se busca en los días siguientes.
 */
export function estadoEn(horarios: Horario[], dia: number, minuto: number): EstadoHorario {
  const hoy = delDia(horarios, dia);
  const abierto = !!hoy && minuto >= aMinutos(hoy.abre) && minuto < aMinutos(hoy.cierra);

  if (abierto) {
    let restante = aMinutos(hoy!.cierra) - minuto;
    let d = dia;
    let cierre = aMinutos(hoy!.cierra);
    for (let i = 0; i < 7 && cierre === 1440; i++) {
      d = siguiente(d);
      const h = delDia(horarios, d);
      if (!h || aMinutos(h.abre) !== 0) break;
      cierre = aMinutos(h.cierra);
      restante += cierre;
    }
    if (restante >= 7 * 1440) return { abierto: true, minutosParaCerrar: null, mensaje: "Abierta las 24 horas" };
    // Minuto del cierre contado desde el inicio de hoy.
    const fin = minuto + restante;
    const medianoche = fin % 1440 === 0;
    const diasDespues = medianoche ? fin / 1440 - 1 : Math.floor(fin / 1440);
    const cuando = diasDespues === 0 ? "" : diasDespues === 1 ? " de mañana" : ` del ${NOMBRE_DIA[siguiente(dia, diasDespues)]}`;
    return {
      abierto: true,
      minutosParaCerrar: restante,
      mensaje: medianoche ? `Abierta hasta la medianoche${cuando}` : `Abierta hasta las ${aTexto(fin % 1440)}${cuando}`,
    };
  }

  // Cerrada: buscar la próxima apertura, hoy más tarde o en los próximos días.
  if (hoy && minuto < aMinutos(hoy.abre)) {
    return { abierto: false, minutosParaCerrar: null, mensaje: `Cerrada. Abre hoy a las ${aTexto(aMinutos(hoy.abre))}` };
  }
  for (let n = 1; n <= 7; n++) {
    const d = siguiente(dia, n);
    const h = delDia(horarios, d);
    if (h) {
      const cuando = n === 1 ? "mañana" : `el ${NOMBRE_DIA[d]}`;
      return { abierto: false, minutosParaCerrar: null, mensaje: `Cerrada. Abre ${cuando} a las ${aTexto(aMinutos(h.abre))}` };
    }
  }
  return { abierto: false, minutosParaCerrar: null, mensaje: "Cerrada. No tiene horario de atención" };
}

/**
 * Una reserva solo se puede hacer con la sede abierta y si el plazo para
 * llegar termina antes del cierre. Devuelve el motivo si no se puede.
 */
export function motivoParaNoReservar(horarios: Horario[], dia: number, minuto: number, minutosReserva: number): string | null {
  const e = estadoEn(horarios, dia, minuto);
  if (!e.abierto) return `No se puede reservar: la sede está cerrada. ${e.mensaje.replace("Cerrada. ", "")}.`;
  if (e.minutosParaCerrar !== null && e.minutosParaCerrar < minutosReserva) {
    return `No se puede reservar: la sede cierra en ${e.minutosParaCerrar} minutos y la reserva dura ${minutosReserva}.`;
  }
  return null;
}

export async function horariosDe(idParqueadero: number): Promise<Horario[]> {
  return horarioRepository.listar(idParqueadero);
}

export async function estadoActual(idParqueadero: number) {
  const horarios = await horariosDe(idParqueadero);
  const { dia, minuto } = ahoraLocal();
  return { ...estadoEn(horarios, dia, minuto), horarios };
}
