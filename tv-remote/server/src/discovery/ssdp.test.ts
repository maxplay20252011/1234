import { describe, it, expect } from 'vitest';
import { parseSsdpMessage, extractUdn, buildMSearch } from './ssdp.js';

const CRLF = '\r\n';

describe('parseSsdpMessage', () => {
  it('parsea una respuesta de MediaRenderer y baja los headers a minuscula', () => {
    const raw = [
      'HTTP/1.1 200 OK',
      'CACHE-CONTROL: max-age=1800',
      'EXT:',
      'LOCATION: http://192.168.1.50:9197/dmr',
      'SERVER: SHP, UPnP/1.0, Samsung UPnP SDK/1.0',
      'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
      'USN: uuid:0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8::urn:schemas-upnp-org:device:MediaRenderer:1',
      '',
      '',
    ].join(CRLF);

    const res = parseSsdpMessage(raw, '192.168.1.50');

    expect(res).not.toBeNull();
    expect(res?.address).toBe('192.168.1.50');
    expect(res?.st).toBe('urn:schemas-upnp-org:device:MediaRenderer:1');
    expect(res?.location).toBe('http://192.168.1.50:9197/dmr');
    expect(res?.server).toContain('Samsung');
    expect(res?.headers['cache-control']).toBe('max-age=1800');
  });

  it('parsea una respuesta de Roku, que usa su propio search target', () => {
    const raw = [
      'HTTP/1.1 200 OK',
      'Cache-Control: max-age=3600',
      'ST: roku:ecp',
      'Location: http://192.168.1.77:8060/',
      'USN: uuid:roku:ecp:P0A070000007',
      '',
      '',
    ].join(CRLF);

    const res = parseSsdpMessage(raw, '192.168.1.77');

    expect(res?.st).toBe('roku:ecp');
    expect(res?.location).toBe('http://192.168.1.77:8060/');
  });

  it('acepta anuncios NOTIFY, que son como se presentan los TVs al encenderse', () => {
    const raw = [
      'NOTIFY * HTTP/1.1',
      'HOST: 239.255.255.250:1900',
      'NT: urn:schemas-upnp-org:device:MediaRenderer:1',
      'NTS: ssdp:alive',
      'USN: uuid:abcdefab-1234-1234-1234-abcdefabcdef::urn:schemas-upnp-org:device:MediaRenderer:1',
      'LOCATION: http://192.168.1.60:8080/desc.xml',
      '',
      '',
    ].join(CRLF);

    const res = parseSsdpMessage(raw, '192.168.1.60');

    // El NT de un NOTIFY cumple el mismo rol que el ST de una respuesta.
    expect(res?.st).toBe('urn:schemas-upnp-org:device:MediaRenderer:1');
    expect(res?.location).toBe('http://192.168.1.60:8080/desc.xml');
  });

  it('descarta un ssdp:byebye: significa que el dispositivo se va de la red', () => {
    const raw = [
      'NOTIFY * HTTP/1.1',
      'NT: urn:schemas-upnp-org:device:MediaRenderer:1',
      'NTS: ssdp:byebye',
      'USN: uuid:abcdefab-1234-1234-1234-abcdefabcdef',
      '',
      '',
    ].join(CRLF);

    expect(parseSsdpMessage(raw, '192.168.1.60')).toBeNull();
  });

  it('descarta paquetes que no son SSDP', () => {
    expect(parseSsdpMessage('cualquier basura', '192.168.1.1')).toBeNull();
    expect(parseSsdpMessage('HTTP/1.1 404 Not Found\r\n\r\n', '192.168.1.1')).toBeNull();
    expect(parseSsdpMessage('', '192.168.1.1')).toBeNull();
  });

  it('tolera saltos de linea LF solos, que algunos fabricantes mandan mal', () => {
    const raw = 'HTTP/1.1 200 OK\nST: roku:ecp\nLOCATION: http://192.168.1.77:8060/\n\n';
    expect(parseSsdpMessage(raw, '192.168.1.77')?.st).toBe('roku:ecp');
  });

  it('no se rompe con headers sin dos puntos ni con valores que contienen dos puntos', () => {
    const raw = [
      'HTTP/1.1 200 OK',
      'linea-basura-sin-separador',
      'LOCATION: http://192.168.1.50:9197/dmr',
      '',
      '',
    ].join(CRLF);
    expect(parseSsdpMessage(raw, '192.168.1.50')?.location).toBe('http://192.168.1.50:9197/dmr');
  });
});

describe('extractUdn', () => {
  it('saca el uuid del USN descartando el sufijo del servicio', () => {
    expect(
      extractUdn(
        'uuid:0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8::urn:schemas-upnp-org:device:MediaRenderer:1',
      ),
    ).toBe('uuid:0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8');
  });

  it('funciona con un USN que es solo el uuid', () => {
    expect(extractUdn('uuid:ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe(
      'uuid:abcdef12-3456-7890-abcd-ef1234567890',
    );
  });

  it('devuelve undefined si no hay USN o no tiene forma de uuid', () => {
    expect(extractUdn(undefined)).toBeUndefined();
    expect(extractUdn('roku:ecp')).toBeUndefined();
  });
});

describe('buildMSearch', () => {
  it('termina en una linea en blanco: sin eso los dispositivos lo descartan', () => {
    const packet = buildMSearch('roku:ecp', 3).toString('utf8');
    expect(packet.endsWith(`${CRLF}${CRLF}`)).toBe(true);
  });

  it('usa CRLF y no LF solo', () => {
    const packet = buildMSearch('ssdp:all', 2).toString('utf8');
    expect(packet.split(CRLF)[0]).toBe('M-SEARCH * HTTP/1.1');
    expect(packet.includes('\n\n')).toBe(false);
  });

  it('manda MAN entre comillas, como exige la especificacion', () => {
    expect(buildMSearch('ssdp:all', 2).toString('utf8')).toContain('MAN: "ssdp:discover"');
  });

  it('incluye el search target y el MX pedidos', () => {
    const packet = buildMSearch('urn:dial-multiscreen-org:service:dial:1', 5).toString('utf8');
    expect(packet).toContain('ST: urn:dial-multiscreen-org:service:dial:1');
    expect(packet).toContain('MX: 5');
  });
});
