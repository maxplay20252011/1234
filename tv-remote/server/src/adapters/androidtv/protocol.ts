import { createHash } from 'node:crypto';
import { ProtoWriter, findField, readFields, WIRE_LENGTH_DELIMITED, WIRE_VARINT } from '../../protobuf/index.js';

/**
 * Protocolo androidtvremote2.
 *
 * ADVERTENCIA: es lo mas fragil de todo el proyecto. Google no publica este
 * protocolo; lo que hay es ingenieria inversa de la comunidad. Los numeros de
 * campo de abajo son los que usan las implementaciones conocidas, pero NO
 * estan verificados contra un aparato real desde aca.
 *
 * Si el emparejamiento falla, el sospechoso numero uno es `computePairingSecret`
 * y el numero dos son los numeros de campo de PairingMessage. Ambos estan
 * aislados a proposito para poder corregirlos sin tocar el resto.
 */

export const PAIRING_PORT = 6467;
export const REMOTE_PORT = 6466;

/** Estados que devuelve el televisor en el campo `status`. */
export const STATUS = {
  OK: 200,
  ERROR: 400,
  BAD_CONFIGURATION: 401,
  BAD_SECRET: 402,
} as const;

// ─── Emparejamiento ──────────────────────────────────────────────────────────

export function pairingRequest(serviceName: string, clientName: string): Buffer {
  return new ProtoWriter()
    .varint(1, 2) // protocol_version
    .varint(2, STATUS.OK)
    .message(10, new ProtoWriter().string(1, serviceName).string(2, clientName))
    .build();
}

/**
 * Declara como se va a codificar el codigo que muestra el televisor.
 * Tipo 3 = hexadecimal, y seis simbolos, que es el codigo de seis digitos.
 */
export function pairingOption(): Buffer {
  const encoding = new ProtoWriter().varint(1, 3).varint(2, 6);
  return new ProtoWriter()
    .varint(1, 2)
    .varint(2, STATUS.OK)
    .message(
      20,
      new ProtoWriter()
        .message(1, encoding) // input_encodings
        .varint(3, 1), // preferred_role: ROLE_TYPE_INPUT
    )
    .build();
}

export function pairingConfiguration(): Buffer {
  const encoding = new ProtoWriter().varint(1, 3).varint(2, 6);
  return new ProtoWriter()
    .varint(1, 2)
    .varint(2, STATUS.OK)
    .message(30, new ProtoWriter().message(1, encoding).varint(2, 1))
    .build();
}

export function pairingSecret(secret: Buffer): Buffer {
  return new ProtoWriter()
    .varint(1, 2)
    .varint(2, STATUS.OK)
    .message(40, new ProtoWriter().bytes(1, secret))
    .build();
}

export type PairingEvent = {
  status: number;
  /** Numero del submensaje que vino: 11 ack de request, 21 de option, etc. */
  kind?: number;
};

export function parsePairingMessage(buf: Buffer): PairingEvent {
  const campos = readFields(buf);
  const status = findField(campos, 2);

  const evento: PairingEvent = {
    status: status?.wire === WIRE_VARINT ? status.value : 0,
  };

  // El submensaje presente identifica en que paso del baile estamos.
  const submensaje = campos.find(
    (c) => c.wire === WIRE_LENGTH_DELIMITED && [11, 21, 31, 41].includes(c.field),
  );
  if (submensaje) evento.kind = submensaje.field;

  return evento;
}

/**
 * Calcula el secreto que prueba que el usuario leyo el codigo del televisor.
 *
 * ═══ ESTA ES LA FUNCION MAS PROBABLE DE ESTAR MAL ═══
 *
 * El codigo que aparece en pantalla son seis caracteres hexadecimales:
 *   - los dos primeros son una comprobacion (el primer byte del hash),
 *   - los cuatro restantes son un valor aleatorio que elige el televisor.
 *
 * El secreto es SHA-256 sobre, en este orden exacto: modulo del cliente,
 * exponente del cliente, modulo del servidor, exponente del servidor y el
 * valor aleatorio. El orden y el hecho de que los modulos vayan SIN el cero de
 * signo que agrega DER son los dos detalles que se prestan a error, y un solo
 * byte de diferencia hace que el televisor rechace el emparejamiento sin
 * explicar por que.
 *
 * Verificable empiricamente: si `checksumMatches` da false con un codigo bien
 * tipeado, el calculo esta mal. Si da true y aun asi el televisor rechaza, el
 * problema esta en otra parte.
 */
export function computePairingSecret(
  code: string,
  client: { modulus: Buffer; exponent: Buffer },
  server: { modulus: Buffer; exponent: Buffer },
): { secret: Buffer; checksumMatches: boolean } {
  const limpio = code.trim().toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(limpio)) {
    throw new Error('El codigo tiene que ser de seis caracteres hexadecimales');
  }

  const comprobacion = Buffer.from(limpio.slice(0, 2), 'hex');
  const aleatorio = Buffer.from(limpio.slice(2), 'hex');

  const hash = createHash('sha256');
  hash.update(client.modulus);
  hash.update(client.exponent);
  hash.update(server.modulus);
  hash.update(server.exponent);
  hash.update(aleatorio);
  const secret = hash.digest();

  return { secret, checksumMatches: secret[0] === comprobacion[0] };
}

// ─── Control remoto ──────────────────────────────────────────────────────────

/** Direccion de la pulsacion. 3 = corta, que es lo que se usa siempre. */
export const DIRECTION_SHORT = 3;

export function remoteConfigure(modelo: string, vendor: string): Buffer {
  const deviceInfo = new ProtoWriter()
    .string(1, modelo)
    .string(2, vendor)
    .varint(3, 1) // unknown1
    .string(4, '1') // unknown2
    .string(5, 'tv-remote');
  return new ProtoWriter()
    .message(1, new ProtoWriter().varint(1, 1).message(2, deviceInfo))
    .build();
}

export function remoteSetActive(activo = 622): Buffer {
  return new ProtoWriter().message(2, new ProtoWriter().varint(1, activo)).build();
}

export function remoteKeyInject(keyCode: number, direction = DIRECTION_SHORT): Buffer {
  return new ProtoWriter()
    .message(10, new ProtoWriter().varint(1, keyCode).varint(2, direction))
    .build();
}

export function remotePingResponse(val1: number): Buffer {
  return new ProtoWriter().message(9, new ProtoWriter().varint(1, val1)).build();
}

export type RemoteEvent =
  | { kind: 'configure' }
  | { kind: 'setActive' }
  | { kind: 'ping'; val1: number }
  | { kind: 'error'; detalle: string }
  | { kind: 'other'; field: number };

export function parseRemoteMessage(buf: Buffer): RemoteEvent | null {
  const campos = readFields(buf);
  const primero = campos.find((c) => c.wire === WIRE_LENGTH_DELIMITED);
  if (!primero) return null;

  switch (primero.field) {
    case 1:
      return { kind: 'configure' };
    case 2:
      return { kind: 'setActive' };
    case 3:
      return { kind: 'error', detalle: primero.value.toString('utf8').replace(/[^\x20-\x7e]/g, ' ').trim() };
    case 8: {
      // El televisor pinguea; hay que devolverle el mismo valor o corta.
      const interno = findField(readFields(primero.value), 1);
      return { kind: 'ping', val1: interno?.wire === WIRE_VARINT ? interno.value : 1 };
    }
    default:
      return { kind: 'other', field: primero.field };
  }
}
