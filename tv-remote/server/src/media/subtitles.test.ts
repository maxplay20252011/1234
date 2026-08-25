import { describe, it, expect } from 'vitest';
import { srtToVtt, esVtt, subtitleCandidates } from './subtitles.js';

describe('srtToVtt', () => {
  const srt = `1
00:00:01,000 --> 00:00:04,000
Hola, ¿cómo andás?

2
00:00:05,500 --> 00:00:08,250
Todo bien.
`;

  it('agrega la cabecera WEBVTT, sin la cual se descarta entero', () => {
    expect(srtToVtt(srt).startsWith('WEBVTT\n\n')).toBe(true);
  });

  it('cambia la coma de los milisegundos por punto', () => {
    const vtt = srtToVtt(srt);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000');
    expect(vtt).toContain('00:00:05.500 --> 00:00:08.250');
    expect(vtt).not.toContain(',000');
  });

  it('conserva el texto y los acentos', () => {
    expect(srtToVtt(srt)).toContain('Hola, ¿cómo andás?');
  });

  it('quita el BOM, que rompe la deteccion de la cabecera', () => {
    const conBom = '﻿' + srt;
    const vtt = srtToVtt(conBom);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).not.toContain('﻿');
  });

  it('normaliza los saltos de linea de Windows', () => {
    const conCrlf = srt.replace(/\n/g, '\r\n');
    expect(srtToVtt(conCrlf)).not.toContain('\r');
  });

  it('completa los milisegundos cortos a tres digitos', () => {
    const corto = '1\n00:00:01,5 --> 00:00:04,25\nTexto\n';
    const vtt = srtToVtt(corto);
    expect(vtt).toContain('00:00:01.500 --> 00:00:04.250');
  });
});

describe('esVtt', () => {
  it('reconoce un WebVTT que ya viene listo', () => {
    expect(esVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHola')).toBe(true);
    expect(esVtt('﻿WEBVTT\n')).toBe(true);
  });

  it('no confunde un SRT con un VTT', () => {
    expect(esVtt('1\n00:00:01,000 --> 00:00:02,000\nHola')).toBe(false);
  });
});

describe('subtitleCandidates', () => {
  it('prueba primero el nombre exacto del video', () => {
    const candidatos = subtitleCandidates('Pelicula.mkv');
    expect(candidatos[0]).toBe('Pelicula.srt');
  });

  it('incluye las variantes de idioma que usan los sitios de descarga', () => {
    const candidatos = subtitleCandidates('Pelicula.mkv');
    expect(candidatos).toContain('Pelicula.es.srt');
    expect(candidatos).toContain('Pelicula.spa.srt');
    expect(candidatos).toContain('Pelicula.en.vtt');
  });

  it('funciona con nombres que tienen puntos adentro', () => {
    expect(subtitleCandidates('Serie.S01E02.1080p.mkv')[0]).toBe('Serie.S01E02.1080p.srt');
  });
});
