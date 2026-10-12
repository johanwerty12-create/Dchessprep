import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public', 'icons');
const supersampling = 4;
const knight = [
  [20, 48], [45, 48], [45, 44], [18, 44],
  { curve: [[18.5, 40.8], [20.8, 38.3], [24.2, 36.8]] },
  [27.9, 35.1], [24.7, 30.7], [29.4, 29.1], [28.2, 24.7],
  { curve: [[27.4, 21.5], [28, 18.5], [30.4, 15.8]] },
  [33.6, 12.2], [35.7, 17.8], [40.2, 16.2], [43.6, 24],
  { curve: [[45.8, 29.2], [45.1, 34.5], [41.5, 38.4]] },
  [37, 44], [45, 44], [45, 48], [20, 48],
];
const highlight = [
  [29.1, 28.2], [32.9, 27.1], [35.4, 23.9], [32.6, 21.5],
  { curve: [[30.9, 23.2], [30.1, 25.5], [29.1, 28.2]] },
];
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

await mkdir(output, { recursive: true });
for (const size of [192, 512]) {
  await writeFile(path.join(output, `icon-${size}.png`), renderPng(size));
}
console.log('Generated original Chessdesk icons at 192x192 and 512x512 from the bundled SVG design.');

function renderPng(size) {
  const rasterSize = size * supersampling;
  const scale = rasterSize / 64;
  const sampleCount = supersampling ** 2;
  const background = [0x17, 0x20, 0x1d, 255];
  const gold = [0xe1, 0xa7, 0x6f, 255];
  const polygon = flatten(knight);
  const shine = flatten(highlight);
  const raster = Buffer.alloc(rasterSize * rasterSize * 4);
  const raw = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < rasterSize; y++) {
    const py = (y + 0.5) / scale;
    let left = 0, right = 64;
    if (py < 16 || py > 48) {
      const cy = py < 16 ? 16 : 48;
      const inset = 16 - Math.sqrt(Math.max(0, 16 ** 2 - (py - cy) ** 2));
      left = inset;
      right = 64 - inset;
    }
    fillSpan(raster, rasterSize, y, Math.ceil(left * scale - 0.5), Math.ceil(right * scale - 0.5), background);
  }
  fillPolygon(raster, rasterSize, scale, polygon, gold);
  fillPolygon(raster, rasterSize, scale, shine, gold);
  fillCircle(raster, rasterSize, scale, 35.4, 20.4, 1.5, background);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let sy = 0; sy < supersampling; sy++) {
        for (let sx = 0; sx < supersampling; sx++) {
          const offset = (((y * supersampling + sy) * rasterSize) + (x * supersampling + sx)) * 4;
          red += raster[offset]; green += raster[offset + 1]; blue += raster[offset + 2]; alpha += raster[offset + 3];
        }
      }
      const offset = rowOffset + 1 + x * 4;
      raw[offset] = Math.round(red / sampleCount);
      raw[offset + 1] = Math.round(green / sampleCount);
      raw[offset + 2] = Math.round(blue / sampleCount);
      raw[offset + 3] = Math.round(alpha / sampleCount);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fillPolygon(raster, rasterSize, scale, polygon, color) {
  for (let y = 0; y < rasterSize; y++) {
    const py = (y + 0.5) / scale;
    const intersections = [];
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [x1, y1] = polygon[j];
      const [x2, y2] = polygon[i];
      if ((y1 > py) !== (y2 > py)) intersections.push(x1 + ((py - y1) * (x2 - x1)) / (y2 - y1));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const start = Math.ceil(intersections[i] * scale - 0.5);
      const end = Math.ceil(intersections[i + 1] * scale - 0.5);
      fillSpan(raster, rasterSize, y, start, end, color);
    }
  }
}

function fillCircle(raster, rasterSize, scale, cx, cy, radius, color) {
  const minY = Math.max(0, Math.floor((cy - radius) * scale));
  const maxY = Math.min(rasterSize, Math.ceil((cy + radius) * scale));
  for (let y = minY; y < maxY; y++) {
    const py = (y + 0.5) / scale;
    const dx = Math.sqrt(Math.max(0, radius ** 2 - (py - cy) ** 2));
    fillSpan(raster, rasterSize, y, Math.ceil((cx - dx) * scale - 0.5), Math.ceil((cx + dx) * scale - 0.5), color);
  }
}

function fillSpan(raster, rasterSize, y, start, end, color) {
  const from = Math.max(0, start);
  const to = Math.min(rasterSize, end);
  for (let x = from; x < to; x++) {
    const offset = (y * rasterSize + x) * 4;
    raster.set(color, offset);
  }
}

function flatten(commands) {
  const points = [];
  let current = commands[0];
  points.push(current);
  for (const command of commands.slice(1)) {
    if (Array.isArray(command)) {
      current = command;
      points.push(current);
      continue;
    }
    const [control1, control2, end] = command.curve;
    const start = current;
    for (let step = 1; step <= 32; step++) {
      const t = step / 32;
      const u = 1 - t;
      points.push([
        u ** 3 * start[0] + 3 * u ** 2 * t * control1[0] + 3 * u * t ** 2 * control2[0] + t ** 3 * end[0],
        u ** 3 * start[1] + 3 * u ** 2 * t * control1[1] + 3 * u * t ** 2 * control2[1] + t ** 3 * end[1],
      ]);
    }
    current = end;
  }
  return points;
}

function chunk(name, payload) {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const crcInput = Buffer.concat([type, payload]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, crcInput, checksum]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
