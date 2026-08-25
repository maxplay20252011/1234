import { logger, protocolLog } from '../../logger.js';
import { escapeXml } from './didl.js';

/**
 * Cliente del servicio AVTransport de UPnP.
 *
 * Es como se le manda un archivo a un televisor que no habla Cast: se le pasa
 * la URL con SetAVTransportURI y despues se le dice Play. El televisor va a
 * buscar el archivo por su cuenta a nuestro MediaServer.
 */
const SERVICIO = 'urn:schemas-upnp-org:service:AVTransport:1';

export function buildSoapBody(accion: string, argumentos: Record<string, string>): string {
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

export function extractValue(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return m?.[1]?.trim();
}

/** Convierte H:MM:SS de UPnP a segundos. */
export function parseUpnpDuration(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return undefined;
  const [, h, min, s, ms] = m;
  return (
    Number(h) * 3600 + Number(min) * 60 + Number(s) + (ms ? Number(`0.${ms}`) : 0)
  );
}

export class AvTransportClient {
  constructor(private readonly controlUrl: string) {}

  private async call(
    accion: string,
    argumentos: Record<string, string>,
    timeoutMs = 6000,
  ): Promise<string | undefined> {
    const body = buildSoapBody(accion, argumentos);
    protocolLog('avtransport', 'tx', this.controlUrl, { accion, argumentos });

    try {
      const res = await fetch(this.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPAction: `"${SERVICIO}#${accion}"`,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const texto = await res.text();
      protocolLog('avtransport', 'rx', this.controlUrl, texto.slice(0, 1000));
      if (!res.ok) {
        // El fallo de SOAP viene con detalle util dentro del cuerpo.
        const detalle = extractValue(texto, 'errorDescription') ?? `HTTP ${res.status}`;
        logger.debug({ detalle, accion }, 'AVTransport devolvio un error');
        return undefined;
      }
      return texto;
    } catch (err) {
      logger.debug({ err, accion, controlUrl: this.controlUrl }, 'AVTransport no respondio');
      return undefined;
    }
  }

  /**
   * Carga la URL en el televisor. La metadata DIDL-Lite va escapada dentro del
   * XML del SOAP: es un XML dentro de otro XML, y por eso el doble escapado.
   */
  async setUri(url: string, didlMetadata: string): Promise<boolean> {
    return (
      (await this.call('SetAVTransportURI', {
        InstanceID: '0',
        CurrentURI: url,
        CurrentURIMetaData: didlMetadata,
      })) !== undefined
    );
  }

  async play(): Promise<boolean> {
    return (await this.call('Play', { InstanceID: '0', Speed: '1' })) !== undefined;
  }

  async pause(): Promise<boolean> {
    return (await this.call('Pause', { InstanceID: '0' })) !== undefined;
  }

  async stop(): Promise<boolean> {
    return (await this.call('Stop', { InstanceID: '0' })) !== undefined;
  }

  /** Busca a un segundo concreto. REL_TIME espera el formato H:MM:SS. */
  async seek(seconds: number): Promise<boolean> {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const objetivo = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return (
      (await this.call('Seek', { InstanceID: '0', Unit: 'REL_TIME', Target: objetivo })) !==
      undefined
    );
  }

  async positionInfo(): Promise<{ position?: number; duration?: number; title?: string }> {
    const xml = await this.call('GetPositionInfo', { InstanceID: '0' });
    if (!xml) return {};
    const out: { position?: number; duration?: number; title?: string } = {};
    const rel = parseUpnpDuration(extractValue(xml, 'RelTime'));
    const dur = parseUpnpDuration(extractValue(xml, 'TrackDuration'));
    if (rel !== undefined) out.position = rel;
    // 0:00:00 significa "no se": es lo que devuelven en directos y al arrancar.
    if (dur !== undefined && dur > 0) out.duration = dur;
    const metadata = extractValue(xml, 'TrackMetaData');
    if (metadata) {
      const titulo = extractValue(metadata, 'dc:title');
      if (titulo) out.title = titulo;
    }
    return out;
  }

  async transportState(): Promise<string | undefined> {
    const xml = await this.call('GetTransportInfo', { InstanceID: '0' });
    return xml ? extractValue(xml, 'CurrentTransportState') : undefined;
  }
}
