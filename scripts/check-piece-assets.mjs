import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = new URL('../public/pieces/chessnut/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8'));
assert.equal(manifest.commit, '2b8eaf14a31edad7e9deb53b1473e1d4857868a9');
assert.equal(manifest.license, 'Apache-2.0');
assert.equal(manifest.modified, false);
const expected = ['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP'].map((n) => `${n}.svg`);
assert.deepEqual(manifest.files.filter((f) => f.file.endsWith('.svg')).map((f) => f.file).sort(), expected.sort());
let bytes = 0;
for (const entry of manifest.files) {
  const body = await readFile(new URL(entry.file, base));
  assert.equal(body.length, entry.bytes);
  assert.equal(createHash('sha256').update(body).digest('hex'), entry.sha256);
  assert.ok(body.equals(await readFile(new URL(`../dist/pieces/chessnut/${entry.file}`, import.meta.url))), `built asset unchanged: ${entry.file}`);
  if (entry.file.endsWith('.svg')) {
    const svg = body.toString('utf8');
    assert.match(svg, /viewBox="0 0 800 800"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+=|(?:href|xlink:href)=["'](?:https?:|\/\/)|<!ENTITY/i);
    bytes += body.length;
  }
}
assert.match(await readFile(new URL('COPYRIGHT.txt', base), 'utf8'), /Copyright 2015 Alexis Luengas/);
assert.match(await readFile(new URL('LICENSE.txt', base), 'utf8'), /Apache License\s+Version 2\.0/);
const offline = JSON.parse(await readFile(new URL('../dist/offline-assets.json', import.meta.url), 'utf8'));
for (const name of expected) assert.ok(offline.includes(`/pieces/chessnut/${name}`));
console.log(`12 unmodified Chessnut SVGs: ${bytes} bytes total. SHA-256, Apache-2.0 notice, copyright, no active/external SVG content, built copies and offline cache coverage passed.`);
