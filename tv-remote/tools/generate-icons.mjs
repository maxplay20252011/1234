/**
 * Genera los iconos de la aplicacion sin dependencias externas.
 *
 * Se rasterizan con funciones de distancia y se codifican como PNG a mano
 * (zlib de Node + CRC32). Es preferible a sumar una libreria de imagenes al
 * proyecto para algo que se corre una sola vez.
 *
 *   node tools/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'web', 'public');

// ─── Codificacion PNG ────────────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** rgba: Uint8Array de size*size*4 */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // Cada scanline lleva adelante un byte de filtro; usamos 0 (sin filtro).
  const crudo = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const destino = y * (size * 4 + 1);
    crudo[destino] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(crudo, destino + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Dibujo ──────────────────────────────────────────────────────────────────

/** Distancia con signo a un rectangulo de esquinas redondeadas. */
function sdRectRedondeado(px, py, mitadX, mitadY, radio) {
  const qx = Math.abs(px) - mitadX + radio;
  const qy = Math.abs(py) - mitadY + radio;
  const fuera = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return fuera + Math.min(Math.max(qx, qy), 0) - radio;
}

const COLOR_FONDO_ARRIBA = [15, 23, 42];
const COLOR_FONDO_ABAJO = [2, 6, 23];
const COLOR_PANTALLA = [56, 189, 248];
const COLOR_ONDAS = [240, 249, 255];

/**
 * Icono: la silueta de una pantalla con las ondas de casteo en la esquina
 * inferior izquierda. Se dibuja sobre una grilla normalizada de 0 a 1 para que
 * cada tamanio salga identico.
 */
function pintar(size) {
  const SS = 4; // Supermuestreo: 4x4 muestras por pixel para bordes suaves.
  const rgba = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Coordenadas normalizadas centradas: -0.5 a 0.5
          const u = (x + (sx + 0.5) / SS) / size - 0.5;
          const v = (y + (sy + 0.5) / SS) / size - 0.5;

          // Fondo: degradado vertical suave.
          const t = v + 0.5;
          let cr = COLOR_FONDO_ARRIBA[0] + (COLOR_FONDO_ABAJO[0] - COLOR_FONDO_ARRIBA[0]) * t;
          let cg = COLOR_FONDO_ARRIBA[1] + (COLOR_FONDO_ABAJO[1] - COLOR_FONDO_ARRIBA[1]) * t;
          let cb = COLOR_FONDO_ARRIBA[2] + (COLOR_FONDO_ABAJO[2] - COLOR_FONDO_ARRIBA[2]) * t;

          // Contorno de la pantalla, apenas por encima del centro.
          const d = sdRectRedondeado(u, v + 0.03, 0.3, 0.21, 0.05);
          if (Math.abs(d) < 0.026) {
            [cr, cg, cb] = COLOR_PANTALLA;
          }

          // Ondas de casteo: arcos concentricos desde la esquina inferior
          // izquierda de la pantalla, mas un punto solido.
          const ox = u + 0.24;
          const oy = v + 0.03 - 0.14;
          const dist = Math.hypot(ox, oy);
          if (ox > -0.02 && oy < 0.02) {
            const enArco = (radio) => Math.abs(dist - radio) < 0.019;
            if (enArco(0.19) || enArco(0.115)) [cr, cg, cb] = COLOR_ONDAS;
          }
          if (dist < 0.035) [cr, cg, cb] = COLOR_ONDAS;

          r += cr;
          g += cg;
          b += cb;
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255; // Opaco: iOS no admite transparencia en el icono.
    }
  }
  return rgba;
}

mkdirSync(SALIDA, { recursive: true });
for (const size of [180, 192, 512]) {
  const archivo = join(SALIDA, `icon-${size}.png`);
  writeFileSync(archivo, encodePng(pintar(size), size));
  console.log(`  ${archivo}`);
}
console.log('Iconos generados.');
