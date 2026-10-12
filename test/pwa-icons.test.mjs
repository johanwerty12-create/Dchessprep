import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

for (const size of [192, 512]) {
  test(`original ${size}x${size} PWA PNG icon is valid and retains Chessdesk colors`, async () => {
    const bytes = await readFile(path.join(root, 'public', 'icons', `icon-${size}.png`));
    assert.deepEqual(bytes.subarray(0, 8), pngSignature);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.equal(bytes[24], 8, '8-bit channel depth');
    assert.equal(bytes[25], 6, 'RGBA color format');

    const chunks = [];
    let offset = 8;
    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const name = bytes.toString('ascii', offset + 4, offset + 8);
      if (name === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
      if (name === 'IEND') break;
    }
    const pixels = inflateSync(Buffer.concat(chunks));
    assert.equal(pixels.length, size * (1 + size * 4));
    let goldPixels = 0, backgroundPixels = 0, transparentPixels = 0;
    for (let y = 0; y < size; y++) {
      const row = y * (size * 4 + 1);
      assert.equal(pixels[row], 0, 'generator writes valid unfiltered scanlines');
      for (let x = 0; x < size; x++) {
        const p = row + 1 + x * 4;
        if (pixels[p + 3] === 0) transparentPixels++;
        if (pixels[p] === 0xe1 && pixels[p + 1] === 0xa7 && pixels[p + 2] === 0x6f && pixels[p + 3] === 255) goldPixels++;
        if (pixels[p] === 0x17 && pixels[p + 1] === 0x20 && pixels[p + 2] === 0x1d && pixels[p + 3] === 255) backgroundPixels++;
      }
    }
    assert.ok(goldPixels > size * size * 0.08, 'icon contains a substantial gold knight');
    assert.ok(backgroundPixels > size * size * 0.35, 'icon has its dark brand background');
    assert.ok(transparentPixels > 0, 'icon preserves rounded transparent corners');
  });
}
