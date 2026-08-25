import { describe, it, expect } from 'vitest';
import { evaluateCompatibility, parseFfprobeOutput } from './probe.js';

const salidaFfprobe = (streams: unknown[], duration = '212.5'): string =>
  JSON.stringify({ format: { duration, format_name: 'mov,mp4,m4a' }, streams });

describe('parseFfprobeOutput', () => {
  it('lee duracion y flujos', () => {
    const info = parseFfprobeOutput(
      salidaFfprobe([
        { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', profile: 'High' },
        { codec_type: 'audio', codec_name: 'aac', channels: 2, tags: { language: 'spa' } },
      ]),
    );
    expect(info?.durationSeconds).toBeCloseTo(212.5);
    expect(info?.streams).toHaveLength(2);
    expect(info?.streams[0]?.codec).toBe('h264');
    expect(info?.streams[1]?.language).toBe('spa');
  });

  it('no se rompe con JSON invalido', () => {
    expect(parseFfprobeOutput('{roto')).toBeUndefined();
  });
});

describe('evaluateCompatibility', () => {
  const h264aac = parseFfprobeOutput(
    salidaFfprobe([
      { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
      { codec_type: 'audio', codec_name: 'aac' },
    ]),
  );

  it('envia directo un mp4 con h264 y aac: asi el seek es exacto', () => {
    const resultado = evaluateCompatibility('peli.mp4', h264aac);
    expect(resultado.plan).toBe('direct');
    expect(resultado.warning).toBeUndefined();
  });

  it('solo recontenedoriza un mkv con codecs buenos, sin recodificar', () => {
    // Copiar los flujos es rapido y no pierde calidad; recodificar seria tirar
    // CPU al pedo cuando el problema es unicamente el envase.
    const resultado = evaluateCompatibility('peli.mkv', h264aac);
    expect(resultado.plan).toBe('remux');
    expect(resultado.warning).toContain('aproximado');
  });

  it('recodifica cuando el video es de 10 bits', () => {
    const diezBits = parseFfprobeOutput(
      salidaFfprobe([
        { codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le' },
        { codec_type: 'audio', codec_name: 'aac' },
      ]),
    );
    const resultado = evaluateCompatibility('peli.mp4', diezBits);
    expect(resultado.plan).toBe('transcode');
    expect(resultado.reasons.join(' ')).toContain('10 bits');
  });

  it('recodifica cuando el audio es AC3, el caso de "se ve pero no se escucha"', () => {
    const conAc3 = parseFfprobeOutput(
      salidaFfprobe([
        { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
        { codec_type: 'audio', codec_name: 'ac3' },
      ]),
    );
    const resultado = evaluateCompatibility('peli.mp4', conAc3);
    expect(resultado.plan).toBe('transcode');
    expect(resultado.reasons.join(' ')).toContain('no se escuche');
  });

  it('sin ffmpeg no bloquea: envia tal cual y lo dice', () => {
    const resultado = evaluateCompatibility('peli.mp4', undefined);
    expect(resultado.plan).toBe('unknown');
    expect(resultado.reasons.join(' ')).toContain('ffmpeg');
  });
});
