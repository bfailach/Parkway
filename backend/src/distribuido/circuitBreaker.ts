/**
 * Interruptor de circuito (circuit breaker).
 *
 * Protege al backend de una dependencia caída (Redis o RabbitMQ):
 *  - CERRADO: las llamadas pasan. Si fallan `umbral` veces seguidas, se abre.
 *  - ABIERTO: las llamadas fallan de inmediato, sin esperar a la dependencia,
 *    durante `esperaMs`. El llamador usa su plan alterno.
 *  - SEMIABIERTO: pasado ese tiempo deja pasar una llamada de prueba. Si
 *    funciona, se cierra; si falla, vuelve a abrirse.
 *
 * Cada llamada tiene además un tiempo de espera máximo (`timeoutMs`), para
 * que una dependencia lenta no retenga la petición del usuario.
 */
export type EstadoCircuito = "CERRADO" | "ABIERTO" | "SEMIABIERTO";

export class CircuitoAbiertoError extends Error {
  constructor(nombre: string) {
    super(`Circuito ${nombre} abierto`);
  }
}

export class TiempoAgotadoError extends Error {
  constructor(nombre: string, ms: number) {
    super(`${nombre} no respondió en ${ms} ms`);
  }
}

export class CircuitBreaker {
  private fallos = 0;
  private abiertoDesde = 0;
  private _estado: EstadoCircuito = "CERRADO";

  constructor(
    readonly nombre: string,
    private readonly opciones: { umbral?: number; esperaMs?: number; timeoutMs?: number; alCambiar?: (e: EstadoCircuito) => void } = {}
  ) {}

  get estado(): EstadoCircuito {
    if (this._estado === "ABIERTO" && Date.now() - this.abiertoDesde >= (this.opciones.esperaMs ?? 10_000)) {
      this.cambiar("SEMIABIERTO");
    }
    return this._estado;
  }

  async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.estado === "ABIERTO") throw new CircuitoAbiertoError(this.nombre);
    const timeoutMs = this.opciones.timeoutMs ?? 1000;
    let temporizador: NodeJS.Timeout | undefined;
    try {
      const resultado = await Promise.race([
        fn(),
        new Promise<never>((_, rechazar) => {
          temporizador = setTimeout(() => rechazar(new TiempoAgotadoError(this.nombre, timeoutMs)), timeoutMs);
        }),
      ]);
      this.exito();
      return resultado;
    } catch (e) {
      this.fallo();
      throw e;
    } finally {
      clearTimeout(temporizador);
    }
  }

  exito() {
    this.fallos = 0;
    if (this._estado !== "CERRADO") this.cambiar("CERRADO");
  }

  fallo() {
    this.fallos += 1;
    if (this._estado === "SEMIABIERTO" || this.fallos >= (this.opciones.umbral ?? 3)) {
      this.abiertoDesde = Date.now();
      if (this._estado !== "ABIERTO") this.cambiar("ABIERTO");
    }
  }

  private cambiar(estado: EstadoCircuito) {
    this._estado = estado;
    this.opciones.alCambiar?.(estado);
  }
}
