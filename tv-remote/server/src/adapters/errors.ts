/**
 * Errores del dominio del control.
 *
 * Todos llevan un `userMessage` en castellano listo para mostrar tal cual. La
 * regla del proyecto es que la interfaz nunca muestre un "Error" pelado: si el
 * televisor no contesta hay que decir eso, para que la persona sepa que hacer.
 */
export class ControlError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly code: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Marcador explicito de lo que todavia no se implemento. Nunca se simula. */
export class NotImplementedError extends ControlError {
  constructor(what: string) {
    super(
      `No implementado: ${what}`,
      `Esta funcion todavia no esta disponible para este dispositivo.`,
      'not_implemented',
      501,
    );
  }
}

export class NotSupportedError extends ControlError {
  constructor(what: string, brand: string) {
    super(
      `${brand} no soporta ${what}`,
      `Este dispositivo no permite ${what}.`,
      'not_supported',
      400,
    );
  }
}

export class NotPairedError extends ControlError {
  constructor() {
    super(
      'El dispositivo no esta emparejado',
      'Todavia no emparejaste este televisor. Toca "Emparejar" y acepta el aviso en la pantalla del TV.',
      'not_paired',
      409,
    );
  }
}

export class DeviceOfflineError extends ControlError {
  constructor(ip: string) {
    super(
      `El dispositivo en ${ip} no responde`,
      'El televisor no respondio. Esta encendido y conectado a la red?',
      'device_offline',
      503,
    );
  }
}

export class PairingRejectedError extends ControlError {
  constructor() {
    super(
      'El emparejamiento fue rechazado',
      'El televisor rechazo la conexion. Si te aparecio un aviso y lo cancelaste, entra a Configuracion > General > Administrador de dispositivos externos en el TV y borra la lista de dispositivos.',
      'pairing_rejected',
      403,
    );
  }
}
