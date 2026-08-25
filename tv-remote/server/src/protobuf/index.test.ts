import { describe, it, expect } from 'vitest';
import {
  ProtoWriter,
  readFields,
  findField,
  frameVarint,
  deframeVarint,
  WIRE_LENGTH_DELIMITED,
  WIRE_VARINT,
} from './index.js';

describe('ProtoWriter', () => {
  it('omite los campos que no se setean', () => {
    const buf = new ProtoWriter().varint(1, 5).string(2, undefined).build();
    expect(readFields(buf)).toHaveLength(1);
  });

  it('anida mensajes', () => {
    const interno = new ProtoWriter().string(1, 'hola').varint(2, 42);
    const externo = new ProtoWriter().message(10, interno).build();

    const campos = readFields(externo);
    const anidado = findField(campos, 10);
    expect(anidado?.wire).toBe(WIRE_LENGTH_DELIMITED);

    const internos = readFields(anidado?.value as Buffer);
    expect(findField(internos, 1)?.value.toString()).toBe('hola');
    expect(findField(internos, 2)?.value).toBe(42);
  });

  it('sobrevive a la ida y vuelta con textos no ASCII', () => {
    const buf = new ProtoWriter().string(1, 'Canción ñandú 日本').build();
    expect((findField(readFields(buf), 1)?.value as Buffer).toString('utf8')).toBe(
      'Canción ñandú 日本',
    );
  });
});

describe('readFields', () => {
  it('saltea los tipos que no manejamos en vez de fallar', () => {
    // Un fixed32 (wire 5) en medio: se ignora y se sigue leyendo lo demas.
    const conFixed32 = Buffer.concat([
      new ProtoWriter().varint(1, 7).build(),
      Buffer.from([(2 << 3) | 5, 0x01, 0x02, 0x03, 0x04]),
      new ProtoWriter().varint(3, 9).build(),
    ]);
    const campos = readFields(conFixed32);
    expect(findField(campos, 1)?.value).toBe(7);
    expect(findField(campos, 3)?.value).toBe(9);
  });
});

describe('enmarcado con varint', () => {
  it('NO es el mismo que el de castv2, que usa cuatro bytes', () => {
    // Confundirlos desincroniza el flujo entero desde el primer mensaje.
    const enmarcado = frameVarint(Buffer.alloc(5));
    expect(enmarcado).toHaveLength(6); // 1 byte de longitud + 5 de cuerpo
  });

  it('usa varios bytes de longitud cuando el mensaje pasa de 127', () => {
    const enmarcado = frameVarint(Buffer.alloc(300));
    expect(enmarcado).toHaveLength(302); // 2 bytes de longitud + 300
  });

  it('separa varios mensajes que llegaron juntos', () => {
    const juntos = Buffer.concat([
      frameVarint(Buffer.from('uno')),
      frameVarint(Buffer.from('dos')),
    ]);
    const { messages, rest } = deframeVarint(juntos);
    expect(messages.map((m) => m.toString())).toEqual(['uno', 'dos']);
    expect(rest).toHaveLength(0);
  });

  it('guarda el resto cuando un mensaje llega partido', () => {
    const completo = frameVarint(Buffer.from('mensaje-largo'));
    const paso1 = deframeVarint(completo.subarray(0, 6));
    expect(paso1.messages).toHaveLength(0);

    const paso2 = deframeVarint(Buffer.concat([paso1.rest, completo.subarray(6)]));
    expect(paso2.messages.map((m) => m.toString())).toEqual(['mensaje-largo']);
  });

  it('espera si ni siquiera llego la longitud entera', () => {
    // Un varint con el bit de continuacion prendido y nada mas.
    const { messages, rest } = deframeVarint(Buffer.from([0x80]));
    expect(messages).toHaveLength(0);
    expect(rest).toHaveLength(1);
  });
});

describe('tipos de campo', () => {
  it('distingue varint de longitud variable', () => {
    const buf = new ProtoWriter().varint(1, 1).string(2, 'x').build();
    const campos = readFields(buf);
    expect(findField(campos, 1)?.wire).toBe(WIRE_VARINT);
    expect(findField(campos, 2)?.wire).toBe(WIRE_LENGTH_DELIMITED);
  });
});
