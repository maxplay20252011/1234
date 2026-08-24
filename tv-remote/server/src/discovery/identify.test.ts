import { describe, it, expect } from 'vitest';
import { detectBrand, resolveDeviceId, resolveMac, resolveName, buildDevice } from './identify.js';
import type { Evidence } from './identify.js';

const vacia = (ip: string): Evidence => ({ ip, ssdp: [], upnp: [], mdns: [] });

describe('detectBrand', () => {
  it('distingue un Chromecast con Google TV de un Chromecast pelado', () => {
    // Los dos anuncian _googlecast._tcp y los dos dicen md=Chromecast, asi que
    // el modelo no sirve para diferenciarlos. Lo que los separa es que solo el
    // Google TV anuncia ademas _androidtvremote2._tcp, que es lo que habilita
    // D-pad, encendido y apps.
    const pelado: Evidence = {
      ...vacia('192.168.1.20'),
      mdns: [
        {
          type: 'googlecast',
          name: 'Chromecast-abc',
          port: 8009,
          addresses: ['192.168.1.20'],
          txt: { id: 'abc123', fn: 'TV del living', md: 'Chromecast' },
        },
      ],
    };
    const googleTv: Evidence = {
      ...vacia('192.168.1.21'),
      mdns: [
        {
          type: 'googlecast',
          name: 'Chromecast-def',
          port: 8009,
          addresses: ['192.168.1.21'],
          txt: { id: 'def456', fn: 'Google TV', md: 'Chromecast' },
        },
        {
          type: 'androidtvremote2',
          name: 'Google TV',
          port: 6466,
          addresses: ['192.168.1.21'],
          txt: {},
        },
      ],
    };

    expect(detectBrand(pelado)).toBe('chromecast');
    expect(detectBrand(googleTv)).toBe('androidtv');
  });

  it('prioriza la respuesta directa del televisor sobre cualquier otra pista', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.50'),
      probe: { ip: '192.168.1.50', openPorts: [8001, 8002], samsung: { modelName: 'UN50TU8000' } },
      // Aunque el UPnP dijera otra cosa, gana el sondeo especifico.
      upnp: [{ manufacturer: 'Generic', deviceType: 'MediaRenderer' }],
    };
    expect(detectBrand(ev)).toBe('samsung');
  });

  it('reconoce LG por el fabricante declarado en UPnP', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.30'),
      upnp: [{ manufacturer: 'LG Electronics', modelName: 'OLED55C1' }],
    };
    expect(detectBrand(ev)).toBe('lg');
  });

  it('NO llama LG a un host solo porque tenga el 3000 abierto', () => {
    // El 3000 lo ocupa cualquier servidor de desarrollo. Hace falta el 3001
    // tambien, que es bastante mas caracteristico de webOS.
    const soloTresMil: Evidence = {
      ...vacia('192.168.1.31'),
      probe: { ip: '192.168.1.31', openPorts: [3000] },
    };
    const ambos: Evidence = {
      ...vacia('192.168.1.32'),
      probe: { ip: '192.168.1.32', openPorts: [3000, 3001] },
    };

    expect(detectBrand(soloTresMil)).toBe('unknown');
    expect(detectBrand(ambos)).toBe('lg');
  });

  it('cae en dlna cuando solo sabemos que reproduce media', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.40'),
      upnp: [{ deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1' }],
    };
    expect(detectBrand(ev)).toBe('dlna');
  });

  it('devuelve unknown en vez de adivinar cuando no hay evidencia', () => {
    expect(detectBrand(vacia('192.168.1.99'))).toBe('unknown');
  });
});

describe('resolveDeviceId', () => {
  it('usa el id de mDNS del Chromecast, que es estable de fabrica', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.20'),
      mdns: [
        {
          type: 'googlecast',
          name: 'Chromecast-abc',
          port: 8009,
          addresses: ['192.168.1.20'],
          txt: { id: 'ABC123' },
        },
      ],
    };
    expect(resolveDeviceId(ev, 'chromecast')).toEqual({ id: 'cast:abc123', unstable: false });
  });

  it('el id NO cambia cuando el DHCP cambia la IP', () => {
    // Es la regla central del proyecto: si el id dependiera de la IP,
    // al renovarse el DHCP perderiamos el emparejamiento del televisor.
    const antes: Evidence = {
      ...vacia('192.168.1.50'),
      upnp: [{ udn: 'uuid:0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8' }],
    };
    const despues: Evidence = { ...antes, ip: '192.168.1.77' };

    expect(resolveDeviceId(antes, 'samsung').id).toBe(resolveDeviceId(despues, 'samsung').id);
  });

  it('respeta el orden de prioridad: UDN por encima de la MAC de ARP', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.50'),
      upnp: [{ udn: 'uuid:1111-2222' }],
      arpMac: 'aa:bb:cc:dd:ee:ff',
    };
    expect(resolveDeviceId(ev, 'samsung').id).toBe('udn:uuid:1111-2222');
  });

  it('usa el numero de serie del Roku cuando no hay UDN', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.77'),
      probe: { ip: '192.168.1.77', openPorts: [8060], roku: { serialNumber: 'P0A070000007' } },
    };
    expect(resolveDeviceId(ev, 'roku').id).toBe('roku:p0a070000007');
  });

  it('marca el id como inestable cuando no queda mas remedio que usar la IP', () => {
    const resultado = resolveDeviceId(vacia('192.168.1.99'), 'unknown');
    expect(resultado).toEqual({ id: 'ip:unknown:192.168.1.99', unstable: true });
  });
});

describe('resolveMac', () => {
  it('prefiere la MAC que declara el propio televisor antes que la de ARP', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.50'),
      probe: { ip: '192.168.1.50', openPorts: [8001], samsung: { wifiMac: 'AA:BB:CC:DD:EE:FF' } },
      arpMac: '11:22:33:44:55:66',
    };
    expect(resolveMac(ev)).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('para Roku prefiere la MAC de cable, que es la que suele honrar el WoL', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.77'),
      probe: {
        ip: '192.168.1.77',
        openPorts: [8060],
        roku: { ethernetMac: 'aa:aa:aa:aa:aa:aa', wifiMac: 'bb:bb:bb:bb:bb:bb' },
      },
    };
    expect(resolveMac(ev)).toBe('aa:aa:aa:aa:aa:aa');
  });

  it('devuelve undefined si no hay ninguna MAC, sin inventar una', () => {
    expect(resolveMac(vacia('192.168.1.99'))).toBeUndefined();
  });
});

describe('resolveName', () => {
  it('usa el nombre que le puso el usuario en el televisor', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.50'),
      probe: { ip: '192.168.1.50', openPorts: [8001], samsung: { name: '[TV] Living' } },
    };
    expect(resolveName(ev, 'samsung')).toBe('[TV] Living');
  });

  it('cae en un nombre generico util cuando no hay ninguno', () => {
    expect(resolveName(vacia('192.168.1.99'), 'unknown')).toBe(
      'Dispositivo sin identificar (192.168.1.99)',
    );
  });
});

describe('buildDevice', () => {
  it('deja capabilities vacio en la Fase 1: todavia no hay adapter que lo respalde', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.50'),
      probe: { ip: '192.168.1.50', openPorts: [8001, 8002], samsung: { name: 'TV' } },
    };
    // Declarar que el televisor "puede" subir el volumen sin codigo detras seria
    // exactamente el adapter falso que el proyecto no quiere.
    expect(buildDevice(ev).capabilities).toEqual([]);
  });

  it('registra por que vias se descubrio el dispositivo', () => {
    const ev: Evidence = {
      ...vacia('192.168.1.50'),
      ssdp: [{ address: '192.168.1.50', headers: {}, st: 'roku:ecp' }],
      probe: { ip: '192.168.1.50', openPorts: [8060] },
    };
    expect(buildDevice(ev).sources).toEqual(['ssdp', 'probe']);
  });
});
