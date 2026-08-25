import { describe, it, expect } from 'vitest';
import {
  encodeVarint,
  decodeVarint,
  encodeCastMessage,
  decodeCastMessage,
  frame,
  deframe,
} from './protobuf.js';

describe('varint', () => {
  it('codifica valores de un solo byte tal cual', () => {
    expect([...encodeVarint(0)]).toEqual([0x00]);
    expect([...encodeVarint(1)]).toEqual([0x01]);
    expect([...encodeVarint(127)]).toEqual([0x7f]);
  });

  it('usa el bit alto como continuacion a partir de 128', () => {
    expect([...encodeVarint(128)]).toEqual([0x80, 0x01]);
    expect([...encodeVarint(300)]).toEqual([0xac, 0x02]);
  });

  it('vuelve al valor original al decodificar', () => {
    for (const n of [0, 1, 127, 128, 300, 16383, 16384, 1_000_000]) {
      const buf = encodeVarint(n);
      expect(decodeVarint(buf, 0)).toEqual({ value: n, bytesRead: buf.length });
    }
  });

  it('falla con un varint cortado en vez de devolver un valor equivocado', () => {
    // Bit de continuacion prendido pero sin byte siguiente.
    expect(() => decodeVarint(Buffer.from([0x80]), 0)).toThrow(/incompleto/);
  });
});

describe('CastMessage', () => {
  const mensaje = {
    sourceId: 'sender-0',
    destinationId: 'receiver-0',
    namespace: 'urn:x-cast:com.google.cast.receiver',
    payloadUtf8: '{"type":"GET_STATUS","requestId":1}',
  };

  it('sobrevive a la ida y vuelta', () => {
    expect(decodeCastMessage(encodeCastMessage(mensaje))).toEqual(mensaje);
  });

  it('conserva los caracteres no ASCII', () => {
    const conAcentos = { ...mensaje, payloadUtf8: '{"title":"Canción ñandú 日本"}' };
    expect(decodeCastMessage(encodeCastMessage(conAcentos)).payloadUtf8).toBe(
      conAcentos.payloadUtf8,
    );
  });

  it('ignora campos desconocidos en vez de fallar', () => {
    // Es como protobuf esta pensado para evolucionar: si Google agrega un campo,
    // esto lo saltea y sigue andando.
    const conocido = encodeCastMessage(mensaje);
    const campoExtra = Buffer.concat([
      encodeVarint((99 << 3) | 0), // campo 99, varint
      encodeVarint(12345),
    ]);
    expect(decodeCastMessage(Buffer.concat([conocido, campoExtra]))).toEqual(mensaje);
  });
});

describe('enmarcado', () => {
  it('antepone la longitud en cuatro bytes big-endian', () => {
    const enmarcado = frame(Buffer.from('hola'));
    expect(enmarcado.readUInt32BE(0)).toBe(4);
    expect(enmarcado.subarray(4).toString()).toBe('hola');
  });

  it('separa varios mensajes que llegaron juntos', () => {
    const juntos = Buffer.concat([frame(Buffer.from('uno')), frame(Buffer.from('dos'))]);
    const { messages, rest } = deframe(juntos);
    expect(messages.map((m) => m.toString())).toEqual(['uno', 'dos']);
    expect(rest).toHaveLength(0);
  });

  it('guarda el resto cuando un mensaje llega partido', () => {
    // TCP entrega un flujo continuo, no paquetes: un mensaje puede llegar en
    // dos pedazos y hay que esperar a tenerlo entero antes de decodificar.
    const completo = frame(Buffer.from('mensaje-largo'));
    const primeraMitad = completo.subarray(0, 7);
    const segundaMitad = completo.subarray(7);

    const paso1 = deframe(primeraMitad);
    expect(paso1.messages).toHaveLength(0);
    expect(paso1.rest).toHaveLength(7);

    const paso2 = deframe(Buffer.concat([paso1.rest, segundaMitad]));
    expect(paso2.messages.map((m) => m.toString())).toEqual(['mensaje-largo']);
    expect(paso2.rest).toHaveLength(0);
  });

  it('no devuelve nada si todavia no llego ni la cabecera de longitud', () => {
    const { messages, rest } = deframe(Buffer.from([0x00, 0x00]));
    expect(messages).toHaveLength(0);
    expect(rest).toHaveLength(2);
  });
});
