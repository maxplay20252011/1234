/**
 * Codificacion protobuf minima para el mensaje CastMessage.
 *
 * Se implementa a mano en vez de sumar protobufjs al proyecto: el mensaje tiene
 * siete campos, todos de tipos basicos, y su definicion no cambia desde que
 * existe el protocolo. Son unas pocas decenas de lineas y quedan cubiertas por
 * tests, contra una dependencia entera que habria que mantener.
 *
 * Definicion original (cast_channel.proto):
 *
 *   1 protocol_version  varint   siempre 0 (CASTV2_1_0)
 *   2 source_id         string
 *   3 destination_id    string
 *   4 namespace         string
 *   5 payload_type      varint   0 = STRING, 1 = BINARY
 *   6 payload_utf8      string
 *   7 payload_binary    bytes
 */

import {
  ProtoWriter,
  encodeVarint,
  decodeVarint,
  readFields,
  WIRE_LENGTH_DELIMITED,
} from '../../protobuf/index.js';

export { encodeVarint, decodeVarint };

export type CastMessage = {
  sourceId: string;
  destinationId: string;
  namespace: string;
  payloadUtf8: string;
};

export function encodeCastMessage(msg: CastMessage): Buffer {
  return new ProtoWriter()
    .varint(1, 0) // protocol_version: CASTV2_1_0
    .string(2, msg.sourceId)
    .string(3, msg.destinationId)
    .string(4, msg.namespace)
    .varint(5, 0) // payload_type: STRING
    .string(6, msg.payloadUtf8)
    .build();
}

/**
 * Decodifica un CastMessage.
 *
 * Saltea los campos que no conocemos en vez de fallar: si alguna vez se agrega
 * uno nuevo al protocolo, esto lo ignora y sigue andando, que es justamente
 * como protobuf esta pensado para evolucionar.
 */
export function decodeCastMessage(buf: Buffer): CastMessage {
  const msg: CastMessage = { sourceId: '', destinationId: '', namespace: '', payloadUtf8: '' };

  for (const campo of readFields(buf)) {
    if (campo.wire !== WIRE_LENGTH_DELIMITED) continue;
    const texto = campo.value.toString('utf8');
    switch (campo.field) {
      case 2:
        msg.sourceId = texto;
        break;
      case 3:
        msg.destinationId = texto;
        break;
      case 4:
        msg.namespace = texto;
        break;
      case 6:
        msg.payloadUtf8 = texto;
        break;
      default:
        break;
    }
  }

  return msg;
}

/**
 * Enmarcado del canal: cada mensaje va precedido por su longitud en cuatro
 * bytes big-endian. Sin eso no hay forma de saber donde termina uno y empieza
 * el siguiente, porque TCP entrega un flujo continuo y no paquetes.
 */
export function frame(payload: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(payload.length);
  return Buffer.concat([largo, payload]);
}

/**
 * Extrae los mensajes completos que haya en el buffer acumulado.
 * Devuelve tambien el resto, porque un mensaje puede llegar partido en varias
 * entregas de TCP y hay que esperar a tenerlo entero.
 */
export function deframe(buffer: Buffer): { messages: Buffer[]; rest: Buffer<ArrayBufferLike> } {
  const messages: Buffer[] = [];
  let offset = 0;

  while (buffer.length - offset >= 4) {
    const largo = buffer.readUInt32BE(offset);
    if (buffer.length - offset - 4 < largo) break; // Todavia no llego entero.
    messages.push(buffer.subarray(offset + 4, offset + 4 + largo));
    offset += 4 + largo;
  }

  return { messages, rest: buffer.subarray(offset) };
}
