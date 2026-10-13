import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const budgets = { javascript: 150 * 1024, css: 20 * 1024 };
const assetRefs = [
  ...[...html.matchAll(/<script\b[^>]*\bsrc="(\/assets\/[^\"]+\.js)"/g)].map((match) => ['javascript', match[1]]),
  ...[...html.matchAll(/<link\b[^>]*\bhref="(\/assets\/[^\"]+\.css)"/g)].map((match) => ['css', match[1]]),
];
assert.ok(assetRefs.some(([kind]) => kind === 'javascript'), 'production HTML references an initial JavaScript bundle');
assert.ok(assetRefs.some(([kind]) => kind === 'css'), 'production HTML references an initial CSS bundle');

const totals = { javascript: { raw: 0, gzip: 0 }, css: { raw: 0, gzip: 0 } };
for (const [kind, url] of assetRefs) {
  const file = path.resolve(dist, `.${url}`);
  assert.ok(file.startsWith(`${dist}${path.sep}`), `bundle path stays inside dist: ${url}`);
  const bytes = await readFile(file);
  totals[kind].raw += bytes.byteLength;
  totals[kind].gzip += gzipSync(bytes, { level: 9 }).byteLength;
}

for (const kind of ['javascript', 'css']) {
  const { raw, gzip } = totals[kind];
  const budget = budgets[kind];
  console.log(`${kind}: ${(raw / 1024).toFixed(1)} KiB raw, ${(gzip / 1024).toFixed(1)} KiB gzip (budget ${(budget / 1024).toFixed(0)} KiB)`);
  assert.ok(gzip <= budget, `initial ${kind} exceeds its ${Math.round(budget / 1024)} KiB gzip budget`);
  assert.ok((await stat(path.join(dist, `.${assetRefs.find(([type]) => type === kind)[1]}`))).size > 0);
}
console.log('Initial-route JavaScript and CSS performance budgets passed. Stockfish remains an on-demand, separately checked asset.');
