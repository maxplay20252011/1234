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

export type CastMessage = {
  sourceId: string;
  destinationId: string;
  namespace: string;
  payloadUtf8: string;
};

const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;

export function encodeVarint(value: number): Buffer {
  // Siete bits utiles por byte; el octavo indica que sigue otro byte.
  const bytes: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v > 0) byte |= 0x80;
    bytes.push(byte);
  } while (v > 0);
  return Buffer.from(bytes);
}

export function decodeVarint(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let leidos = 0;

  for (;;) {
    if (offset + leidos >= buf.length) throw new Error('Varint incompleto');
    const byte = buf[offset + leidos] as number;
    leidos += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new Error('Varint demasiado largo');
  }
  return { value, bytesRead: leidos };
}

function tag(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function stringField(fieldNumber: number, text: string): Buffer {
  const datos = Buffer.from(text, 'utf8');
  return Buffer.concat([tag(fieldNumber, WIRE_LENGTH_DELIMITED), encodeVarint(datos.length), datos]);
}

function varintField(fieldNumber: number, value: number): Buffer {
  return Buffer.concat([tag(fieldNumber, WIRE_VARINT), encodeVarint(value)]);
}

export function encodeCastMessage(msg: CastMessage): Buffer {
  return Buffer.concat([
    varintField(1, 0), // protocol_version: CASTV2_1_0
    stringField(2, msg.sourceId),
    stringField(3, msg.destinationId),
    stringField(4, msg.namespace),
    varintField(5, 0), // payload_type: STRING
    stringField(6, msg.payloadUtf8),
  ]);
}

/**
 * Decodifica un CastMessage.
 *
 * Saltea los campos que no conocemos en vez de fallar: si alguna vez se agrega
 * uno nuevo al protocolo, esto lo ignora y sigue andando, que es justamente
 * como protobuf esta pensado para evolucionar.
 */
export function decodeCastMessage(buf: Buffer): CastMessage {
  let offset = 0;
  const msg: CastMessage = { sourceId: '', destinationId: '', namespace: '', payloadUtf8: '' };

  while (offset < buf.length) {
    const t = decodeVarint(buf, offset);
    offset += t.bytesRead;
    const fieldNumber = t.value >>> 3;
    const wireType = t.value & 0x07;

    if (wireType === WIRE_VARINT) {
      offset += decodeVarint(buf, offset).bytesRead;
      continue;
    }

    if (wireType === WIRE_LENGTH_DELIMITED) {
      const largo = decodeVarint(buf, offset);
      offset += largo.bytesRead;
      const contenido = buf.subarray(offset, offset + largo.value);
      offset += largo.value;

      switch (fieldNumber) {
        case 2:
          msg.sourceId = contenido.toString('utf8');
          break;
        case 3:
          msg.destinationId = contenido.toString('utf8');
          break;
        case 4:
          msg.namespace = contenido.toString('utf8');
          break;
        case 6:
          msg.payloadUtf8 = contenido.toString('utf8');
          break;
        default:
          break;
      }
      continue;
    }

    throw new Error(`Tipo de campo protobuf no soportado: ${wireType}`);
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
