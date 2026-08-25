/**
 * Constructores minimos de DER (ASN.1).
 *
 * Hacen falta para generar el certificado de cliente que exige
 * androidtvremote2. Node no tiene API para crear certificados, y la
 * alternativa era sumar node-forge (una dependencia grande) o exigir openssl
 * instalado (que en Windows normalmente no esta).
 *
 * Es codigo acotado y verificable: el certificado resultante se vuelve a
 * parsear con crypto.X509Certificate en los tests, asi que si estuviera mal
 * construido no pasaria.
 */

export const TAG = {
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x30,
  SET: 0x31,
  UTC_TIME: 0x17,
} as const;

/**
 * Longitud en formato DER.
 * Hasta 127 va en un byte; por encima, un byte que dice cuantos bytes de
 * longitud siguen, y despues la longitud en big-endian.
 */
export function encodeLength(largo: number): Buffer {
  if (largo < 0x80) return Buffer.from([largo]);

  const bytes: number[] = [];
  let n = largo;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number, contenido: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(contenido.length), contenido]);
}

export function sequence(...partes: Buffer[]): Buffer {
  return tlv(TAG.SEQUENCE, Buffer.concat(partes));
}

export function set(...partes: Buffer[]): Buffer {
  return tlv(TAG.SET, Buffer.concat(partes));
}

/** Etiqueta de contexto explicita, del tipo [0] o [3]. */
export function contextExplicit(numero: number, contenido: Buffer): Buffer {
  return tlv(0xa0 | numero, contenido);
}

/**
 * INTEGER de DER.
 * Si el byte mas alto tiene el bit de signo prendido hay que anteponer 0x00,
 * porque DER interpreta los enteros como con signo.
 */
export function integer(valor: Buffer | number): Buffer {
  let bytes: Buffer;
  if (typeof valor === 'number') {
    if (valor === 0) return tlv(TAG.INTEGER, Buffer.from([0]));
    const lista: number[] = [];
    let n = valor;
    while (n > 0) {
      lista.unshift(n & 0xff);
      n >>>= 8;
    }
    bytes = Buffer.from(lista);
  } else {
    bytes = valor;
    // Quitar ceros a la izquierda que no aportan.
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0x00) i++;
    bytes = bytes.subarray(i);
  }

  if ((bytes[0] as number) & 0x80) bytes = Buffer.concat([Buffer.from([0x00]), bytes]);
  return tlv(TAG.INTEGER, bytes);
}

/**
 * Identificador de objeto.
 * Los dos primeros componentes se combinan en un byte (40*a + b) y el resto va
 * en base 128 con el bit alto como continuacion.
 */
export function oid(texto: string): Buffer {
  const partes = texto.split('.').map(Number);
  if (partes.length < 2) throw new Error(`OID invalido: ${texto}`);

  const bytes: number[] = [40 * (partes[0] as number) + (partes[1] as number)];
  for (const componente of partes.slice(2)) {
    const grupo: number[] = [];
    let n = componente;
    do {
      grupo.unshift(n & 0x7f);
      n >>>= 7;
    } while (n > 0);
    for (let i = 0; i < grupo.length - 1; i++) grupo[i] = (grupo[i] as number) | 0x80;
    bytes.push(...grupo);
  }
  return tlv(TAG.OID, Buffer.from(bytes));
}

export function nullValue(): Buffer {
  return Buffer.from([TAG.NULL, 0x00]);
}

/** BIT STRING. El primer byte dice cuantos bits sobran del ultimo byte. */
export function bitString(contenido: Buffer, bitsSinUsar = 0): Buffer {
  return tlv(TAG.BIT_STRING, Buffer.concat([Buffer.from([bitsSinUsar]), contenido]));
}

export function utf8String(texto: string): Buffer {
  return tlv(TAG.UTF8_STRING, Buffer.from(texto, 'utf8'));
}

/** UTCTime en formato YYMMDDHHMMSSZ, que es lo que usan los certificados. */
export function utcTime(fecha: Date): Buffer {
  const dosDigitos = (n: number): string => String(n).padStart(2, '0');
  const texto =
    dosDigitos(fecha.getUTCFullYear() % 100) +
    dosDigitos(fecha.getUTCMonth() + 1) +
    dosDigitos(fecha.getUTCDate()) +
    dosDigitos(fecha.getUTCHours()) +
    dosDigitos(fecha.getUTCMinutes()) +
    dosDigitos(fecha.getUTCSeconds()) +
    'Z';
  return tlv(TAG.UTC_TIME, Buffer.from(texto, 'ascii'));
}
