import { describe, it, expect } from 'vitest';
import {
  buildChannelUrl,
  buildKeyMessage,
  buildAppListMessage,
  parseSamsungMessage,
} from './protocol.js';

describe('buildChannelUrl', () => {
  it('usa ws sin cifrar por el 8001 en los modelos sin token (2016 y anteriores)', () => {
    const { url, secure } = buildChannelUrl('192.168.1.50', 'Control de TVs', {
      tokenAuthSupport: false,
    });
    expect(url).toMatch(/^ws:\/\/192\.168\.1\.50:8001\//);
    expect(secure).toBe(false);
    // Sin token: en esa generacion no existe.
    expect(url).not.toContain('token=');
  });

  it('usa wss por el 8002 en los modelos con token (2017 en adelante)', () => {
    const { url, secure } = buildChannelUrl('192.168.1.50', 'Control de TVs', {
      tokenAuthSupport: true,
    });
    expect(url).toMatch(/^wss:\/\/192\.168\.1\.50:8002\//);
    expect(secure).toBe(true);
  });

  it('adjunta el token cuando ya hay uno guardado', () => {
    const { url } = buildChannelUrl('192.168.1.50', 'Control de TVs', {
      tokenAuthSupport: true,
      token: '12345678',
    });
    expect(url).toContain('token=12345678');
  });

  it('manda el nombre en base64: es lo que el televisor muestra en el aviso', () => {
    const { url } = buildChannelUrl('192.168.1.50', 'Control de TVs', { tokenAuthSupport: true });
    const name = new URL(url.replace('wss://', 'https://')).searchParams.get('name');
    expect(name).not.toBeNull();
    expect(Buffer.from(name as string, 'base64').toString('utf8')).toBe('Control de TVs');
  });
});

describe('buildKeyMessage', () => {
  it('arma el mensaje de pulsacion que espera el televisor', () => {
    expect(JSON.parse(buildKeyMessage('KEY_VOLUP'))).toEqual({
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: 'KEY_VOLUP',
        Option: 'false',
        TypeOfRemote: 'SendRemoteKey',
      },
    });
  });
});

describe('buildAppListMessage', () => {
  it('pide la lista de apps por el canal de eventos', () => {
    expect(JSON.parse(buildAppListMessage())).toEqual({
      method: 'ms.channel.emit',
      params: { event: 'ed.installedApp.get', to: 'host' },
    });
  });
});

describe('parseSamsungMessage', () => {
  it('extrae el token del evento de conexion', () => {
    // El token llega UNA sola vez, en la primera conexion autorizada. Si se
    // pierde, hay que emparejar de nuevo, asi que este parseo es critico.
    const raw = JSON.stringify({
      event: 'ms.channel.connect',
      data: { clients: [], id: 'abc', token: '12345678' },
    });
    expect(parseSamsungMessage(raw)).toEqual({ kind: 'connected', token: '12345678' });
  });

  it('reconoce una conexion sin token, que es la de las reconexiones', () => {
    const raw = JSON.stringify({ event: 'ms.channel.connect', data: { clients: [], id: 'abc' } });
    expect(parseSamsungMessage(raw)).toEqual({ kind: 'connected' });
  });

  it('reconoce el rechazo del usuario', () => {
    const raw = JSON.stringify({ event: 'ms.channel.unauthorized' });
    expect(parseSamsungMessage(raw)).toEqual({ kind: 'unauthorized' });
  });

  it('reconoce el cierre por inactividad', () => {
    expect(parseSamsungMessage(JSON.stringify({ event: 'ms.channel.timeOut' }))).toEqual({
      kind: 'timeout',
    });
  });

  it('parsea la lista de apps instaladas', () => {
    const raw = JSON.stringify({
      event: 'ed.installedApp.get',
      from: 'host',
      data: {
        data: [
          { appId: '11101200001', name: 'Netflix', app_type: 2 },
          { appId: '111299001912', name: 'YouTube', app_type: 2 },
        ],
      },
    });
    expect(parseSamsungMessage(raw)).toEqual({
      kind: 'apps',
      apps: [
        { id: '11101200001', name: 'Netflix' },
        { id: '111299001912', name: 'YouTube' },
      ],
    });
  });

  it('descarta entradas de la lista de apps que vengan incompletas', () => {
    const raw = JSON.stringify({
      event: 'ed.installedApp.get',
      data: { data: [{ appId: 'ok', name: 'Buena' }, { appId: 'sin-nombre' }, null, 'texto'] },
    });
    const evento = parseSamsungMessage(raw);
    expect(evento).toEqual({ kind: 'apps', apps: [{ id: 'ok', name: 'Buena' }] });
  });

  it('no se rompe con JSON invalido ni con mensajes sin evento', () => {
    expect(parseSamsungMessage('{roto')).toBeNull();
    expect(parseSamsungMessage('null')).toBeNull();
    expect(parseSamsungMessage(JSON.stringify({ sin: 'evento' }))).toBeNull();
  });
});
