import { describe, it, expect } from 'vitest';
import { parseLinuxArp, parseBsdArp, parseWindowsArp, normalizeMac } from './arp.js';
import { broadcastAddress, maskToPrefix } from './interfaces.js';

describe('normalizeMac', () => {
  it('unifica los tres formatos en uno solo', () => {
    // macOS omite el cero a la izquierda, Windows usa guiones. Sin normalizar,
    // la misma placa de red generaria tres ids de dispositivo distintos.
    expect(normalizeMac('0:1a:2b:3:4:5')).toBe('00:1a:2b:03:04:05');
    expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('aa:bb:cc:dd:ee:ff');
  });
});

describe('parseLinuxArp', () => {
  it('lee /proc/net/arp salteando el encabezado', () => {
    const contenido = [
      'IP address       HW type     Flags       HW address            Mask     Device',
      '192.168.1.1      0x1         0x2         aa:bb:cc:dd:ee:ff     *        wlan0',
      '192.168.1.50     0x1         0x2         11:22:33:44:55:66     *        wlan0',
    ].join('\n');

    const tabla = parseLinuxArp(contenido);

    expect(tabla.get('192.168.1.1')).toBe('aa:bb:cc:dd:ee:ff');
    expect(tabla.get('192.168.1.50')).toBe('11:22:33:44:55:66');
    expect(tabla.size).toBe(2);
  });

  it('descarta entradas incompletas, que tienen la MAC en cero', () => {
    const contenido = [
      'IP address       HW type     Flags       HW address            Mask     Device',
      '192.168.1.99     0x1         0x0         00:00:00:00:00:00     *        wlan0',
    ].join('\n');

    expect(parseLinuxArp(contenido).size).toBe(0);
  });
});

describe('parseBsdArp', () => {
  it('lee la salida de arp -an de macOS', () => {
    const contenido = [
      '? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]',
      '? (192.168.1.50) at 0:1a:2b:3:4:5 on en0 ifscope [ethernet]',
      '? (192.168.1.255) at ff:ff:ff:ff:ff:ff on en0 ifscope [ethernet]',
    ].join('\n');

    const tabla = parseBsdArp(contenido);

    expect(tabla.get('192.168.1.1')).toBe('aa:bb:cc:dd:ee:ff');
    // Los octetos sin cero a la izquierda quedan normalizados.
    expect(tabla.get('192.168.1.50')).toBe('00:1a:2b:03:04:05');
    // El broadcast no identifica a nadie.
    expect(tabla.has('192.168.1.255')).toBe(false);
  });

  it('ignora las entradas incompletas de macOS', () => {
    expect(parseBsdArp('? (192.168.1.9) at (incomplete) on en0').size).toBe(0);
  });
});

describe('parseWindowsArp', () => {
  it('lee la salida de arp -a, que usa guiones', () => {
    const contenido = [
      'Interface: 192.168.1.10 --- 0x5',
      '  Internet Address      Physical Address      Type',
      '  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic',
      '  192.168.1.50          11-22-33-44-55-66     dynamic',
      '  192.168.1.255         ff-ff-ff-ff-ff-ff     static',
    ].join('\r\n');

    const tabla = parseWindowsArp(contenido);

    expect(tabla.get('192.168.1.1')).toBe('aa:bb:cc:dd:ee:ff');
    expect(tabla.get('192.168.1.50')).toBe('11:22:33:44:55:66');
    expect(tabla.has('192.168.1.255')).toBe(false);
  });
});

describe('broadcastAddress', () => {
  it('calcula el broadcast de la subred, que es a donde va el magic packet de WoL', () => {
    expect(broadcastAddress('192.168.1.50', '255.255.255.0')).toBe('192.168.1.255');
    expect(broadcastAddress('10.0.5.7', '255.255.0.0')).toBe('10.0.255.255');
    expect(broadcastAddress('172.16.3.9', '255.255.255.128')).toBe('172.16.3.127');
  });
});

describe('maskToPrefix', () => {
  it('convierte la mascara a longitud de prefijo', () => {
    expect(maskToPrefix('255.255.255.0')).toBe(24);
    expect(maskToPrefix('255.255.0.0')).toBe(16);
    expect(maskToPrefix('255.255.255.128')).toBe(25);
  });
});
