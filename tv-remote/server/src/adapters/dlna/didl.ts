/**
 * Metadata DIDL-Lite.
 *
 * Es el XML que acompania a la URL en SetAVTransportURI. Muchos televisores
 * rechazan el envio en silencio si falta o si esta mal formado: no dan error,
 * simplemente no pasa nada. Es una de las causas mas frustrantes de "no anda"
 * con DLNA, porque no deja rastro.
 */

export type DidlItem = {
  title: string;
  url: string;
  contentType: string;
  sizeBytes?: number;
  durationSeconds?: number;
  /** URL del subtitulo en SRT. Extension de Samsung. */
  subtitleUrl?: string;
};

/**
 * Marca de capacidades DLNA del recurso.
 * OP=01 declara que se admite busqueda por bytes: es lo que habilita adelantar.
 */
const DLNA_FLAGS = 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000';

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formatea segundos como H:MM:SS.mmm, que es lo que espera UPnP. */
export function formatDuration(seconds: number): string {
  // El recorte a cero va PRIMERO: calcular los milisegundos contra el valor
  // original producia cosas como "0:00:00.-10000" con entradas negativas.
  const seguro = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(seguro);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ms = Math.round((seguro - total) * 1000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Clase UPnP segun el tipo de contenido. Un video declarado como audio no se ve. */
export function upnpClassFor(contentType: string): string {
  if (contentType.startsWith('video/')) return 'object.item.videoItem';
  if (contentType.startsWith('audio/')) return 'object.item.audioItem.musicTrack';
  if (contentType.startsWith('image/')) return 'object.item.imageItem.photo';
  return 'object.item';
}

export function buildDidlLite(item: DidlItem): string {
  const atributosRes = [
    `protocolInfo="http-get:*:${item.contentType}:${DLNA_FLAGS}"`,
    item.sizeBytes !== undefined ? `size="${item.sizeBytes}"` : '',
    item.durationSeconds !== undefined
      ? `duration="${formatDuration(item.durationSeconds)}"`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  // sec:CaptionInfoEx es una extension de Samsung para subtitulos externos.
  // Otras marcas la ignoran, asi que incluirla no rompe nada.
  const subtitulo = item.subtitleUrl
    ? `<sec:CaptionInfoEx sec:type="srt">${escapeXml(item.subtitleUrl)}</sec:CaptionInfoEx>`
    : '';

  return (
    '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"' +
    ' xmlns:sec="http://www.sec.co.kr/">' +
    '<item id="0" parentID="-1" restricted="1">' +
    `<dc:title>${escapeXml(item.title)}</dc:title>` +
    `<upnp:class>${upnpClassFor(item.contentType)}</upnp:class>` +
    subtitulo +
    `<res ${atributosRes}>${escapeXml(item.url)}</res>` +
    '</item>' +
    '</DIDL-Lite>'
  );
}
