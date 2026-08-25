import { describe, it, expect } from 'vitest';
import { buildSoapEnvelope, extractSoapValue, escapeXml } from './upnp-volume.js';

describe('buildSoapEnvelope', () => {
  it('arma una peticion SOAP con el namespace del servicio', () => {
    const xml = buildSoapEnvelope('SetVolume', {
      InstanceID: '0',
      Channel: 'Master',
      DesiredVolume: '15',
    });
    expect(xml).toContain('<u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">');
    expect(xml).toContain('<InstanceID>0</InstanceID>');
    expect(xml).toContain('<Channel>Master</Channel>');
    expect(xml).toContain('<DesiredVolume>15</DesiredVolume>');
    expect(xml).toContain('</s:Envelope>');
  });
});

describe('escapeXml', () => {
  it('escapa los caracteres que romperian el XML', () => {
    // Sin esto, un nombre con & genera un cuerpo mal formado y el televisor
    // rechaza la peticion entera sin explicar por que.
    expect(escapeXml('Tom & Jerry <"raro">')).toBe(
      'Tom &amp; Jerry &lt;&quot;raro&quot;&gt;',
    );
  });
});

describe('extractSoapValue', () => {
  const respuesta = `<?xml version="1.0"?>
    <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
      <s:Body>
        <u:GetVolumeResponse xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">
          <CurrentVolume>15</CurrentVolume>
        </u:GetVolumeResponse>
      </s:Body>
    </s:Envelope>`;

  it('saca el valor pedido', () => {
    expect(extractSoapValue(respuesta, 'CurrentVolume')).toBe('15');
  });

  it('devuelve undefined si la etiqueta no esta', () => {
    expect(extractSoapValue(respuesta, 'CurrentMute')).toBeUndefined();
  });
});
