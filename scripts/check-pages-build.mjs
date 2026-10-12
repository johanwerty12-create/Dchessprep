import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const stockfish = path.join(root, 'node_modules', 'stockfish', 'src');
const required = [
  'index.html', 'manifest.webmanifest', 'sw.js', 'offline-assets.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'engine/stockfish-18-lite-single.js',
  'engine/stockfish-18-lite-single.wasm', 'licenses/Stockfish-GPL-3.0.txt',
  'licenses/Stockfish-AUTHORS.txt', 'licenses/Stockfish-SOURCE.txt',
  'licenses/THIRD_PARTY_NOTICES.md',
];

for (const relative of required) await access(path.join(dist, relative));

const readDist = (relative) => readFile(path.join(dist, relative), 'utf8');
const index = await readDist('index.html');
const manifest = JSON.parse(await readDist('manifest.webmanifest'));
const sw = await readDist('sw.js');
const offlineAssets = JSON.parse(await readDist('offline-assets.json'));

assert.equal(manifest.start_url, '/', 'PWA starts at the Pages site root');
assert.equal(manifest.scope, '/', 'PWA scope covers the Pages site root');
assert.match(index, /href="\/manifest\.webmanifest"/, 'HTML links to the root manifest');
assert.match(index, /href="\/icons\/icon\.svg"/, 'HTML links to the root icon');
assert.match(index, /href="\/icons\/icon-192\.png"/, 'HTML links to the PNG touch icon');
assert.match(sw, /chessdesk-app-[a-f0-9]{12}/, 'built service worker has a content-versioned app cache');
assert.match(sw, /chessdesk-engine-[a-f0-9]{12}/, 'built service worker keys Stockfish cache to packaged engine bytes');
assert.doesNotMatch(sw, /__[A-Z_]+__/, 'all cache version placeholders were replaced');
assert.match(sw, /const SHELL = \['\/','\/index\.html','\/manifest\.webmanifest','\/icons\/icon\.svg'\]/, 'worker shell paths match the root deployment');
assert.match(sw, /pathname\.startsWith\('\/engine\/'\)/, 'worker handles same-origin engine files');

const localHtmlRefs = [...index.matchAll(/(?:src|href)="(\/[^"?#]*)"/g)].map((match) => match[1]);
for (const url of localHtmlRefs) {
  const relative = url === '/' ? 'index.html' : url.slice(1);
  await access(path.join(dist, relative));
}

assert.ok(Array.isArray(offlineAssets), 'offline asset manifest is an array');
assert.ok(offlineAssets.includes('/') && offlineAssets.includes('/index.html'), 'offline manifest includes the root shell');
assert.ok(offlineAssets.includes('/manifest.webmanifest') && offlineAssets.includes('/icons/icon.svg'), 'offline manifest includes PWA metadata');
for (const [size, filename] of [[192, 'icon-192.png'], [512, 'icon-512.png']]) {
  const icon = manifest.icons.find((item) => item.src === `/icons/${filename}` && item.sizes === `${size}x${size}` && item.type === 'image/png');
  assert.ok(icon, `manifest declares the ${size}x${size} PNG icon`);
  assert.ok(offlineAssets.includes(icon.src), `offline cache includes ${icon.src}`);
  const bytes = await readFile(path.join(dist, icon.src.slice(1)));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${icon.src} has a PNG signature`);
  assert.equal(bytes.readUInt32BE(16), size, `${icon.src} width matches manifest`);
  assert.equal(bytes.readUInt32BE(20), size, `${icon.src} height matches manifest`);
}
for (const url of offlineAssets) {
  assert.equal(typeof url, 'string');
  assert.ok(url.startsWith('/') && !url.startsWith('//') && !url.includes('..'), `safe same-origin offline URL: ${url}`);
  if (url.startsWith('/engine/')) continue;
  const relative = url === '/' ? 'index.html' : url.slice(1);
  await access(path.join(dist, relative));
}

const assets = await readdir(path.join(dist, 'assets'));
const builtBundles = assets.filter((entry) => /\.(?:js|css)$/.test(entry)).map((entry) => `/assets/${entry}`);
assert.ok(builtBundles.length >= 2, 'production JavaScript and CSS bundles exist');
for (const bundle of builtBundles) assert.ok(offlineAssets.includes(bundle), `offline cache includes ${bundle}`);
assert.equal(offlineAssets.some((url) => url.includes('/stockfish')), false, 'large engine files remain on-demand, outside app-shell installation');

for (const [file, size] of [
  ['stockfish-18-lite-single.js', 20_670],
  ['stockfish-18-lite-single.wasm', 7_295_411],
]) {
  const builtPath = path.join(dist, 'engine', file);
  const sourcePath = path.join(stockfish, file);
  const [built, source] = await Promise.all([readFile(builtPath), readFile(sourcePath)]);
  assert.equal((await stat(builtPath)).size, size, `pinned Stockfish 18 size for ${file}`);
  assert.ok(built.equals(source), `deployed Stockfish 18 asset is byte-identical: ${file}`);
  assert.ok(size < 25 * 1024 * 1024, `Cloudflare Pages per-file limit for ${file}`);
}
const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
assert.equal(vercel.framework, 'vite', 'Vercel uses its Vite build integration');
assert.equal(vercel.buildCommand, 'npm run build', 'Vercel runs the production build');
assert.equal(vercel.outputDirectory, 'dist', 'Vercel publishes only the static distribution');
assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === '/(.*)' && rewrite.destination === '/index.html'), 'Vercel serves the SPA shell for deep links');
const headerBySource = new Map(vercel.headers.map((rule) => [rule.source, new Map(rule.headers.map((header) => [header.key.toLowerCase(), header.value]))]));
assert.equal(headerBySource.get('/sw.js')?.get('cache-control'), 'no-cache', 'Vercel revalidates the service worker');
assert.equal(headerBySource.get('/offline-assets.json')?.get('cache-control'), 'no-cache', 'Vercel revalidates the offline manifest');
assert.equal(headerBySource.get('/manifest.webmanifest')?.get('content-type'), 'application/manifest+json', 'Vercel serves the PWA manifest MIME type');
assert.equal(headerBySource.get('/manifest.webmanifest')?.get('cache-control'), 'no-cache', 'Vercel revalidates manifest icon and metadata changes');
assert.equal(headerBySource.get('/engine/stockfish-18-lite-single.wasm')?.get('content-type'), 'application/wasm', 'Vercel serves streaming WebAssembly with the correct MIME type');
assert.equal(headerBySource.get('/engine/stockfish-18-lite-single.js')?.get('content-type'), 'text/javascript; charset=utf-8', 'Vercel serves the engine worker with a JavaScript MIME type');
assert.equal(headerBySource.get('/engine/stockfish-18-lite-single.wasm')?.get('cache-control'), 'no-cache', 'Vercel revalidates the same-URL engine binary for service-worker cache versioning');
assert.equal(headerBySource.get('/engine/stockfish-18-lite-single.js')?.get('cache-control'), 'no-cache', 'Vercel revalidates the same-URL engine worker for service-worker cache versioning');
for (const icon of ['/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png']) {
  assert.equal(headerBySource.get(icon)?.get('cache-control'), 'no-cache', `Vercel revalidates ${icon}`);
}
assert.equal(headerBySource.get('/icons/icon.svg')?.get('content-type'), 'image/svg+xml', 'Vercel serves the SVG mark with its image MIME type');
assert.equal(headerBySource.get('/icons/icon-192.png')?.get('content-type'), 'image/png', 'Vercel serves the 192px PNG with its image MIME type');
assert.equal(headerBySource.get('/icons/icon-512.png')?.get('content-type'), 'image/png', 'Vercel serves the 512px PNG with its image MIME type');
const engineCacheVersion = createHash('sha256')
  .update(await readFile(path.join(dist, 'engine', 'stockfish-18-lite-single.js')))
  .update(await readFile(path.join(dist, 'engine', 'stockfish-18-lite-single.wasm')))
  .digest('hex').slice(0, 12);
const expectedEngineCache = `chessdesk-engine-${engineCacheVersion}`;
assert.ok(sw.includes(expectedEngineCache), 'service-worker engine cache version matches the packaged Stockfish bytes');
const appBundle = await readDist(`assets/${assets.find((entry) => /\.js$/.test(entry))}`);
assert.ok(appBundle.includes(expectedEngineCache), 'application and service worker share one Stockfish cache');

assert.equal(await exists(path.join(dist, '404.html')), false, 'no custom 404 disables Pages automatic SPA fallback');
assert.equal(await exists(path.join(dist, 'functions')), false, 'static build has no Pages Functions/backend');
assert.equal(await exists(path.join(dist, '_worker.js')), false, 'static build has no custom Pages Worker');

console.log(`Static release package: ${required.length} required files present; ${offlineAssets.length} offline URLs resolve.`);
console.log('Root SPA and service-worker scope, versioned caches, PWA paths and Vercel response-header configuration: passed.');
console.log('Offline JS/CSS and exact Stockfish 18 JS/WASM asset verification passed.');
console.log('All files are under Cloudflare Pages per-file limit; no Pages Functions or custom Worker; root index preserves automatic SPA fallback.');
console.log('Static artifact checks only: HTTP headers, HTTPS deployment, and browser/service-worker behavior require a live Pages URL.');

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}
