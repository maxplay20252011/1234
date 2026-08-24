import { describe, it, expect } from 'vitest';
import { parseSamsungInfo, parseRokuInfo, samsungModelYear } from './probe.js';
import { parseUpnpDescription } from './upnp.js';

describe('samsungModelYear', () => {
  it('lee el anio de los dos primeros digitos del modelo interno', () => {
    // Samsung codifica el anio ahi, y el anio decide el protocolo entero.
    expect(samsungModelYear('20_KANTM_UHD')).toBe(2020);
    expect(samsungModelYear('16_KANTM_UHD')).toBe(2016);
    expect(samsungModelYear('23-FOOBAR')).toBe(2023);
  });

  it('devuelve undefined con formatos que no reconoce, en vez de adivinar', () => {
    expect(samsungModelYear('KANTM_UHD')).toBeUndefined();
    expect(samsungModelYear('')).toBeUndefined();
    expect(samsungModelYear('99_RARO')).toBeUndefined();
  });
});

describe('parseSamsungInfo', () => {
  const respuesta = {
    device: {
      OS: 'Tizen',
      TokenAuthSupport: 'true',
      countryCode: 'AR',
      duid: 'uuid:11111111-2222-3333-4444-555555555555',
      model: '20_KANTM_UHD',
      modelName: 'UN50TU8000',
      name: '[TV] Living',
      networkType: 'wireless',
      udn: 'uuid:11111111-2222-3333-4444-555555555555',
      wifiMac: 'AA:BB:CC:DD:EE:FF',
    },
    name: '[TV] Living',
    type: 'Samsung SmartTV',
  };

  it('extrae nombre, modelo, MAC y anio', () => {
    const info = parseSamsungInfo(respuesta);
    expect(info?.name).toBe('[TV] Living');
    expect(info?.modelName).toBe('UN50TU8000');
    expect(info?.modelYear).toBe(2020);
    expect(info?.wifiMac).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('interpreta TokenAuthSupport, que decide si hace falta el pop-up del televisor', () => {
    expect(parseSamsungInfo(respuesta)?.tokenAuthSupport).toBe(true);
    const viejo = { device: { ...respuesta.device, TokenAuthSupport: 'false' } };
    expect(parseSamsungInfo(viejo)?.tokenAuthSupport).toBe(false);
  });

  it('devuelve undefined si la respuesta no tiene la forma esperada', () => {
    expect(parseSamsungInfo(null)).toBeUndefined();
    expect(parseSamsungInfo({})).toBeUndefined();
    expect(parseSamsungInfo({ device: 'no es un objeto' })).toBeUndefined();
  });
});

describe('parseRokuInfo', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
    <device-info>
      <serial-number>P0A070000007</serial-number>
      <model-name>Roku Express</model-name>
      <friendly-device-name>Roku del cuarto</friendly-device-name>
      <wifi-mac>aa:bb:cc:dd:ee:ff</wifi-mac>
      <is-tv>false</is-tv>
      <power-mode>PowerOn</power-mode>
    </device-info>`;

  it('extrae el serial, que es el id estable del aparato', () => {
    expect(parseRokuInfo(xml)?.serialNumber).toBe('P0A070000007');
  });

  it('distingue un Roku TV de un stick: solo el TV controla volumen', () => {
    expect(parseRokuInfo(xml)?.isTv).toBe(false);
    expect(parseRokuInfo(xml.replace('<is-tv>false', '<is-tv>true'))?.isTv).toBe(true);
  });

  it('no se rompe con XML invalido', () => {
    expect(parseRokuInfo('<esto no cierra')).toBeUndefined();
    expect(parseRokuInfo('')).toBeUndefined();
  });
});

describe('parseUpnpDescription', () => {
  it('lee el XML de descripcion aunque el <device> este anidado', () => {
    const xml = `<?xml version="1.0"?>
      <root xmlns="urn:schemas-upnp-org:device-1-0">
        <specVersion><major>1</major><minor>0</minor></specVersion>
        <device>
          <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
          <friendlyName>[TV] Living</friendlyName>
          <manufacturer>Samsung Electronics</manufacturer>
          <modelName>UN50TU8000</modelName>
          <UDN>uuid:0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8</UDN>
        </device>
      </root>`;

    const desc = parseUpnpDescription(xml);

    expect(desc?.friendlyName).toBe('[TV] Living');
    expect(desc?.manufacturer).toBe('Samsung Electronics');
    expect(desc?.udn).toBe('uuid:0d1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8');
    expect(desc?.deviceType).toContain('MediaRenderer');
  });

  it('saca los prefijos de namespace, que cada fabricante usa distinto', () => {
    const xml = `<root xmlns:sec="http://www.sec.co.kr/dlna">
        <device>
          <sec:friendlyName>TV con prefijo</sec:friendlyName>
          <UDN>uuid:abc</UDN>
        </device>
      </root>`;
    expect(parseUpnpDescription(xml)?.friendlyName).toBe('TV con prefijo');
  });

  it('devuelve undefined con XML invalido o sin datos utiles', () => {
    expect(parseUpnpDescription('<root><device></device></root>')).toBeUndefined();
    expect(parseUpnpDescription('no soy xml')).toBeUndefined();
  });
});
