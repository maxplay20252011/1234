/**
 * Utilidades minimas de protobuf, compartidas por castv2 y androidtvremote2.
 *
 * Se escriben a mano en vez de sumar protobufjs: los mensajes que usamos tienen
 * campos de tipos basicos y sus definiciones no cambian. Es codigo acotado y con
 * tests, contra una dependencia entera que habria que mantener.
 */

export const WIRE_VARINT = 0;
export const WIRE_LENGTH_DELIMITED = 2;

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

export function tag(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType);
}

/** Construye un mensaje campo por campo. Omite lo que no se setea. */
export class ProtoWriter {
  private readonly partes: Buffer[] = [];

  varint(fieldNumber: number, value: number | undefined): this {
    if (value === undefined) return this;
    this.partes.push(tag(fieldNumber, WIRE_VARINT), encodeVarint(value));
    return this;
  }

  string(fieldNumber: number, value: string | undefined): this {
    if (value === undefined) return this;
    return this.bytes(fieldNumber, Buffer.from(value, 'utf8'));
  }

  bytes(fieldNumber: number, value: Buffer | undefined): this {
    if (value === undefined) return this;
    this.partes.push(tag(fieldNumber, WIRE_LENGTH_DELIMITED), encodeVarint(value.length), value);
    return this;
  }

  /** Anida otro mensaje. Un mensaje es solo bytes con longitud. */
  message(fieldNumber: number, value: ProtoWriter | Buffer | undefined): this {
    if (value === undefined) return this;
    return this.bytes(fieldNumber, value instanceof ProtoWriter ? value.build() : value);
  }

  build(): Buffer {
    return Buffer.concat(this.partes);
  }
}

export type ProtoField =
  | { field: number; wire: typeof WIRE_VARINT; value: number }
  | { field: number; wire: typeof WIRE_LENGTH_DELIMITED; value: Buffer };

/**
 * Recorre los campos de un mensaje.
 *
 * Los tipos de campo que no manejamos (fixed32, fixed64) se saltean en vez de
 * hacer fallar todo: asi un campo nuevo agregado al protocolo no rompe nada,
 * que es como protobuf esta pensado para evolucionar.
 */
export function readFields(buf: Buffer): ProtoField[] {
  const campos: ProtoField[] = [];
  let offset = 0;

  while (offset < buf.length) {
    const t = decodeVarint(buf, offset);
    offset += t.bytesRead;
    const field = t.value >>> 3;
    const wire = t.value & 0x07;

    if (wire === WIRE_VARINT) {
      const v = decodeVarint(buf, offset);
      offset += v.bytesRead;
      campos.push({ field, wire: WIRE_VARINT, value: v.value });
      continue;
    }

    if (wire === WIRE_LENGTH_DELIMITED) {
      const largo = decodeVarint(buf, offset);
      offset += largo.bytesRead;
      campos.push({
        field,
        wire: WIRE_LENGTH_DELIMITED,
        value: buf.subarray(offset, offset + largo.value),
      });
      offset += largo.value;
      continue;
    }

    if (wire === 5) {
      offset += 4; // fixed32
      continue;
    }
    if (wire === 1) {
      offset += 8; // fixed64
      continue;
    }
    throw new Error(`Tipo de campo protobuf no soportado: ${wire}`);
  }

  return campos;
}

/** Primer campo con ese numero, o undefined. */
export function findField(campos: ProtoField[], field: number): ProtoField | undefined {
  return campos.find((c) => c.field === field);
}

// ─── Enmarcado ───────────────────────────────────────────────────────────────

/**
 * Enmarcado con longitud como varint.
 *
 * OJO: es distinto del de castv2, que usa cuatro bytes big-endian.
 * androidtvremote2 usa varint. Confundirlos desincroniza el flujo entero y los
 * mensajes salen ilegibles a partir del primero.
 */
export function frameVarint(payload: Buffer): Buffer {
  return Buffer.concat([encodeVarint(payload.length), payload]);
}

export function deframeVarint(buffer: Buffer): { messages: Buffer[]; rest: Buffer } {
  const messages: Buffer[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    let largo;
    try {
      largo = decodeVarint(buffer, offset);
    } catch {
      break; // La cabecera de longitud todavia no llego entera.
    }
    const inicio = offset + largo.bytesRead;
    if (buffer.length - inicio < largo.value) break; // Falta cuerpo.
    messages.push(buffer.subarray(inicio, inicio + largo.value));
    offset = inicio + largo.value;
  }

  return { messages, rest: buffer.subarray(offset) };
}
