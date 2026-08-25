import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MEDIA_RECEIVER,
  guessContentType,
  loadPayload,
  parseMediaStatus,
  parseReceiverStatus,
  setMutePayload,
  setVolumePayload,
} from './protocol.js';

describe('setVolumePayload', () => {
  it('convierte el porcentaje al decimal de 0 a 1 que usa el protocolo', () => {
    expect(JSON.parse(setVolumePayload(1, 50))).toEqual({
      type: 'SET_VOLUME',
      requestId: 1,
      volume: { level: 0.5 },
    });
  });

  it('recorta los valores fuera de rango en vez de mandarlos al aparato', () => {
    expect(JSON.parse(setVolumePayload(1, 500)).volume.level).toBe(1);
    expect(JSON.parse(setVolumePayload(1, -20)).volume.level).toBe(0);
  });
});

describe('setMutePayload', () => {
  it('manda solo el silencio, sin tocar el nivel', () => {
    const payload = JSON.parse(setMutePayload(2, true));
    expect(payload.volume).toEqual({ muted: true });
    expect(payload.volume.level).toBeUndefined();
  });
});

describe('loadPayload', () => {
  it('incluye metadata: sin ella algunos receptores rechazan la carga', () => {
    const payload = JSON.parse(
      loadPayload(3, { url: 'http://192.168.1.10:8099/v.mp4', contentType: 'video/mp4', title: 'Peli' }),
    );
    expect(payload.media.contentId).toBe('http://192.168.1.10:8099/v.mp4');
    expect(payload.media.contentType).toBe('video/mp4');
    expect(payload.media.streamType).toBe('BUFFERED');
    expect(payload.media.metadata.metadataType).toBe(0);
    expect(payload.media.metadata.title).toBe('Peli');
    expect(payload.autoplay).toBe(true);
  });
});

describe('guessContentType', () => {
  it('deduce el tipo por la extension', () => {
    expect(guessContentType('http://x/video.mp4')).toBe('video/mp4');
    expect(guessContentType('http://x/audio.mp3')).toBe('audio/mpeg');
    expect(guessContentType('http://x/stream.m3u8')).toBe('application/x-mpegurl');
  });

  it('ignora la query, que si no rompe la deteccion', () => {
    expect(guessContentType('http://x/video.mp4?token=abc&t=10')).toBe('video/mp4');
  });

  it('cae en video/mp4 ante la duda: es lo que soporta cualquier receptor', () => {
    expect(guessContentType('http://x/algo-sin-extension')).toBe('video/mp4');
  });
});

describe('parseReceiverStatus', () => {
  it('lee volumen y silencio, convirtiendo el nivel a porcentaje', () => {
    const payload = JSON.stringify({
      type: 'RECEIVER_STATUS',
      requestId: 1,
      status: { volume: { level: 0.37, muted: false } },
    });
    expect(parseReceiverStatus(payload)).toEqual({ volume: 37, muted: false });
  });

  it('lee la sesion de la aplicacion cargada', () => {
    const payload = JSON.stringify({
      type: 'RECEIVER_STATUS',
      status: {
        applications: [
          {
            appId: DEFAULT_MEDIA_RECEIVER,
            displayName: 'Default Media Receiver',
            sessionId: 'sesion-1',
            transportId: 'transporte-1',
          },
        ],
        volume: { level: 1, muted: false },
      },
    });
    const estado = parseReceiverStatus(payload);
    // transportId es el destino al que hay que hablarle para controlar la
    // reproduccion: sin el no se puede mandar ni un LOAD.
    expect(estado?.transportId).toBe('transporte-1');
    expect(estado?.sessionId).toBe('sesion-1');
    expect(estado?.appId).toBe(DEFAULT_MEDIA_RECEIVER);
  });

  it('funciona con un aparato en reposo, que no manda applications', () => {
    const payload = JSON.stringify({
      type: 'RECEIVER_STATUS',
      status: { volume: { level: 0.5, muted: false } },
    });
    const estado = parseReceiverStatus(payload);
    expect(estado?.volume).toBe(50);
    expect(estado?.transportId).toBeUndefined();
  });

  it('devuelve undefined si el mensaje es de otro tipo', () => {
    expect(parseReceiverStatus(JSON.stringify({ type: 'PONG' }))).toBeUndefined();
    expect(parseReceiverStatus('{roto')).toBeUndefined();
  });
});

describe('parseMediaStatus', () => {
  it('lee el estado de reproduccion y la duracion', () => {
    const payload = JSON.stringify({
      type: 'MEDIA_STATUS',
      status: [
        {
          mediaSessionId: 7,
          playerState: 'PLAYING',
          currentTime: 42.5,
          media: { duration: 212, metadata: { title: 'Mi video' } },
        },
      ],
    });
    expect(parseMediaStatus(payload)).toEqual({
      mediaSessionId: 7,
      playerState: 'PLAYING',
      currentTime: 42.5,
      duration: 212,
      title: 'Mi video',
    });
  });

  it('devuelve un objeto vacio cuando el aparato manda la lista vacia', () => {
    // Pasa al cortar la reproduccion: el mensaje llega pero sin contenido.
    expect(parseMediaStatus(JSON.stringify({ type: 'MEDIA_STATUS', status: [] }))).toEqual({});
  });
});
