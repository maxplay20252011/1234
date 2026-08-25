import { describe, it, expect } from 'vitest';
import { buildMagicPacket, WOL_PORTS } from './wol.js';

describe('buildMagicPacket', () => {
  it('mide exactamente 102 bytes', () => {
    // 6 bytes de sincronismo + 16 repeticiones de una MAC de 6 bytes.
    expect(buildMagicPacket('aa:bb:cc:dd:ee:ff')).toHaveLength(102);
  });

  it('arranca con seis bytes 0xFF', () => {
    const packet = buildMagicPacket('aa:bb:cc:dd:ee:ff');
    expect([...packet.subarray(0, 6)]).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  });

  it('repite la MAC 16 veces, sin excepcion', () => {
    const packet = buildMagicPacket('01:23:45:67:89:ab');
    const esperada = [0x01, 0x23, 0x45, 0x67, 0x89, 0xab];
    for (let i = 0; i < 16; i++) {
      expect([...packet.subarray(6 + i * 6, 12 + i * 6)]).toEqual(esperada);
    }
  });

  it('acepta guiones y mayusculas, que es como los imprime Windows', () => {
    expect(buildMagicPacket('AA-BB-CC-DD-EE-FF')).toEqual(buildMagicPacket('aa:bb:cc:dd:ee:ff'));
  });

  it('rechaza una MAC invalida en vez de mandar basura a la red', () => {
    expect(() => buildMagicPacket('no-es-una-mac')).toThrow(/MAC invalida/);
    expect(() => buildMagicPacket('aa:bb:cc')).toThrow(/MAC invalida/);
    expect(() => buildMagicPacket('')).toThrow(/MAC invalida/);
    // 'gg' no es hexadecimal.
    expect(() => buildMagicPacket('gg:bb:cc:dd:ee:ff')).toThrow(/MAC invalida/);
  });
});

describe('WOL_PORTS', () => {
  it('incluye el 9 y el 7: los televisores no coinciden en cual escuchan', () => {
    expect([...WOL_PORTS].sort()).toEqual([7, 9]);
  });
});
