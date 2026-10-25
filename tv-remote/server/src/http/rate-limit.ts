/**
 * Limitador de intentos en memoria.
 *
 * Se implementa a mano en vez de sumar @fastify/rate-limit: son unas pocas
 * decenas de lineas, y el proyecto ya resuelve asi el SSDP, el Wake-on-LAN, el
 * protobuf y los certificados.
 *
 * En memoria alcanza porque el servidor es un solo proceso en una casa. Si
 * alguna vez corriera replicado, esto habria que moverlo a un almacen
 * compartido: cada replica contaria por su cuenta.
 */
export type RateLimitResult = {
  allowed: boolean;
  /** Segundos que faltan para poder reintentar. Va en la cabecera Retry-After. */
  retryAfterSeconds: number;
  remaining: number;
};

type Ventana = { conteo: number; expiraEn: number };

export class RateLimiter {
  private readonly ventanas = new Map<string, Ventana>();
  private readonly limpieza: NodeJS.Timeout;

  constructor(
    private readonly maxIntentos: number,
    private readonly ventanaMs: number,
  ) {
    // Sin esto, una IP distinta por intento haria crecer el mapa sin limite.
    this.limpieza = setInterval(() => this.purgar(), Math.max(60_000, ventanaMs));
    this.limpieza.unref?.();
  }

  check(clave: string, ahora = Date.now()): RateLimitResult {
    const ventana = this.ventanas.get(clave);

    if (!ventana || ventana.expiraEn <= ahora) {
      this.ventanas.set(clave, { conteo: 1, expiraEn: ahora + this.ventanaMs });
      return { allowed: true, retryAfterSeconds: 0, remaining: this.maxIntentos - 1 };
    }

    if (ventana.conteo >= this.maxIntentos) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((ventana.expiraEn - ahora) / 1000),
        remaining: 0,
      };
    }

    ventana.conteo += 1;
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: this.maxIntentos - ventana.conteo,
    };
  }

  /** Borra el registro de una clave: se usa al acertar el PIN. */
  reset(clave: string): void {
    this.ventanas.delete(clave);
  }

  private purgar(ahora = Date.now()): void {
    for (const [clave, ventana] of this.ventanas) {
      if (ventana.expiraEn <= ahora) this.ventanas.delete(clave);
    }
  }

  stop(): void {
    clearInterval(this.limpieza);
  }
}
