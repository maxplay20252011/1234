import { logger, protocolLog } from '../../logger.js';

/**
 * Volumen absoluto por UPnP RenderingControl.
 *
 * El canal de control remoto de Samsung solo tiene pasos (KEY_VOLUP y
 * KEY_VOLDOWN) y el mute es un interruptor, no un valor. El volumen absoluto y
 * el estado real existen, pero por otra via: el servicio RenderingControl de
 * UPnP, que muchos televisores exponen en el puerto 9197.
 *
 * "Muchos", no todos. Por eso nada de esto se asume: `probeRenderingControl()`
 * lo verifica de verdad y la capacidad 'volumeAbsolute' solo se declara si la
 * consulta funciono contra ESE televisor.
 */
export const RENDERING_CONTROL_PORT = 9197;
export const RENDERING_CONTROL_PATH = '/upnp/control/RenderingControl1';
const SERVICIO = 'urn:schemas-upnp-org:service:RenderingControl:1';

export function buildSoapEnvelope(accion: string, argumentos: Record<string, string>): string {
  const cuerpo = Object.entries(argumentos)
    .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    '<s:Body>' +
    `<u:${accion} xmlns:u="${SERVICIO}">${cuerpo}</u:${accion}>` +
    '</s:Body></s:Envelope>'
  );
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Saca un valor simple de la respuesta SOAP sin montar un parser completo. */
export function extractSoapValue(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i').exec(xml);
  return m?.[1]?.trim();
}

async function soapCall(
  ip: string,
  accion: string,
  argumentos: Record<string, string>,
  timeoutMs: number,
): Promise<string | undefined> {
  const url = `http://${ip}:${RENDERING_CONTROL_PORT}${RENDERING_CONTROL_PATH}`;
  const body = buildSoapEnvelope(accion, argumentos);
  protocolLog('upnp-rc', 'tx', ip, { accion, argumentos });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        SOAPAction: `"${SERVICIO}#${accion}"`,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const texto = await res.text();
    protocolLog('upnp-rc', 'rx', ip, texto.slice(0, 1000));
    return texto;
  } catch (err) {
    logger.debug({ err, ip, accion }, 'RenderingControl no respondio');
    return undefined;
  }
}

/** true solo si el televisor contesto de verdad una consulta de volumen. */
export async function probeRenderingControl(ip: string, timeoutMs = 1500): Promise<boolean> {
  return (await getVolume(ip, timeoutMs)) !== undefined;
}

export async function getVolume(ip: string, timeoutMs = 2000): Promise<number | undefined> {
  const xml = await soapCall(ip, 'GetVolume', { InstanceID: '0', Channel: 'Master' }, timeoutMs);
  if (!xml) return undefined;
  const valor = extractSoapValue(xml, 'CurrentVolume');
  if (valor === undefined) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

export async function setVolume(ip: string, level: number, timeoutMs = 2000): Promise<boolean> {
  const xml = await soapCall(
    ip,
    'SetVolume',
    { InstanceID: '0', Channel: 'Master', DesiredVolume: String(Math.round(level)) },
    timeoutMs,
  );
  return xml !== undefined;
}

export async function getMute(ip: string, timeoutMs = 2000): Promise<boolean | undefined> {
  const xml = await soapCall(ip, 'GetMute', { InstanceID: '0', Channel: 'Master' }, timeoutMs);
  if (!xml) return undefined;
  const valor = extractSoapValue(xml, 'CurrentMute');
  if (valor === undefined) return undefined;
  return valor === '1' || valor.toLowerCase() === 'true';
}

export async function setMute(ip: string, muted: boolean, timeoutMs = 2000): Promise<boolean> {
  const xml = await soapCall(
    ip,
    'SetMute',
    { InstanceID: '0', Channel: 'Master', DesiredMute: muted ? '1' : '0' },
    timeoutMs,
  );
  return xml !== undefined;
}
