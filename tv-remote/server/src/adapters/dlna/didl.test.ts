import { describe, it, expect } from 'vitest';
import { buildDidlLite, escapeXml, formatDuration, upnpClassFor } from './didl.js';

describe('buildDidlLite', () => {
  const item = {
    title: 'Vacaciones 2026',
    url: 'http://192.168.1.10:8099/media/abc?t=xyz',
    contentType: 'video/mp4',
    sizeBytes: 123456,
    durationSeconds: 90,
  };

  it('declara la clase UPnP correcta: un video anunciado como audio no se ve', () => {
    expect(buildDidlLite(item)).toContain('<upnp:class>object.item.videoItem</upnp:class>');
  });

  it('declara DLNA.ORG_OP=01, que es lo que habilita adelantar el video', () => {
    expect(buildDidlLite(item)).toContain('DLNA.ORG_OP=01');
  });

  it('incluye el protocolInfo con el tipo de contenido', () => {
    expect(buildDidlLite(item)).toContain('protocolInfo="http-get:*:video/mp4:');
  });

  it('incluye tamanio y duracion cuando se conocen', () => {
    const xml = buildDidlLite(item);
    expect(xml).toContain('size="123456"');
    expect(xml).toContain('duration="0:01:30.000"');
  });

  it('omite tamanio y duracion cuando no se conocen, en vez de poner cero', () => {
    const xml = buildDidlLite({ title: 'X', url: 'http://x/a.mp4', contentType: 'video/mp4' });
    expect(xml).not.toContain('size=');
    expect(xml).not.toContain('duration=');
  });

  it('escapa el titulo: un & sin escapar deja el XML mal formado', () => {
    // El televisor no avisa: descarta el envio en silencio.
    const xml = buildDidlLite({ ...item, title: 'Tom & Jerry <1>' });
    expect(xml).toContain('Tom &amp; Jerry &lt;1&gt;');
    expect(xml).not.toContain('Tom & Jerry');
  });

  it('escapa la URL, que casi siempre trae & por el token', () => {
    const xml = buildDidlLite({ ...item, url: 'http://x/a.mp4?t=1&mode=transcode' });
    expect(xml).toContain('t=1&amp;mode=transcode');
  });

  it('agrega el subtitulo con la extension de Samsung cuando lo hay', () => {
    const xml = buildDidlLite({ ...item, subtitleUrl: 'http://x/subs.srt' });
    expect(xml).toContain('<sec:CaptionInfoEx sec:type="srt">http://x/subs.srt</sec:CaptionInfoEx>');
  });

  it('declara los namespaces necesarios', () => {
    const xml = buildDidlLite(item);
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
    expect(xml).toContain('xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"');
    expect(xml).toContain('xmlns:sec="http://www.sec.co.kr/"');
  });
});

describe('formatDuration', () => {
  it('usa el formato H:MM:SS.mmm que espera UPnP', () => {
    expect(formatDuration(90)).toBe('0:01:30.000');
    expect(formatDuration(3661.5)).toBe('1:01:01.500');
    expect(formatDuration(0)).toBe('0:00:00.000');
  });

  it('no produce duraciones negativas ni NaN', () => {
    // Regresion: los milisegundos se calculaban contra el valor sin recortar y
    // salia "0:00:00.-10000", que deja el XML invalido.
    expect(formatDuration(-10)).toBe('0:00:00.000');
    expect(formatDuration(Number.NaN)).toBe('0:00:00.000');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00:00.000');
  });
});

describe('upnpClassFor', () => {
  it('distingue video, audio e imagen', () => {
    expect(upnpClassFor('video/mp4')).toBe('object.item.videoItem');
    expect(upnpClassFor('audio/mpeg')).toBe('object.item.audioItem.musicTrack');
    expect(upnpClassFor('image/jpeg')).toBe('object.item.imageItem.photo');
  });
});

describe('escapeXml', () => {
  it('escapa los cinco caracteres que importan', () => {
    expect(escapeXml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;');
  });
});
