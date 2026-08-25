import { describe, it, expect } from 'vitest';
import { findField, readFields } from '../../protobuf/index.js';
import {
  STATUS,
  computePairingSecret,
  pairingOption,
  pairingRequest,
  pairingSecret,
  parsePairingMessage,
  parseRemoteMessage,
  remoteKeyInject,
} from './protocol.js';
import { ANDROID_KEYCODES } from './keys.js';

const claveCliente = { modulus: Buffer.alloc(256, 0xa1), exponent: Buffer.from([1, 0, 1]) };
const claveServidor = { modulus: Buffer.alloc(256, 0xb2), exponent: Buffer.from([1, 0, 1]) };

describe('mensajes de emparejamiento', () => {
  it('el pedido lleva la version, el estado y los nombres', () => {
    const campos = readFields(pairingRequest('tv-remote', 'Control de TVs'));
    expect(findField(campos, 1)?.value).toBe(2);
    expect(findField(campos, 2)?.value).toBe(STATUS.OK);

    const submensaje = readFields(findField(campos, 10)?.value as Buffer);
    expect((findField(submensaje, 1)?.value as Buffer).toString()).toBe('tv-remote');
    expect((findField(submensaje, 2)?.value as Buffer).toString()).toBe('Control de TVs');
  });

  it('la opcion declara codigo hexadecimal de seis simbolos', () => {
    const campos = readFields(pairingOption());
    const opcion = readFields(findField(campos, 20)?.value as Buffer);
    const encoding = readFields(findField(opcion, 1)?.value as Buffer);
    expect(findField(encoding, 1)?.value).toBe(3); // hexadecimal
    expect(findField(encoding, 2)?.value).toBe(6); // seis caracteres
  });

  it('el secreto viaja como bytes', () => {
    const secreto = Buffer.alloc(32, 0x7f);
    const campos = readFields(pairingSecret(secreto));
    const sub = readFields(findField(campos, 40)?.value as Buffer);
    expect((findField(sub, 1)?.value as Buffer).equals(secreto)).toBe(true);
  });

  it('identifica en que paso del saludo esta la respuesta', () => {
    // El submensaje presente es lo que dice a que se esta contestando.
    const ack = Buffer.concat([
      Buffer.from([(2 << 3) | 0]),
      Buffer.from([200 & 0x7f | 0x80, 200 >> 7]),
      Buffer.from([(11 << 3) | 2, 0x00]),
    ]);
    const evento = parsePairingMessage(ack);
    expect(evento.status).toBe(200);
    expect(evento.kind).toBe(11);
  });
});

describe('computePairingSecret', () => {
  const codigo = '1a2b3c';

  it('es determinista', () => {
    const a = computePairingSecret(codigo, claveCliente, claveServidor);
    const b = computePairingSecret(codigo, claveCliente, claveServidor);
    expect(a.secret.equals(b.secret)).toBe(true);
    expect(a.secret).toHaveLength(32);
  });

  it('EL ORDEN de las claves importa: invertirlas cambia el secreto', () => {
    // Es el error mas facil de cometer y el mas dificil de detectar sin un
    // televisor: el hash sale distinto y el aparato rechaza sin explicar.
    const normal = computePairingSecret(codigo, claveCliente, claveServidor);
    const invertido = computePairingSecret(codigo, claveServidor, claveCliente);
    expect(normal.secret.equals(invertido.secret)).toBe(false);
  });

  it('el codigo cambia el secreto', () => {
    const a = computePairingSecret('1a2b3c', claveCliente, claveServidor);
    const b = computePairingSecret('1a2b3d', claveCliente, claveServidor);
    expect(a.secret.equals(b.secret)).toBe(false);
  });

  it('detecta si los dos primeros caracteres coinciden con el hash', () => {
    // Con esa comprobacion local se sabe si el codigo se tipeo bien ANTES de
    // mandarselo al televisor.
    const conCualquiera = computePairingSecret('001122', claveCliente, claveServidor);
    const esperado = conCualquiera.secret[0] as number;
    const correcto = computePairingSecret(
      esperado.toString(16).padStart(2, '0') + '1122',
      claveCliente,
      claveServidor,
    );
    expect(correcto.checksumMatches).toBe(true);
  });

  it('rechaza codigos con formato invalido', () => {
    expect(() => computePairingSecret('12345', claveCliente, claveServidor)).toThrow();
    expect(() => computePairingSecret('12345g', claveCliente, claveServidor)).toThrow();
    expect(() => computePairingSecret('', claveCliente, claveServidor)).toThrow();
  });

  it('acepta mayusculas y espacios: el usuario lo tipea a mano', () => {
    const a = computePairingSecret(' 1A2B3C ', claveCliente, claveServidor);
    const b = computePairingSecret('1a2b3c', claveCliente, claveServidor);
    expect(a.secret.equals(b.secret)).toBe(true);
  });
});

describe('mensajes de control remoto', () => {
  it('la inyeccion de tecla lleva el codigo y la direccion', () => {
    const campos = readFields(remoteKeyInject(19));
    const inject = readFields(findField(campos, 10)?.value as Buffer);
    expect(findField(inject, 1)?.value).toBe(19); // KEYCODE_DPAD_UP
    expect(findField(inject, 2)?.value).toBe(3); // pulsacion corta
  });

  it('reconoce el ping del televisor, que hay que contestar o corta', () => {
    const ping = Buffer.concat([Buffer.from([(8 << 3) | 2, 0x02]), Buffer.from([(1 << 3) | 0, 42])]);
    expect(parseRemoteMessage(ping)).toEqual({ kind: 'ping', val1: 42 });
  });
});

describe('codigos de tecla de Android', () => {
  it('usa las constantes publicas de KeyEvent', () => {
    expect(ANDROID_KEYCODES.up).toBe(19);
    expect(ANDROID_KEYCODES.down).toBe(20);
    expect(ANDROID_KEYCODES.left).toBe(21);
    expect(ANDROID_KEYCODES.right).toBe(22);
    expect(ANDROID_KEYCODES.ok).toBe(23);
    expect(ANDROID_KEYCODES.back).toBe(4);
    expect(ANDROID_KEYCODES.home).toBe(3);
    expect(ANDROID_KEYCODES.power).toBe(26);
  });

  it('no inventa un codigo para las teclas sin equivalente', () => {
    // 'exit' no existe en Android; el adapter lo resuelve mandando 'back'.
    expect(ANDROID_KEYCODES.exit).toBeUndefined();
  });
});
